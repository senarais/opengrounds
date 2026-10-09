import { getAddress, keccak256, recoverTypedDataAddress, stringToBytes, toHex, type Address, type Hex } from "viem";
import { readSeries, venueSeriesAbi } from "../chain";
import { platformDb } from "../db";
import { orderTypes, seriesDomain, walletTypedData, type OrderMessage } from "../eip712";
import { audit, getSeries, moveCash, needContract } from "../flow";
import { operatorSend } from "../operator";
import { provider, providerFor } from "../psp";
import { balanceOf } from "./cash";
import { allowOnchain, assertCanBuy } from "./investor";

/** Pesanan berlaku 2 jam sejak dibuat (tanda tangan investor + pembayaran); tagihan gateway 30 menit. */
const ORDER_SECONDS = 2 * 3600;
const INVOICE_SECONDS = 30 * 60;
const STALE_CLAIM_MS = 3 * 60_000;
const OPEN = ["AWAITING_SIGNATURE", "AWAITING_PAYMENT", "PAID"];

export const ORDER_STATUS_LABEL: Record<string, string> = {
  AWAITING_SIGNATURE: "Menunggu tanda tangan", AWAITING_PAYMENT: "Menunggu pembayaran", PAID: "Dibayar, token sedang dialokasikan",
  ALLOCATED: "Token masuk", EXPIRED: "Kedaluwarsa", CANCELLED: "Dibatalkan", FAILED: "Gagal",
};

export function orderMessage(o: any): OrderMessage {
  return { investor: getAddress(o.wallet), tokens: BigInt(o.tokens), paidIdr: BigInt(o.amount_idr), orderId: BigInt(o.order_no), deadline: BigInt(Math.floor(Date.parse(o.deadline) / 1000)) };
}
export const orderTypedJson = (o: any, series: Address) => walletTypedData("Order", orderTypes, seriesDomain(series), orderMessage(o) as any);

/** Token treasury yang sudah dipesan pesanan lain yang masih berjalan. */
async function reserved(seriesId: string): Promise<number> {
  const { data } = await platformDb().from("orders").select("tokens, status, deadline").eq("series_id", seriesId).in("status", OPEN);
  return (data ?? []).filter((o) => o.status === "PAID" || Date.parse(o.deadline) > Date.now()).reduce((a, o) => a + Number(o.tokens), 0);
}

/**
 * Buat pesanan: jumlah token dan nominal (= token × harga referensi on-chain). Investor lalu menandatanganinya di wallet Privy.
 * `funding = "balance"` = reinvest dari saldo (§3.6.3): tanpa gateway, saldo didebit saat pesanan ditandatangani.
 */
export async function createOrder(me: { userId: string; wallet: string | null }, seriesId: string, tokens: number, funding: "payment" | "balance") {
  await assertCanBuy(me);
  if (!Number.isInteger(tokens) || tokens < 1) throw new Error("Jumlah token minimal 1");
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const info = await readSeries(addr);
  if (info.state !== "Active") throw new Error(`Seri berstatus ${info.state}: pembelian hanya saat Active`);
  const available = Number(info.treasuryBalance) - (await reserved(seriesId));
  if (tokens > available) throw new Error(`Token tersedia di treasury: ${Math.max(0, available).toLocaleString("id-ID")}`);
  const amount = tokens * Number(info.refPriceIdr);
  if (funding === "balance" && (await balanceOf(me.userId)) < amount) throw new Error("Saldo tidak cukup untuk reinvest sebesar ini");
  const { data: o, error } = await platformDb().from("orders").insert({
    series_id: seriesId, user_id: me.userId, wallet: me.wallet, tokens, amount_idr: amount, ref_price: Number(info.refPriceIdr), funding,
    deadline: new Date(Date.now() + ORDER_SECONDS * 1000).toISOString(),
  }).select("*").single();
  if (error) throw new Error(error.message);
  return { order: o, typed: orderTypedJson(o, addr) };
}

/** Simpan tanda tangan investor (dicek: penanda tangan = wallet pemesan), lalu tagih lewat gateway atau debit saldo. */
export async function signOrder(me: { userId: string }, orderId: string, signature: Hex, returnBase: string) {
  const pf = platformDb();
  const { data: o } = await pf.from("orders").select("*").eq("id", orderId).eq("user_id", me.userId).maybeSingle();
  if (!o) throw new Error("Pesanan tidak ditemukan");
  if (o.status !== "AWAITING_SIGNATURE") throw new Error(`Pesanan berstatus ${ORDER_STATUS_LABEL[o.status]}`);
  if (Date.parse(o.deadline) < Date.now()) { await setStatus(o.id, "EXPIRED"); throw new Error("Pesanan kedaluwarsa; buat ulang"); }
  const ctx = await getSeries(o.series_id);
  const addr = needContract(ctx);
  const signer = await recoverTypedDataAddress({ domain: seriesDomain(addr), types: orderTypes, primaryType: "Order", message: orderMessage(o) as any, signature });
  if (signer !== getAddress(o.wallet)) throw new Error("Tanda tangan bukan dari wallet Anda");

  if (o.funding === "balance") {
    if ((await balanceOf(me.userId)) < Number(o.amount_idr)) throw new Error("Saldo tidak cukup");
    await pf.from("investor_ledger").insert({ user_id: me.userId, series_id: o.series_id, kind: "reinvest", amount: -Number(o.amount_idr), ref: `order:${o.id}` });
    await pf.from("orders").update({ signature, status: "PAID", paid_at: new Date().toISOString(), status_at: new Date().toISOString() }).eq("id", o.id);
    await moveCash(o.series_id, `reinvest-${o.id}`, [["distribution", -Number(o.amount_idr)], ["spv_capital", Number(o.amount_idr)]]);
    await allocate(o.id);
    return { allocated: true as const };
  }
  const psp = provider();
  const inv = await psp.createCharge({ amount: Number(o.amount_idr), reference: `order-${o.order_no}`, description: `${o.tokens} token ${ctx.series.symbol} · ${ctx.venue.name}`.slice(0, 200), returnUrl: `${returnBase}/portfolio?order=${o.id}`, seconds: INVOICE_SECONDS });
  await pf.from("orders").update({ signature, status: "AWAITING_PAYMENT", psp_ref: inv.pspRef, psp_url: inv.checkoutUrl, status_at: new Date().toISOString() }).eq("id", o.id);
  await audit(me.userId, "order.signed", { entity: "orders", entityId: o.id, after: { tokens: o.tokens, amount: o.amount_idr, psp: psp.name } });
  return { allocated: false as const, url: inv.checkoutUrl };
}

/** Cek pembayaran di gateway; bila lunas, alokasikan. Aman dipanggil berulang (webhook, halaman kembali, polling). */
export async function settleOrder(orderId: string): Promise<string> {
  const pf = platformDb();
  const { data: o } = await pf.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) throw new Error("Pesanan tidak ditemukan");
  if (o.status === "AWAITING_PAYMENT" && o.psp_ref) {
    const st = await providerFor(o.psp_ref).status(o.psp_ref);
    if (st === "expired") { await setStatus(o.id, "EXPIRED", "AWAITING_PAYMENT"); return "EXPIRED"; }
    if (st === "pending") return "AWAITING_PAYMENT";
    const { data: claimed } = await pf.from("orders").update({ status: "PAID", paid_at: new Date().toISOString(), status_at: new Date().toISOString() }).eq("id", o.id).eq("status", "AWAITING_PAYMENT").select("id");
    if (claimed?.length) await moveCash(o.series_id, `order-${o.order_no}`, [["escrow", Number(o.amount_idr)]]);
  }
  const { data: now } = await pf.from("orders").select("status").eq("id", orderId).single();
  if (now?.status === "PAID") return allocate(orderId);
  return now?.status ?? "?";
}

/**
 * Eksekusi on-chain: `allocate` dengan pesanan + tanda tangan investor. Kontrak memeriksa ulang tanda tangan, nominal,
 * allowlist, kedaluwarsa, dan saldo treasury. Hanya satu pemanggil yang mengklaim (status_at) supaya tidak dobel kirim.
 */
async function allocate(orderId: string): Promise<string> {
  const pf = platformDb();
  const stale = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: claimed } = await pf.from("orders").update({ claimed_at: new Date().toISOString() }).eq("id", orderId).eq("status", "PAID").or(`claimed_at.is.null,claimed_at.lt.${stale}`).select("*");
  const o = claimed?.[0];
  if (!o) {
    const { data: cur } = await pf.from("orders").select("status").eq("id", orderId).single();
    return cur?.status === "PAID" ? "PAID" : (cur?.status ?? "?"); // PAID = pemanggil lain sedang mengeksekusi
  }
  try {
    const ctx = await getSeries(o.series_id);
    const addr = needContract(ctx);
    await allowOnchain(addr, ctx.series.token_address, getAddress(o.wallet));
    const evidence = keccak256(toHex(stringToBytes(o.funding === "balance" ? `balance:${o.id}` : `psp:${o.psp_ref}`)));
    const tx = await operatorSend(addr, venueSeriesAbi as any, "allocate", [[orderMessage(o)], [o.signature], evidence]);
    await pf.from("orders").update({ status: "ALLOCATED", allocated_tx: tx, status_at: new Date().toISOString(), note: null }).eq("id", o.id);
    if (o.funding === "payment") await moveCash(o.series_id, `alloc-${o.order_no}`, [["escrow", -Number(o.amount_idr)], ["spv_capital", Number(o.amount_idr)]]);
    await audit("platform", "order.allocated", { entity: "orders", entityId: o.id, after: { tx, tokens: o.tokens, wallet: o.wallet } });
    return "ALLOCATED";
  } catch (e: any) {
    const msg = String(e?.shortMessage ?? e?.message ?? e).slice(0, 400);
    // gagal permanen (kontrak menolak) vs sementara (RPC): yang sementara tetap PAID untuk dicoba ulang
    const permanent = /Kontrak menolak|reverted|OrderExpired|OrderUsed|BadPrice|InsufficientTreasury/i.test(msg);
    await pf.from("orders").update({ status: permanent ? "FAILED" : "PAID", note: msg, claimed_at: null, status_at: new Date().toISOString() }).eq("id", o.id);
    if (permanent && o.funding === "balance") {
      await pf.from("investor_ledger").insert({ user_id: o.user_id, series_id: o.series_id, kind: "adjustment", amount: Number(o.amount_idr), ref: `order-reversal:${o.id}` });
      await moveCash(o.series_id, `reinvest-reversal-${o.id}`, [["spv_capital", -Number(o.amount_idr)], ["distribution", Number(o.amount_idr)]]);
    }
    throw e;
  }
}

/** Batalkan sebelum pembayaran ter-attest. Bila ternyata sudah dibayar, pesanan diproses, bukan dibatalkan. */
export async function cancelOrder(userId: string, orderId: string) {
  const pf = platformDb();
  const { data: o } = await pf.from("orders").select("*").eq("id", orderId).eq("user_id", userId).maybeSingle();
  if (!o) throw new Error("Pesanan tidak ditemukan");
  if (o.status === "AWAITING_PAYMENT") {
    if ((await settleOrder(o.id)) !== "AWAITING_PAYMENT") throw new Error("Pembayaran sudah diterima; pesanan tidak bisa dibatalkan");
    await providerFor(o.psp_ref).expire(o.psp_ref);
  } else if (o.status !== "AWAITING_SIGNATURE") throw new Error("Pesanan ini tidak bisa dibatalkan");
  await setStatus(o.id, "CANCELLED", o.status);
}

/** Pesanan yang lewat batas waktu tanpa pembayaran: kedaluwarsa (dana tidak pernah masuk, jadi tidak ada yang dikembalikan). */
export async function expireStale(userId?: string) {
  const pf = platformDb();
  let q = pf.from("orders").select("id, status, psp_ref").in("status", ["AWAITING_SIGNATURE", "AWAITING_PAYMENT"]).lt("deadline", new Date().toISOString());
  if (userId) q = q.eq("user_id", userId);
  const { data } = await q;
  for (const o of data ?? []) {
    if (o.status === "AWAITING_PAYMENT" && (await settleOrder(o.id).catch(() => "?")) !== "EXPIRED") continue;
    await setStatus(o.id, "EXPIRED", o.status);
  }
}

/** Selesaikan semua pesanan investor yang masih berjalan (dipanggil saat membuka Portofolio). */
export async function syncOrders(userId: string) {
  await expireStale(userId);
  const { data } = await platformDb().from("orders").select("id").eq("user_id", userId).in("status", ["AWAITING_PAYMENT", "PAID"]);
  const errs: string[] = [];
  for (const o of data ?? []) await settleOrder(o.id).catch((e) => errs.push(String(e?.message ?? e)));
  return errs;
}

async function setStatus(id: string, status: string, from?: string) {
  let q = platformDb().from("orders").update({ status, status_at: new Date().toISOString() }).eq("id", id);
  if (from) q = q.eq("status", from);
  await q;
}

export async function orderByPspRef(pspRef: string) {
  const { data } = await platformDb().from("orders").select("id").eq("psp_ref", pspRef).maybeSingle();
  return data?.id as string | undefined;
}
