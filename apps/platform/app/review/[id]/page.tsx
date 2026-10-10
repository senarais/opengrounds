import { VenueMedia } from "@/components/VenueMedia";
import { notFound } from "next/navigation";
import { Badge, Card, Flash, KV, Notice, PageHeader } from "@venue-rwa/ui";
import { SEVERITY_RANK, type Severity } from "@venue-rwa/verification";
import { financialSummary } from "@venue-rwa/shared";
import { requireArea } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { KYB_STATUS_LABEL } from "@/lib/flows/kyb";
import { loadOnboarding } from "@/lib/flows/onboarding";
import { rp } from "@/lib/format";
import { signedUrl } from "@/lib/storage";
import { checkAction, decideAction } from "../actions";
import { ReviewSummary } from "../ReviewSummary";
import { ReviewFindings } from "../ReviewFindings";
import { SubmitButton } from "../SubmitButton";
import { SignedApproveButton } from "../SignedApproveButton";
import Link from "next/link";
import { reviewApprovalProgress } from "@/lib/flows/review-signature";

export const dynamic = "force-dynamic";
export const metadata = { title: "Application review · Open Grounds" };


export default async function ReviewCase({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const me = await requireArea("review");
  const { id } = await params;
  const sp = await searchParams;
  const pf = platformDb();
  const { data: kc } = await pf.from("kyb_cases").select("*").eq("id", id).maybeSingle();
  if (!kc) notFound();
  const { input, org, land, docs, venue } = await loadOnboarding(kc.venue_id);
  const { data: fs } = await pf.from("kyb_findings").select("*").eq("case_id", id);
  const findings = (fs ?? []).sort((a, b) => SEVERITY_RANK[b.severity as Severity] - SEVERITY_RANK[a.severity as Severity]);
  const fin = financialSummary(input.financials);
  const decided = ["APPROVED", "REJECTED"].includes(kc.status);
  const urls = Object.fromEntries(await Promise.all(docs.map(async (d) => [d.id, await signedUrl(d.storage_path)])));
  const open = findings.filter((f) => (f.severity === "critical" || f.severity === "high") && !f.disposition).length;
  const val = kc.gate_result?.valuation;
  const rejected = findings.some((f) => f.disposition === "rejected");
  const canApprove = kc.status === "IN_REVIEW" && open === 0 && !!val && !rejected;
  let progress: Awaited<ReturnType<typeof reviewApprovalProgress>> | null = null;
  let progressError = "";
  if (canApprove) {
    try { progress = await reviewApprovalProgress(id, me, Number(val.assetValue)); }
    catch { progressError = "Approval status is unavailable. Reload the page and check your Sepolia connection."; }
  }
  const ownVote = me.role === "operator" ? progress?.operator : progress?.reviewer;
  const sources = Object.fromEntries(docs.filter((d) => urls[d.id] && docs.filter((other) => other.kind === d.kind).length === 1).map((d) => [d.kind, urls[d.id]!]));

  return (
    <div className="container">
      <Link href="/review" className="og-back-link">← All applications</Link>
      <PageHeader eyebrow="Venue application" title={venue.name} lead={`${org.legal_name} · ${venue.city}`}><Badge tone={kc.status === "APPROVED" ? "ok" : kc.status === "REJECTED" ? "bad" : "info"}>{KYB_STATUS_LABEL[kc.status]}</Badge></PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      <ReviewSummary docs={docs} findings={findings} checkedAt={kc.gate_result?.checkedAt} model={kc.gate_result?.llm} running={kc.status === "AUTOMATED_CHECK"} />
      <nav className="og-review-nav" aria-label="Review sections"><a href="#findings">Findings</a><a href="#documents">Documents</a><a href="#valuation">Venue & valuation</a><a href="#decision">Decision</a></nav>
      <div className="og-review-desk">
        <div>
          <section id="findings" className="og-review-section">
            <h2>Findings & evidence</h2>
            <p className="og-review-help">Review critical and high-priority findings first. Open the source, compare the original document, and record your assessment.</p>
            {!kc.risk_summary && <Notice tone="info">No automated findings yet. Run the document check below.</Notice>}
            <ReviewFindings findings={findings} caseId={id} decided={decided} sources={sources} />
          </section>
          <VenueMedia venueId={venue.id} name={venue.name} area={venue.city} facilities={input.venue.facilities} openHour={input.venue.openHour} closeHour={input.venue.closeHour} />
          <section id="documents" className="og-review-section">
            <Card title="Submitted documents" subtitle="Open originals to verify content and source context.">
              {docs.map((d) => <div key={d.id} className="og-review-document">
                <div><b className="small">{d.original_name ?? d.kind}</b><p className="small muted" style={{ margin: "4px 0" }}>{d.kind.replaceAll("_", " ")} · {({ ok: "Read automatically", partial: "Partially read", failed: "Extraction failed · manual review", unreadable: "Text unreadable · manual review" } as Record<string, string>)[d.extraction_status ?? ""] ?? "Not checked"}</p></div>
                {urls[d.id] ? <a className="btn sm" href={urls[d.id]!} target="_blank" rel="noreferrer">Open document</a> : <span className="small muted">Document unavailable</span>}
              </div>)}
              {docs.length === 0 && <p className="muted">No documents uploaded.</p>}
            </Card>
          </section>
          <section id="valuation" className="og-review-section">
            <Card title="Venue & company" subtitle="Submitted facts · compare with the evidence.">
              <KV rows={[["Land title holder", `${land.holder_name} (${land.right_type})`], ["Encumbrance", land.encumbered ? (land.encumbrance_consent ? "Pledged · lender consent provided" : "Pledged · no lender consent") : "Not pledged"], ["Digitally recorded revenue", `${fin.digitalShareBps / 100}%`], ["Operating expenses / gross", `${fin.avgOpexBps / 100}%`], ["Financial history", `${input.financials.length} months`], ["Economic rights offered", `${input.offering.stakeBps / 100}% of distributable net profit`], ["Directors", input.company.directors.map((d) => d.name).join(", ")], ["Beneficial owners", input.beneficialOwners.map((b) => `${b.fullName} (${b.ownershipPct}%)`).join(", ")]]} />
            </Card>
            <Card title="Valuation basis" subtitle="The lower of asset value and income value sets series valuation." className="mt">
              {val ? <KV rows={[["Venue asset value", rp(val.assetValue)], ["Annual distributable profit" + (kc.gate_result.financial.annualized ? " · annualized" : ""), rp(val.d12)], ["Income value · profit ÷ 9%", rp(val.vIncome)], ["Selected valuation", rp(val.v)], ["Implied yield", <>{val.yieldBps / 100}% <Badge tone={val.inBand ? "ok" : "warn"}>{val.inBand ? "Within assumed range" : "Outside range · review"}</Badge></>], ["Token supply", val.supply.toLocaleString("en-US")], ["Reference price / token", rp(val.refPrice)]]} /> : <Notice tone="warn">Valuation is unavailable. Run the document check and confirm annual distributable profit is positive.</Notice>}
              <p className="small muted">The 9% rate and 5–20% yield band are demo assumptions. Venue assets are a pricing benchmark, not collateral.</p>
            </Card>
            {!decided && <details className="og-review-check mt" open={!kc.risk_summary}>
              <summary>{kc.risk_summary ? "Run document check again" : "Run document check"}</summary>
              <form action={checkAction} className="og-review-form" style={{ paddingBottom: 16 }}>
                <input type="hidden" name="caseId" value={id} />
                <label className="field">Evidence-based asset value · Rp<input className="input" name="assetValue" type="number" min={1} required defaultValue={val?.assetValue ?? input.land.assetValue} /></label>
                <p className="small muted">Documents are reprocessed. Previously recorded human reviews remain saved.</p>
                <div><SubmitButton className="btn primary" pendingText="Reading documents…" disabled={kc.status === "AUTOMATED_CHECK"}>{kc.risk_summary ? "Run check again" : "Start document check"}</SubmitButton></div>
              </form>
            </details>}
          </section>
        </div>
        <aside id="decision" className="og-review-rail">
          <Card title={decided ? "Decision recorded" : "Review decision"} subtitle={decided ? "This application has been decided." : "Complete the evidence review before approving."}>
            {decided ? <><Badge tone={kc.status === "APPROVED" ? "ok" : "bad"}>{KYB_STATUS_LABEL[kc.status]}</Badge><p>{kc.decision_note ?? "No decision note."}</p><p className="small muted">Decided by {kc.decided_by ?? "reviewer"}</p></> : <>
              <p><b>{Number(!!progress?.operator) + Number(!!progress?.reviewer)} of 2 approvals</b></p>
              <KV rows={[["Operator", progress?.operator ? "Signed" : "Awaiting signature"], ["Independent reviewer", progress?.reviewer ? "Signed" : "Awaiting signature"]]} />
              <p className="small muted">Both reviewers must approve the same evidence snapshot and asset value. The series contract deploys after both signatures.</p>
              {progressError && <Notice tone="warn">{progressError}</Notice>}
              <ul className="small" style={{ paddingLeft: 18 }}>
                <li>{kc.status === "IN_REVIEW" ? "Automated check complete" : "Automated check incomplete"}</li>
                <li>{open ? `${open} priority findings need review` : "All priority findings are reviewed"}</li>
                <li>{val ? "Valuation available" : "Valuation unavailable"}</li>
                {rejected && <li>A finding is marked as a reason to decline</li>}
              </ul>
              {!canApprove && <Notice tone="warn">Approval is unavailable. Complete the check, review priority findings, and confirm a valuation. Resolve any finding marked as a reason to decline first.</Notice>}
              <form action={decideAction} className="og-review-form">
                <input type="hidden" name="caseId" value={id} />
                <label className="field">Final asset value · Rp<input className="input" name="assetValue" type="number" min={1} defaultValue={progress?.assetValue ?? val?.assetValue ?? input.land.assetValue} /></label>
                <label className="field">Decision note<textarea className="input" name="note" rows={3} placeholder="Record the decision basis and supporting evidence." /></label>
                <p className="small muted">Decline or request-information decisions require at least 10 characters.</p>
                {ownVote ? <Notice tone="ok">Your signature is saved. Waiting for the second reviewer.</Notice> : <SignedApproveButton className="btn primary" disabled={!canApprove || !!progressError} />}
                <SubmitButton className="btn" pendingText="Saving decision…" name="decision" value="NEEDS_INFO" disabled={kc.status !== "IN_REVIEW"}>Request information</SubmitButton>
                <SubmitButton className="btn danger" pendingText="Saving decision…" name="decision" value="REJECTED" disabled={kc.status !== "IN_REVIEW"}>Decline application</SubmitButton>
              </form>
              <p className="small muted" style={{ marginTop: 16 }}>Two review approvals prepare the contract and platform signature. Tokens are issued only after the owner signs the acquisition.</p>
            </>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
