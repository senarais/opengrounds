import { verifyHashChain, utcDate, type LedgerEntry, type ReconException } from "@venue-rwa/shared";
import type { Hex } from "viem";

export interface SettledPaymentLike {
  bookingId: string;
  gross: number;
  fee: number;
  settledAt: string;
}

export interface ReconInput {
  companyId: string;
  entries: LedgerEntry[]; // urut menurut seq
  settled: SettledPaymentLike[];
  /** bookingId -> customer_ref (hash), untuk mendeteksi pola wash trading */
  customerRefs?: Map<string, string>;
  /** bookingId yang sengaja dibayar di luar jalur terverifikasi (tunai / QRIS statis): dicatat jujur, bukan exception, tetapi tidak dihitung terverifikasi. */
  offRail?: Set<string>;
}

export interface DayRecon {
  date: string;
  salesTotal: number; // dibukukan POS
  settledTotal: number; // dibayar & di-settle PSP
  unmatchedTotal: number;
  unmatchedCount: number;
  offRailTotal: number;
}

export interface ReconResult {
  days: DayRecon[];
  exceptions: Omit<ReconException, "id">[];
  salesTotal: number;
  settledTotal: number;
  unmatchedTotal: number;
  offRailTotal: number;
  /** settle di PSP ÷ (settle + di luar jalur + tanpa settlement). 1 bila tidak ada penjualan. */
  coverage: number;
  chainBrokenAt: number; // -1 = utuh
  clean: boolean;
}

/** Bandingkan buku POS vs settlement PSP. Hanya selisih tak terjelaskan jadi exception. */
export function reconcile(input: ReconInput): ReconResult {
  const settledBy = new Map(input.settled.map((s) => [s.bookingId, s]));
  const days = new Map<string, DayRecon & { unmatched: LedgerEntry[] }>();
  const day = (d: string) => {
    let x = days.get(d);
    if (!x) days.set(d, (x = { date: d, salesTotal: 0, settledTotal: 0, unmatchedTotal: 0, unmatchedCount: 0, offRailTotal: 0, unmatched: [] }));
    return x;
  };

  const exceptions: ReconResult["exceptions"] = [];

  for (const e of input.entries) {
    if (e.type !== "sale") continue;
    const d = day(utcDate(e.createdAt));
    d.salesTotal += e.amount;
    const s = e.bookingId ? settledBy.get(e.bookingId) : undefined;
    if (!s && e.bookingId && input.offRail?.has(e.bookingId)) {
      d.offRailTotal += e.amount; // dicatat jujur di luar jalur: bukan exception
    } else if (!s) {
      d.unmatchedTotal += e.amount;
      d.unmatchedCount += 1;
      d.unmatched.push(e);
    } else {
      d.settledTotal += s.gross;
      if (s.gross !== e.amount) {
        exceptions.push({ companyId: input.companyId, date: d.date, kind: "unexplained_gap", amount: e.amount - s.gross, explained: false });
      }
    }
  }

  for (const d of days.values()) {
    if (d.unmatched.length === 0) continue;
    // referensi pelanggan yang berulang >= 3x di hari yang sama => pola booking fiktif (wash)
    const counts = new Map<string, number>();
    for (const e of d.unmatched) {
      const ref = (e.bookingId && input.customerRefs?.get(e.bookingId)) || "?";
      counts.set(ref, (counts.get(ref) ?? 0) + 1);
    }
    let fictitious = 0;
    let cash = 0;
    for (const e of d.unmatched) {
      const ref = (e.bookingId && input.customerRefs?.get(e.bookingId)) || "?";
      if ((counts.get(ref) ?? 0) >= 3) fictitious += e.amount;
      else cash += e.amount;
    }
    if (fictitious > 0) exceptions.push({ companyId: input.companyId, date: d.date, kind: "fictitious_booking", amount: fictitious, explained: false });
    if (cash > 0) exceptions.push({ companyId: input.companyId, date: d.date, kind: "cash_outside_system", amount: cash, explained: false });
  }

  const chainBrokenAt = verifyHashChain(
    input.entries.map((e) => ({ ...e, prevHash: e.prevHash as Hex, hash: e.hash as Hex })),
    input.entries[0]?.prevHash as Hex | undefined,
  );
  if (chainBrokenAt >= 0) {
    const e = input.entries[chainBrokenAt]!;
    exceptions.push({ companyId: input.companyId, date: utcDate(e.createdAt), kind: "hash_chain_broken", amount: 0, explained: false });
  }

  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(({ unmatched: _u, ...rest }) => rest);
  const sum = (f: (d: DayRecon) => number) => list.reduce((a, d) => a + f(d), 0);
  return {
    days: list,
    exceptions: exceptions.sort((a, b) => a.date.localeCompare(b.date)),
    salesTotal: sum((d) => d.salesTotal),
    settledTotal: sum((d) => d.settledTotal),
    unmatchedTotal: sum((d) => d.unmatchedTotal),
    offRailTotal: sum((d) => d.offRailTotal),
    coverage: (() => { const settled = sum((d) => d.settledTotal), off = sum((d) => d.offRailTotal), un = sum((d) => d.unmatchedTotal); const t = settled + off + un; return t > 0 ? settled / t : 1; })(),
    chainBrokenAt,
    clean: exceptions.length === 0,
  };
}
