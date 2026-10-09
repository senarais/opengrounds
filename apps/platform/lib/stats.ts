import { createSupabasePosSource, monthlyEligible, occupancy } from "@venue-rwa/connectors";
import { utcDate, type AppClient } from "@venue-rwa/shared";
import { evaluatePolicy, reconcile, type PolicyResult, type ReconResult } from "@venue-rwa/verification";

const DAY = 86_400_000;

async function pageAll(build: (a: number, b: number) => PromiseLike<{ data: any[] | null; error: any }>) {
  const out: any[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await build(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadEntries(db: AppClient, companyId: string, from: Date, to: Date) {
  return createSupabasePosSource(db).listEntries(companyId, from, to);
}

export interface VerificationOutcome {
  asOf: string;
  policy: PolicyResult;
  recon: ReconResult;
  openExceptionWindowDays: number;
  monthly: number[];
  occupancy: number;
  entryCount: number;
}

/** Jalankan rekonsiliasi + policy engine (deterministik) untuk satu venue pada waktu `asOf`. */
export async function runVerification(
  pos: AppClient,
  companyId: string,
  asOf: Date,
  dossier: any,
  proposed: { target: number; unitPrice: number; shareBps: number; tenorDays: number },
  docChecks?: import("@venue-rwa/verification").DocCheck[],
): Promise<VerificationOutcome> {
  const src = createSupabasePosSource(pos);
  const from = new Date(asOf.getTime() - 365 * DAY);
  const [entries, settled, occ] = await Promise.all([
    src.listEntries(companyId, from, asOf),
    src.listSettledPayments(companyId, new Date(0), new Date(asOf.getTime() + DAY)),
    occupancy(pos, companyId, asOf),
  ]);
  const bookings = await pageAll((a, b) => pos.from("bookings").select("id, customer_ref, payment_method").eq("company_id", companyId).range(a, b));
  const refs = new Map<string, string>(bookings.map((r) => [r.id, r.customer_ref]));

  const offRail = new Set<string>(bookings.filter((r) => r.payment_method && r.payment_method !== "gateway").map((r) => r.id as string));
  const recon = reconcile({ companyId, entries, settled, customerRefs: refs, offRail });
  const windowDays = 60;
  const cutoff = utcDate(new Date(asOf.getTime() - windowDays * DAY).toISOString());
  const open = recon.exceptions.filter((e) => !e.explained && e.date >= cutoff);
  const monthly = monthlyEligible(entries, new Set(settled.map((s) => s.bookingId)), asOf);
  // rasio cakupan pembayaran terverifikasi pada jendela yang sama dengan exception terbuka
  const recent = recon.days.filter((d) => d.date >= cutoff);
  const settledSum = recent.reduce((a, d) => a + d.settledTotal, 0), offSum = recent.reduce((a, d) => a + d.offRailTotal, 0), unSum = recent.reduce((a, d) => a + d.unmatchedTotal, 0);
  const coverage = settledSum + offSum + unSum > 0 ? settledSum / (settledSum + offSum + unSum) : 1;
  const policy = evaluatePolicy({
    coverage,
    dossier,
    tenorMonths: Math.round(proposed.tenorDays / 30),
    monthlyEligible: monthly,
    occupancy: occ,
    openExceptions: open.length,
    proposed,
    docChecks,
  });
  return { asOf: asOf.toISOString(), policy, recon: { ...recon, exceptions: open }, openExceptionWindowDays: windowDays, monthly, occupancy: occ, entryCount: entries.length };
}
