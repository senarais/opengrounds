/** Reopen one demo review, preserving its old approval and unused contract in the append-only audit log. */
import { readSeries } from "../lib/chain";
import { platformDb } from "../lib/db";

async function main() {
  const caseId = process.argv[2];
  if (!caseId || !/^[0-9a-f-]{36}$/i.test(caseId)) throw new Error("Usage: tsx --env-file=../../.env scripts/reset-review.ts <case-id> [--apply]");
  const pf = platformDb();
  const { data: kc, error } = await pf.from("kyb_cases").select("*").eq("id", caseId).single();
  if (error || !kc) throw new Error("Review not found");
  if (kc.status !== "APPROVED") throw new Error("Only a previously approved demo review can be reopened by this script");
  const { data: series, error: se } = await pf.from("series").select("*").eq("venue_id", kc.venue_id);
  if (se) throw new Error(se.message);
  const archived: { series: unknown; attestations: unknown }[] = [];
  for (const s of series ?? []) {
    if (!["Draft", "Verified"].includes(s.status)) throw new Error("Series already in use; refusing reset");
    if (s.contract_address) {
      const chain = await readSeries(s.contract_address);
      if (!["Draft", "Verified"].includes(chain.state) || chain.supply !== 0n || chain.circulating !== 0n) throw new Error("Contract already activated; refusing reset");
    }
    for (const table of ["orders", "cash_ledger", "revenue_periods", "sellback_requests"]) {
      const r = await pf.from(table).select("*", { head: true, count: "exact" }).eq("series_id", s.id);
      if (r.error) throw new Error(r.error.message);
      if (r.count !== 0) throw new Error(`${table} is not empty; refusing reset`);
    }
    const att = await pf.from("attestations").select("*").eq("series_id", s.id);
    if (att.error) throw new Error(att.error.message);
    if ((att.data ?? []).some((a) => a.tx_hash || a.status === "submitted" || a.signatures?.some((sig: { slot: string }) => sig.slot !== "PLATFORM"))) throw new Error("An acquisition is signed by the owner or submitted; refusing reset");
    archived.push({ series: s, attestations: att.data });
  }
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ caseId, status: kc.status, unusedSeries: series?.length ?? 0, ready: true }));
    return;
  }
  const { error: auditError } = await pf.from("audit_log").insert({ actor: "demo-reset", action: "kyb.review.reopened", entity: "kyb_cases", entity_id: caseId, before: kc, after: { status: "IN_REVIEW" }, detail: { reason: "User requested re-review with signed operator and independent reviewer approvals", archived } });
  if (auditError) throw new Error("Cannot preserve prior approval; reset cancelled");
  // Changing the review version invalidates any previously recorded review votes.
  const reset = await pf.from("kyb_cases").update({ status: "IN_REVIEW", decided_by: null, decided_at: null, decision_note: null, updated_at: new Date().toISOString() }).eq("id", caseId).eq("status", "APPROVED").eq("updated_at", kc.updated_at).select("id").single();
  if (reset.error) throw new Error("Review changed; reset cancelled");
  for (const s of series ?? []) {
    // Attestations cascade. Their prior contents, including the unused contract address, are preserved above.
    const removed = await pf.from("series").delete().eq("id", s.id).in("status", ["Draft", "Verified"]).select("id").single();
    if (removed.error) throw new Error("Review reopened but unused series could not be removed; inspect before approving again");
  }
  console.log(JSON.stringify({ caseId, status: "IN_REVIEW", archivedUnusedSeries: series?.length ?? 0, auditPreserved: true }));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
