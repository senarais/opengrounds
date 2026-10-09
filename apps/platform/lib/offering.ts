import { readSeries } from "./chain";
import { posDb } from "./db";
import { getCtx, listSeries } from "./flow";

/** Data satu penawaran (untuk halaman detail & landing). Null bila seri tidak ada. */
export async function loadOffering(seriesId?: string | null) {
  try {
    const ctx = await getCtx(seriesId);
    const { venue, series, pf } = ctx;
    const [s, { data: run }, anchored] = await Promise.all([
      ctx.ref ? readSeries(ctx.ref) : Promise.resolve(null),
      pf.from("verification_runs").select("*").eq("series_id", series.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ctx.companyId ? posDb().from("daily_roots").select("date").eq("company_id", ctx.companyId).not("anchored_tx", "is", null) : Promise.resolve({ data: [] as { date: string }[] }),
    ]);
    return { ctx, venue, series, s, run, anchoredDays: anchored.data?.length ?? 0 };
  } catch {
    return null;
  }
}
export type OfferingData = NonNullable<Awaited<ReturnType<typeof loadOffering>>>;

/** Daftar penawaran untuk marketplace: seri dengan kontrak, beserta status on-chain. */
export async function listOfferings() {
  const all = (await listSeries()).filter((x) => x.series.contract_address && x.series.token_address);
  return Promise.all(all.map(async ({ series, venue }) => {
    let s = null;
    try { s = await readSeries({ series: series.contract_address, token: series.token_address }); } catch { /* RPC gagal: tampilkan tanpa status */ }
    return { series, venue, s };
  }));
}

export const STATE_STEPS = ["Verifikasi", "Penawaran", "Terdanai", "Aktif", "Selesai"];
/** Petakan status on-chain ke langkah stepper. */
export function stateStep(state: string): { current: number; failed: boolean } {
  switch (state) {
    case "Draft": return { current: 0, failed: false };
    case "Offering": return { current: 1, failed: false };
    case "Failed": return { current: 1, failed: true };
    case "Funded": return { current: 2, failed: false };
    case "Active": return { current: 3, failed: false };
    default: return { current: 4, failed: false };
  }
}
