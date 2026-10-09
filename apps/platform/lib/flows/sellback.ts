import { getAddress, keccak256, recoverTypedDataAddress, stringToBytes, toHex, type Address, type Hex } from "viem";
import { sellbackAmount } from "@venue-rwa/shared";
import { readHolder, readSeries, venueSeriesAbi } from "../chain";
import { platformDb } from "../db";
import { sellBackTypes, seriesDomain, walletTypedData, type SellBackMessage } from "../eip712";
import { audit, cashBalance, getSeries, moveCash, needContract } from "../flow";
import { operatorSend } from "../operator";
import { activeBankAccount, isVerified, kycOf } from "./investor";

/**
 * Jual balik ke treasury (§3.7, §4.8): tidak dijamin. Hanya lot yang sudah terbuka, seri Active, harga p_ref × (1 − d),
 * dari cadangan buyback, dieksekusi per jendela secara FIFO. Investor tidak perlu mencari pembeli.
 */
export const SELLBACK_STATUS_LABEL: Record<string, string> = { AwaitingSignature: "Menunggu tanda tangan", Queued: "Dalam antrean", Executed: "Terlaksana", Cancelled: "Dibatalkan", Expired: "Kedaluwarsa", Failed: "Gagal" };
const REQUEST_DAYS = 30;

export const sellBackMessage = (r: any): SellBackMessage => ({ holder: getAddress(r.wallet), tokens: BigInt(r.tokens), paidIdr: BigInt(r.amount_idr), requestId: BigInt(r.request_no), deadline: BigInt(Math.floor(Date.parse(r.deadline) / 1000)) });

export async function requestSellBack(me: { userId: string; wallet: string | null }, seriesId: string, tokens: number) {
  if (!me.wallet) throw new Error("Wallet belum siap");
  if (!isVerified(await kycOf(me.userId))) throw new Error("KYC tidak aktif");
  if (!(await activeBankAccount(me.userId))) throw new Error("Rekening bank belum terdaftar");
  if (!Number.isInteger(tokens) || tokens < 1) throw new Error("Jumlah token minimal 1");
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const info = await readSeries(addr);
  if (info.state !== "Active") throw new Error(`Jual balik tidak berlaku saat seri ${info.state}`);
  const h = await readHolder(addr, info.token, getAddress(me.wallet));
  const { data: queued } = await platformDb().from("sellback_requests").select("tokens").eq("user_id", me.userId).eq("series_id", seriesId).in("status", ["AwaitingSignature", "Queued"]);
  const pending = (queued ?? []).reduce((a, r) => a + Number(r.tokens), 0);
  if (tokens + pending > Number(h.unlocked)) throw new Error(`Token yang sudah lewat masa kunci dan belum diajukan: ${Math.max(0, Number(h.unlocked) - pending)}`);
  const amount = sellbackAmount(tokens, Number(info.refPriceIdr), info.params.sellbackDiscountBps);
  const { data: r, error } = await platformDb().from("sellback_requests").insert({
    series_id: seriesId, user_id: me.userId, wallet: getAddress(me.wallet), tokens, amount_idr: amount, deadline: new Date(Date.now() + REQUEST_DAYS * 86_400_000).toISOString(),
  }).select("*").single();
  if (error) throw new Error(error.message);
  return { request: r, typed: walletTypedData("SellBack", sellBackTypes, seriesDomain(addr), sellBackMessage(r) as any) };
}

export async function signSellBack(me: { userId: string }, id: string, signature: Hex) {
  const pf = platformDb();
  const { data: r } = await pf.from("sellback_requests").select("*").eq("id", id).eq("user_id", me.userId).maybeSingle();
  if (!r || r.status !== "AwaitingSignature") throw new Error("Permintaan tidak ditemukan atau sudah ditandatangani");
  const addr = needContract(await getSeries(r.series_id));
  const signer = await recoverTypedDataAddress({ domain: seriesDomain(addr), types: sellBackTypes, primaryType: "SellBack", message: sellBackMessage(r) as any, signature });
  if (signer !== getAddress(r.wallet)) throw new Error("Tanda tangan bukan dari wallet Anda");
  await pf.from("sellback_requests").update({ signature, status: "Queued" }).eq("id", id);
  await audit(me.userId, "sellback.request", { entity: "sellback_requests", entityId: id, after: { tokens: r.tokens, amount: r.amount_idr } });
  return "Pengajuan masuk antrean jendela jual balik berikutnya. Tidak dijamin terlaksana.";
}

export async function cancelSellBack(userId: string, id: string) {
  const { data } = await platformDb().from("sellback_requests").update({ status: "Cancelled" }).eq("id", id).eq("user_id", userId).in("status", ["AwaitingSignature", "Queued"]).select("id");
  if (!data?.length) throw new Error("Permintaan tidak bisa dibatalkan");
}

/** Operator mengisi cadangan buyback dari modal SPV (simulasi). */
export async function fundBuybackReserve(seriesId: string, amount: number, actor: string) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Nominal tidak valid");
  if ((await cashBalance(seriesId, "spv_capital")) < amount) throw new Error("Modal SPV (simulasi) tidak cukup");
  await moveCash(seriesId, `buyback-fund-${seriesId}-${Date.now()}`, [["spv_capital", -amount], ["buyback_reserve", amount]]);
  await audit(actor, "buyback.fund", { entity: "series", entityId: seriesId, after: { amount } });
}

/** Jendela eksekusi: FIFO sampai dana cadangan habis. Sisa antrean lanjut ke jendela berikutnya (bukan gagal bayar). */
export async function runSellBackWindow(seriesId: string, actor: string) {
  const ctx = await getSeries(seriesId);
  const addr = needContract(ctx);
  const pf = platformDb();
  const { data: queue } = await pf.from("sellback_requests").select("*").eq("series_id", seriesId).eq("status", "Queued").order("created_at");
  let available = await cashBalance(seriesId, "buyback_reserve");
  let done = 0, paid = 0;
  for (const r of queue ?? []) {
    if (Date.parse(r.deadline) < Date.now()) { await pf.from("sellback_requests").update({ status: "Expired" }).eq("id", r.id); continue; }
    if (Number(r.amount_idr) > available) break; // FIFO: berhenti di pengajuan pertama yang belum terdanai
    try {
      const evidence = keccak256(toHex(stringToBytes(`buyback:${r.id}`)));
      const tx = await operatorSend(addr, venueSeriesAbi as any, "executeSellBack", [sellBackMessage(r), r.signature, evidence]);
      await pf.from("sellback_requests").update({ status: "Executed", executed_tx: tx }).eq("id", r.id);
      await pf.from("investor_ledger").insert({ user_id: r.user_id, series_id: seriesId, kind: "sellback", amount: Number(r.amount_idr), ref: `sellback:${r.id}` });
      await moveCash(seriesId, `sellback-${r.id}`, [["buyback_reserve", -Number(r.amount_idr)], ["distribution", Number(r.amount_idr)]]);
      available -= Number(r.amount_idr); done++; paid += Number(r.amount_idr);
    } catch (e: any) {
      await pf.from("sellback_requests").update({ status: "Failed", note: String(e?.shortMessage ?? e?.message ?? e).slice(0, 300) }).eq("id", r.id);
    }
  }
  await audit(actor, "sellback.window", { entity: "series", entityId: seriesId, after: { executed: done, paid } });
  const left = (queue ?? []).length - done;
  return `Jendela jual balik: ${done} terlaksana (Rp${paid.toLocaleString("id-ID")}); ${left > 0 ? `${left} masih mengantre` : "antrean kosong"}.`;
}

export type { Address };
