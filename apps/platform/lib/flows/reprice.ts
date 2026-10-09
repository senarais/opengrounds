import { tokenSymbolFor } from "@venue-rwa/shared";
import { evaluatePolicy, repriceVerdict, sourceTier } from "@venue-rwa/verification";
import { readSeries } from "../chain";
import { platformDb, posDb } from "../db";
import { audit, getCtx, needCompany } from "../flow";
import { runVerification } from "../stats";
import { saveRun } from "../verify";
import { insuranceOf } from "./documents";

export const COOLING_HOURS = 24;
const CHANGEABLE = ["Verifying", "Attested", "Offering"];

/** Seri aktif milik venue: yang terbaru dan belum digantikan. */
export async function currentSeriesOf(venueId: string) {
  const { data } = await platformDb().from("series").select("*").eq("venue_id", venueId).neq("status", "Superseded").order("created_at", { ascending: false }).limit(1);
  if (!data?.[0]) throw new Error("Seri tidak ditemukan");
  return data[0];
}

export interface RepriceTerms { unitPrice: number; target: number; minRaise: number }

/**
 * Harga di kontrak tidak bisa diubah (immutable). Perubahan harga = SERI PENGGANTI: seri lama ditandai Superseded dan
 * hanya boleh bila belum ada token terjual; seri baru diverifikasi ulang dan wajib mendapat attestation baru dari penandatangan.
 * Menaikkan harga menambah masa tunggu 24 jam sebelum penawaran boleh dibuka.
 */
export async function requestReprice(seriesId: string, owner: { userId: string; email: string }, t: RepriceTerms) {
  const pf = platformDb();
  const ctx = await getCtx(seriesId);
  const { series: old, venue } = ctx;
  if (venue.owner_id !== owner.userId) throw new Error("Pengajuan tidak ditemukan");
  if (!CHANGEABLE.includes(old.status)) throw new Error(`Seri berstatus ${old.status}; harga hanya bisa diubah sebelum ada penjualan`);
  if (ctx.ref) {
    const s = await readSeries(ctx.ref);
    if (s.minted > 0n) throw new Error("Sudah ada token terjual: harga tidak bisa diubah lagi.");
  }
  if (!Number.isInteger(t.unitPrice) || t.unitPrice < 1 || t.minRaise > t.target || t.unitPrice > t.target) throw new Error("Persyaratan baru tidak valid (harga, target, minimum raise)");
  if (t.unitPrice === Number(old.unit_price) && t.target === Number(old.target) && t.minRaise === Number(old.min_raise)) throw new Error("Tidak ada perubahan");

  const { data: oldRun } = await pf.from("verification_runs").select("reference_price").eq("series_id", old.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const proposed = { target: t.target, unitPrice: t.unitPrice, shareBps: old.share_bps };

  // verifikasi ulang dengan persyaratan baru, memakai tingkat data yang sama dengan sebelumnya
  let policy, exceptions: unknown[] = [], monthly: number[], source: "pos" | "connector" | "self_reported";
  if (venue.data_source === "self_reported" || !ctx.companyId) {
    monthly = venue.reported_revenue?.months ?? [];
    source = "self_reported";
    policy = evaluatePolicy({ dossier: venue.dossier, tenorMonths: Math.round(old.tenor_days / 30), monthlyEligible: monthly, occupancy: Number(venue.reported_revenue?.occupancyPct ?? 0) / 100, openExceptions: 0, proposed, dataSource: "self_reported", docChecks: venue.ai_report?.checks, reportedGatewayPct: venue.disclosure?.public?.performance?.paymentMix?.gatewayPct, landlordConsentsToSale: venue.disclosure?.public?.risk?.landlordConsentsToSale ?? undefined, insurance: insuranceOf(venue) });
  } else {
    const company = needCompany(ctx);
    const out = await runVerification(posDb(), company, new Date(), venue.dossier, { ...proposed, tenorDays: old.tenor_days }, venue.ai_report?.checks);
    const cnt = async (ext: boolean) => (await posDb().from("bookings").select("id", { count: "exact", head: true }).eq("company_id", company).in("status", ["paid", "completed", "refunded"])[ext ? "neq" : "eq"]("source", "pos")).count ?? 0;
    source = sourceTier({ pos: await cnt(false), external: await cnt(true) });
    policy = { ...out.policy, dataSource: source };
    exceptions = out.recon.exceptions;
    monthly = out.monthly;
  }
  const bad = repriceVerdict({ oldPrice: Number(old.unit_price), newPrice: t.unitPrice, oldReference: Number(oldRun?.reference_price ?? 0), newReference: policy.price.reference, band: policy.price.band });
  if (bad) throw new Error(bad);

  const { data: syms } = await pf.from("series").select("token_symbol");
  const symbol = tokenSymbolFor(venue.name, (syms ?? []).map((s) => s.token_symbol).filter(Boolean) as string[]);
  const raising = t.unitPrice > Number(old.unit_price);
  const { data: next, error } = await pf.from("series").insert({
    venue_id: venue.id, status: "Verifying", target: t.target, min_raise: t.minRaise, unit_price: t.unitPrice, share_bps: old.share_bps, tenor_days: old.tenor_days,
    use_of_funds: old.use_of_funds, token_symbol: symbol, name: old.name, supersedes: old.id,
    open_after: raising ? new Date(Date.now() + COOLING_HOURS * 3_600_000).toISOString() : null,
    price_note: `Perubahan dari seri sebelumnya: harga Rp${Number(old.unit_price).toLocaleString("id-ID")} → Rp${t.unitPrice.toLocaleString("id-ID")}`,
  }).select("*").single();
  if (error) throw new Error(error.message);
  await pf.from("series").update({ status: "Superseded" }).eq("id", old.id);
  await saveRun(await getCtx(next!.id), { policy, asOf: new Date().toISOString(), exceptions, monthly, dataSource: source, disclosureHash: venue.disclosure_hash ?? null });
  await audit(owner.email, "series.reprice", { venue: venue.name, from: old.id, to: next!.id, oldPrice: Number(old.unit_price), newPrice: t.unitPrice });
  return { seriesId: next!.id as string, coolingHours: raising ? COOLING_HOURS : 0 };
}
