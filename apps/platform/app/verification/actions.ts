"use server";
import { requireArea } from "@/lib/auth";
import { getCtx, guarded, needCompany } from "@/lib/flow";
import { sourceTier } from "@venue-rwa/verification";
import { runVerification } from "@/lib/stats";
import { saveRun } from "@/lib/verify";
import { posDb } from "@/lib/db";

/** Simpan hasil verifikasi dari data PoS/gateway sebagai dasar attestation. Venue ditandai terverifikasi gateway. */
export async function saveVerification(fd: FormData) {
  const sId = String(fd.get("s"));
  const asof = String(fd.get("asof") || "now");
  return guarded(`/verification?s=${sId}&asof=${asof}`, async () => {
    await requireArea("verification");
    const ctx = await getCtx(sId);
    const company = needCompany(ctx);
    const at = asof === "30" ? new Date(Date.now() - 30 * 86_400_000) : new Date();
    const out = await runVerification(posDb(), company, at, ctx.venue.dossier, { target: Number(ctx.series.target), unitPrice: Number(ctx.series.unit_price), shareBps: ctx.series.share_bps, tenorDays: ctx.series.tenor_days }, ctx.venue.ai_report?.checks);
    const cnt = async (ext: boolean) => (await posDb().from("bookings").select("id", { count: "exact", head: true }).eq("company_id", company).in("status", ["paid", "completed", "refunded"])[ext ? "neq" : "eq"]("source", "pos")).count ?? 0;
    const tier = sourceTier({ pos: await cnt(false), external: await cnt(true) });
    await saveRun(ctx, { policy: { ...out.policy, dataSource: tier }, asOf: out.asOf, exceptions: out.recon.exceptions, monthly: out.monthly, dataSource: tier, disclosureHash: ctx.venue.disclosure_hash ?? null });
    await ctx.pf.from("venues").update({ data_source: tier }).eq("id", ctx.venue.id);
    return "Hasil verifikasi dari data PoS disimpan. Reviewer memakainya sebagai dasar attestation.";
  });
}
