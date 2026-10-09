import { posDb } from "./db";

export interface HourlyOccupancy {
  /** 24 angka 0..1, indeks = jam WIB. Di luar jam buka = 0. */
  hours: number[];
  source: "pos" | "reported";
  note: string;
}

/** Bentuk hari tipikal venue olahraga (pagi sepi, puncak sore-malam). Hanya dipakai untuk ILUSTRASI bila belum ada data per jam. */
const TYPICAL = [0, 0, 0, 0, 0, 0, .25, .35, .35, .3, .3, .35, .4, .4, .4, .45, .6, .85, 1, 1, .95, .8, .55, .3];

/**
 * Okupansi per jam. Bila PoS punya booking 30 hari terakhir: (jumlah sesi terbayar pada jam itu) ÷ (hari × jumlah lapangan).
 * Bila belum: kurva tipikal yang diskalakan agar rata-ratanya sama dengan okupansi rata-rata yang DILAPORKAN owner, dan dilabeli begitu.
 */
export async function hourlyOccupancy(args: { companyId: string | null; openHour: number; closeHour: number; courts: number; reportedPct: number }): Promise<HourlyOccupancy> {
  const open = (h: number) => h >= args.openHour && h < args.closeHour;
  if (args.companyId) {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const pos = posDb();
    const [{ data: bookings }, { count: products }] = await Promise.all([
      pos.from("bookings").select("slot_start").eq("company_id", args.companyId).eq("source", "pos").in("status", ["paid", "completed"]).gte("slot_start", since),
      pos.from("products").select("id", { count: "exact", head: true }).eq("company_id", args.companyId).eq("active", true),
    ]);
    if ((bookings ?? []).length >= 10) {
      const counts = new Array(24).fill(0);
      for (const b of bookings!) counts[(new Date(b.slot_start).getUTCHours() + 7) % 24]++;
      const denom = 30 * Math.max(1, products ?? args.courts);
      return { hours: counts.map((c, h) => (open(h) ? Math.min(1, c / denom) : 0)), source: "pos", note: `Dari ${bookings!.length} booking terbayar di PoS, 30 hari terakhir.` };
    }
  }
  const shape = TYPICAL.map((v, h) => (open(h) ? v : 0));
  const openHours = shape.filter((_, h) => open(h));
  const mean = openHours.reduce((a, b) => a + b, 0) / Math.max(1, openHours.length);
  const k = mean > 0 ? args.reportedPct / 100 / mean : 0;
  return { hours: shape.map((v) => Math.min(1, v * k)), source: "reported", note: `Ilustrasi: pola hari tipikal yang diskalakan ke okupansi rata-rata ${args.reportedPct}% yang dilaporkan owner. Bukan data per jam.` };
}
