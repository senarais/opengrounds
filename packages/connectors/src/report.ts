import type { Hex } from "viem";
import { eligibleRevenue, merkleRoot, sessionsFor, verifyHashChain, type AppClient, type LedgerEntry } from "@venue-rwa/shared";
import { createSupabasePosSource } from "./index";

const DAY = 86_400_000;

/** Omzet eligible per jendela 30 hari mundur dari `asOf` (urut lama → baru). Hanya penjualan yang SETTLE di PSP yang dihitung.
 *  Jendela yang datanya belum penuh (sebelum entri pertama) dibuang, bukan dihitung nol. */
export function monthlyEligible(entries: LedgerEntry[], settledIds: Set<string>, asOf: Date, windows = 6) {
  const out: number[] = [];
  const first = entries.reduce((m, e) => Math.min(m, new Date(e.createdAt).getTime()), Infinity);
  for (let k = windows - 1; k >= 0; k--) {
    const lo = asOf.getTime() - (k + 1) * 30 * DAY;
    const hi = asOf.getTime() - k * 30 * DAY;
    if (lo < first - DAY) continue;
    let gross = 0, refunds = 0, taxes = 0, fees = 0, chargebacks = 0;
    for (const e of entries) {
      const t = new Date(e.createdAt).getTime();
      if (t < lo || t >= hi) continue;
      if (e.type === "sale" && e.bookingId && settledIds.has(e.bookingId)) gross += e.amount;
      else if (e.type === "refund") refunds += -e.amount;
      else if (e.type === "tax") taxes += e.amount;
      else if (e.type === "fee") fees += e.amount;
      else if (e.type === "chargeback") chargebacks += -e.amount;
    }
    out.push(eligibleRevenue({ settledGross: gross, refunds, chargebacks, taxes, gatewayFees: fees }));
  }
  return out;
}

/** Okupansi = sesi terpesan ÷ sesi tersedia (semua produk aktif), `days` hari ke belakang. */
export async function occupancy(db: AppClient, companyId: string, asOf: Date, days = 90) {
  const { data: products } = await db.from("products").select("open_hour, close_hour, session_minutes").eq("company_id", companyId).eq("active", true);
  const perDay = (products ?? []).reduce((a, p) => a + sessionsFor({ openHour: p.open_hour, closeHour: p.close_hour, sessionMinutes: p.session_minutes }).length, 0);
  const from = new Date(asOf.getTime() - days * DAY);
  const { count } = await db.from("bookings").select("*", { count: "exact", head: true }).eq("company_id", companyId).in("status", ["paid", "completed", "refunded"]).gte("slot_start", from.toISOString()).lt("slot_start", asOf.toISOString());
  const slots = perDay * days;
  return slots ? Math.min(1, (count ?? 0) / slots) : 0;
}

export function chainStatus(entries: LedgerEntry[]) {
  const broken = verifyHashChain(
    entries.map((e) => ({ ...e, prevHash: e.prevHash as Hex, hash: e.hash as Hex })),
    entries[0]?.prevHash as Hex | undefined,
  );
  return { ok: broken < 0, brokenAt: broken, count: entries.length };
}

/** Eligible Revenue dalam rentang [from, to): penjualan yang settle di PSP − refund − pajak − biaya gateway. */
export async function eligibleBetween(pos: AppClient, companyId: string, from: Date, to: Date) {
  const src = createSupabasePosSource(pos);
  const [entries, settled] = await Promise.all([
    src.listEntries(companyId, from, to),
    src.listSettledPayments(companyId, new Date(0), new Date(to.getTime() + DAY)),
  ]);
  const settledIds = new Set(settled.map((s) => s.bookingId));
  let gross = 0, refunds = 0, taxes = 0, fees = 0;
  for (const e of entries) {
    if (e.type === "sale" && e.bookingId && settledIds.has(e.bookingId)) gross += e.amount;
    else if (e.type === "refund") refunds += -e.amount;
    else if (e.type === "tax") taxes += e.amount;
    else if (e.type === "fee") fees += e.amount;
  }
  return { eligible: eligibleRevenue({ settledGross: gross, refunds, chargebacks: 0, taxes, gatewayFees: fees }), gross, refunds, taxes, fees, entries, settled };
}

/** Hitung dan simpan Merkle root satu hari (UTC). Bukti tidak diubah, bukan bukti benar. */
export async function computeDailyRoot(db: AppClient, companyId: string, date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + DAY);
  const hashes: Hex[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("ledger_entries").select("hash").eq("company_id", companyId).gte("created_at", start.toISOString()).lt("created_at", end.toISOString()).order("seq").range(from, from + 999);
    if (error) throw new Error(error.message);
    hashes.push(...((data ?? []).map((r) => r.hash) as Hex[]));
    if (!data || data.length < 1000) break;
  }
  const root = merkleRoot(hashes);
  const { error } = await db.from("daily_roots").upsert({ company_id: companyId, date, merkle_root: root, entry_count: hashes.length }, { onConflict: "company_id,date" });
  if (error) throw new Error(error.message);
  return { root, count: hashes.length };
}
