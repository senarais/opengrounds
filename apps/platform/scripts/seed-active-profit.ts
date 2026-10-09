/** Prepare a labelled revenue example for the existing Kenangan demo. Owner signs the period in the UI. */
import { serviceClient } from "@venue-rwa/shared";
import { seedPosDemo } from "./seed-pos-demo";
import { ingestSplits, submitExpense, reviewExpense, closePeriod } from "../lib/flows/periods";

async function main() {
  const pf = serviceClient("platform"), pos = serviceClient("pos");
  const { data: venue, error } = await pf.from("venues").select("id,pos_company_id,submitted_by").eq("name", "Kenangan Arena Futsal & Padel").single();
  if (error || venue?.submitted_by !== "seed:demo") throw new Error("Expected the original synthetic Kenangan seed");
  const { data: series } = await pf.from("series").select("id,status").eq("venue_id", venue.id).single();
  if (series?.status !== "Active") throw new Error("The demo series must be Active");
  const { error: markError } = await pos.from("companies").update({ synthetic: true }).eq("id", venue.pos_company_id);
  if (markError) throw new Error(markError.message);
  await seedPosDemo(venue.pos_company_id, 40, 5000000);
  await ingestSplits(series.id);
  const note = "DEMO profit v1: biaya operasional sintetis Rp40 juta; bukan tagihan nyata.";
  const { data: expense } = await pf.from("expense_items").select("id,status").eq("series_id", series.id).in("note", [note, "Fixture demo yang diminta pengguna; bukan validasi pengeluaran nyata."]).maybeSingle();
  if (!expense) await submitExpense(series.id, "seed:demo", { category: "opex", amount: 40000000, note });
  const { data: pending } = await pf.from("expense_items").select("id").eq("series_id", series.id).eq("note", note).eq("status", "pending");
  for (const item of pending ?? []) await reviewExpense(item.id, "seed:demo", true, note);
  if (process.argv.includes("--close")) {
    const { data: periods } = await pf.from("revenue_periods").select("period_no,status").eq("series_id", series.id);
    if (periods?.length) console.log("Period already exists", periods);
    else console.log(await closePeriod(series.id, "seed:demo"));
  }
  console.log({ seriesId: series.id, grossDemo: 200000000, opexDemo: 40000000, next: "Owner signs the revenue period, then sandbox true-up funds distribution." });
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
