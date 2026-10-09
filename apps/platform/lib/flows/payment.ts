import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import { readSeries, seriesAbi } from "../chain";
import { platformDb } from "../db";
import { audit, chainRef, getCtx, refOf, type Ctx } from "../flow";
import { operatorSend } from "../operator";
import { xenditClient, type PspClient } from "../psp";
import { allowOnchain, isKycVerified } from "./investor";

const INVOICE_SECONDS = 30 * 60;
const STALE_CLAIM_MS = 3 * 60_000;
const rp = (n: number | bigint) => "Rp" + Number(n).toLocaleString("id-ID");

/** Token yang sudah "dipesan" pembelian lain yang masih menunggu bayar, supaya tidak terjual melebihi cap. */
async function reservedUnits(ctx: Ctx): Promise<bigint> {
  const { data } = await ctx.pf.from("purchases").select("units, status, expires_at").eq("series_id", ctx.series.id).in("status", ["pending", "paid", "mint_failed"]);
  const now = Date.now();
  return (data ?? []).filter((p) => p.status !== "pending" || (p.expires_at && Date.parse(p.expires_at) > now)).reduce((a, p) => a + BigInt(p.units), 0n);
}

/**
 * Mulai pembelian: buat tagihan di payment gateway dan kembalikan URL halaman bayarnya.
 * Token BELUM di-mint; itu terjadi di settlePurchase setelah gateway mengonfirmasi PAID.
 */
export async function startPurchase(ctx: Ctx, wallet: Address, units: number, returnBase: string, psp: PspClient = xenditClient()) {
  const ref = chainRef(ctx);
  if (ctx.series.status === "Superseded") throw new Error("Seri ini sudah digantikan seri baru; beli di penawaran terbaru");
  const s = await readSeries(ref);
  if (s.state !== "Offering") throw new Error(`Penawaran tidak sedang dibuka (status ${s.state})`);
  if (!s.attValid) throw new Error("Attestation tidak valid: pembelian ditolak");
  if (!Number.isInteger(units) || units < 1) throw new Error("Jumlah token minimal 1");
  const reserved = await reservedUnits(ctx);
  if (BigInt(units) + BigInt(s.minted) + reserved > BigInt(s.cap)) throw new Error(`Melebihi cap: sisa ${(BigInt(s.cap) - BigInt(s.minted) - reserved).toString()} token (termasuk pesanan lain yang menunggu pembayaran)`);
  if (!(await isKycVerified(wallet))) throw new Error("Selesaikan KYC di halaman Portofolio dulu.");

  const id = randomUUID();
  const amount = units * Number(s.unitPrice);
  const { error } = await ctx.pf.from("purchases").insert({
    id, series_id: ctx.series.id, wallet, units, amount, payment_ref: refOf(`XND-PAY-${id}`), related_party: false, simulated: false,
    status: "pending", expires_at: new Date(Date.now() + INVOICE_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  try {
    const inv = await psp.createInvoice({ amount, reference: `buy-${id}`, description: `${units} token ${ctx.series.token_symbol ?? ""} · ${ctx.venue.name}`.slice(0, 200), returnUrl: `${returnBase}/portfolio?pay=${id}`, seconds: INVOICE_SECONDS });
    await ctx.pf.from("purchases").update({ psp_ref: inv.pspRef, psp_url: inv.checkoutUrl }).eq("id", id);
    await audit("platform", "purchase.invoice", { series: ctx.series.id, wallet, units, amount, invoice: inv.pspRef });
    return { id, url: inv.checkoutUrl, amount };
  } catch (e) {
    await ctx.pf.from("purchases").delete().eq("id", id);
    throw e;
  }
}

export type SettleResult = "minted" | "pending" | "expired" | "processing";

/**
 * Selesaikan pembelian bila gateway menyatakan PAID: mint token ke wallet investor. Aman dipanggil berulang dan dari banyak tempat
 * (halaman setelah bayar, webhook, Portofolio): hanya satu pemanggil yang "mengklaim" pembelian, dan kontrak menolak payment_ref yang dipakai ulang.
 */
export async function settlePurchase(id: string, psp: PspClient = xenditClient()): Promise<SettleResult> {
  const pf = platformDb();
  const { data: p } = await pf.from("purchases").select("*").eq("id", id).maybeSingle();
  if (!p) throw new Error("Pembelian tidak ditemukan");
  if (p.status === "minted") return "minted";
  if (p.status === "expired") return "expired";
  if (!p.psp_ref) return "pending";
  if (p.status === "pending") {
    const st = await psp.status(p.psp_ref);
    if (st === "expired") { await pf.from("purchases").update({ status: "expired", status_at: new Date().toISOString() }).eq("id", id).eq("status", "pending"); return "expired"; }
    if (st === "pending") return "pending";
  }
  const now = new Date().toISOString();
  let { data: claimed } = await pf.from("purchases").update({ status: "paid", status_at: now }).eq("id", id).in("status", ["pending", "mint_failed"]).select("id");
  if (!claimed?.length) {
    // pemanggil lain sedang memproses; ambil alih hanya bila macet (>3 menit)
    ({ data: claimed } = await pf.from("purchases").update({ status_at: now }).eq("id", id).eq("status", "paid").lt("status_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString()).select("id"));
    if (!claimed?.length) return "processing";
  }
  try {
    const ctx = await getCtx(p.series_id);
    const cref = chainRef(ctx);
    const s = await readSeries(cref);
    if (s.state !== "Offering") throw new Error(`Penawaran sudah tidak dibuka (status ${s.state}) padahal pembayaran sudah diterima; perlu pengembalian dana manual`);
    await allowOnchain(ctx, p.wallet as Address);
    const tx = await operatorSend(cref.series, seriesAbi as any, "recordPurchase", [p.wallet, BigInt(p.units), p.payment_ref, false]);
    await pf.from("purchases").update({ status: "minted", status_at: new Date().toISOString(), mint_tx: tx, custody_confirmed_at: new Date().toISOString(), note: null }).eq("id", id);
    const ref = `xendit-${p.psp_ref}`;
    const { data: dup } = await pf.from("custody_ledger").select("id").eq("series_id", p.series_id).eq("ref", ref).limit(1);
    if (!dup?.length) await pf.from("custody_ledger").insert({ series_id: p.series_id, account: "escrow", amount: p.amount, ref, simulated: true });
    await audit("platform", "purchase", { series: p.series_id, wallet: p.wallet, units: p.units, amount: p.amount, tx, invoice: p.psp_ref });
    return "minted";
  } catch (e: any) {
    await pf.from("purchases").update({ status: "mint_failed", status_at: new Date().toISOString(), note: String(e?.shortMessage ?? e?.message ?? e).slice(0, 400) }).eq("id", id);
    throw e;
  }
}

/** Sinkronkan semua pembelian investor yang belum selesai; mengembalikan pesan ringkas untuk ditampilkan. */
export async function settleWalletPurchases(wallet: string, psp?: PspClient): Promise<{ ok?: string; err?: string }> {
  const { data } = await platformDb().from("purchases").select("id, units, amount").eq("wallet", wallet).in("status", ["pending", "paid", "mint_failed"]);
  let units = 0, amount = 0; const errs: string[] = [];
  for (const p of data ?? []) {
    try { if ((await settlePurchase(p.id, psp)) === "minted") { units += Number(p.units); amount += Number(p.amount); } }
    catch (e: any) { errs.push(e?.message ?? String(e)); }
  }
  return { ok: units ? `Pembayaran ${rp(amount)} diterima payment gateway: ${units.toLocaleString("id-ID")} token sudah masuk ke wallet Anda.` : undefined, err: errs[0] };
}
