import type { Hex } from "viem";
import { LedgerEntry, merkleProof, merkleRoot, utcDate, verifyMerkleProof, type AppClient } from "@venue-rwa/shared";

/** Antarmuka sumber booking. POS kita = implementasi referensi; POS lain masuk lewat sini. */
export interface BookingSource {
  listEntries(companyId: string, from: Date, to: Date): Promise<LedgerEntry[]>;
  getDailyRoot(companyId: string, date: string): Promise<{ root: string; count: number }>;
  verifyEntry(entryId: string): Promise<{ ok: boolean; proof: string[] }>;
}

export interface SettledPayment {
  bookingId: string;
  gross: number;
  fee: number;
  settledAt: string;
}

type Row = Record<string, any>;
const toEntry = (r: Row): LedgerEntry => ({
  id: r.id,
  companyId: r.company_id,
  type: r.type,
  amount: Number(r.amount),
  bookingId: r.booking_id,
  createdAt: new Date(r.created_at).toISOString(),
  prevHash: r.prev_hash,
  hash: r.hash,
});

async function pageAll(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: any }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function createSupabasePosSource(db: AppClient): BookingSource & {
  listSettledPayments(companyId: string, from: Date, to: Date): Promise<SettledPayment[]>;
} {
  async function dayEntries(companyId: string, date: string) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 86_400_000);
    const rows = await pageAll((a, b) =>
      db.from("ledger_entries").select("*").eq("company_id", companyId).gte("created_at", start.toISOString()).lt("created_at", end.toISOString()).order("seq").range(a, b),
    );
    return rows.map(toEntry);
  }

  return {
    async listEntries(companyId, from, to) {
      const rows = await pageAll((a, b) =>
        db.from("ledger_entries").select("*").eq("company_id", companyId).gte("created_at", from.toISOString()).lt("created_at", to.toISOString()).order("seq").range(a, b),
      );
      return rows.map(toEntry);
    },

    async getDailyRoot(companyId, date) {
      const { data } = await db.from("daily_roots").select("merkle_root, entry_count").eq("company_id", companyId).eq("date", date).maybeSingle();
      if (data) return { root: data.merkle_root, count: data.entry_count };
      const entries = await dayEntries(companyId, date);
      return { root: merkleRoot(entries.map((e) => e.hash as Hex)), count: entries.length };
    },

    async verifyEntry(entryId) {
      const { data: row } = await db.from("ledger_entries").select("*").eq("id", entryId).maybeSingle();
      if (!row) return { ok: false, proof: [] };
      const e = toEntry(row);
      const date = utcDate(e.createdAt);
      const entries = await dayEntries(e.companyId, date);
      const leaves = entries.map((x) => x.hash as Hex);
      const idx = leaves.indexOf(e.hash as Hex);
      if (idx < 0) return { ok: false, proof: [] };
      const proof = merkleProof(leaves, idx);
      const { root } = await this.getDailyRoot(e.companyId, date);
      return { ok: verifyMerkleProof(proof, root as Hex, e.hash as Hex), proof };
    },

    async listSettledPayments(companyId, from, to) {
      const rows = await pageAll((a, b) =>
        db
          .from("payments")
          .select("booking_id, gross, fee, settled_at")
          .eq("company_id", companyId)
          .in("status", ["settled", "refunded"])
          .gte("settled_at", from.toISOString())
          .lt("settled_at", to.toISOString())
          .range(a, b),
      );
      return rows.map((r) => ({ bookingId: r.booking_id, gross: Number(r.gross), fee: Number(r.fee), settledAt: new Date(r.settled_at).toISOString() }));
    },
  };
}

export * from "./report";
