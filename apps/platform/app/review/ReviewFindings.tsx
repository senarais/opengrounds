"use client";
import { useState } from "react";
import { Badge } from "@venue-rwa/ui";
import { disposeAction } from "./actions";
import { SubmitButton } from "./SubmitButton";

export interface ReviewFindingRow {
  id: string; severity: string; finding_code: string; finding_text: string; verified: boolean; agent: string;
  disposition?: string | null; disposition_reason?: string | null; disposed_by?: string | null;
  source_refs?: { doc: string; page?: number | null; quote?: string | null }[] | null;
}
const SEVERITY: Record<string, string> = { critical: "Critical blocker", high: "High priority", medium: "Needs attention", low: "Manual check", info: "Information" };
const DISPOSITION: Record<string, string> = { accepted: "Confirmed", overridden: "Overridden with evidence", request_info: "Information requested", rejected: "Decline reason" };
const AGENT: Record<string, string> = { extraction: "Document extraction", cross_check: "Data consistency", reconciliation: "Financial reconciliation", risk: "Risk indicators" };

export function ReviewFindings({ findings, caseId, decided, sources }: { findings: ReviewFindingRow[]; caseId: string; decided: boolean; sources: Record<string, string> }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const visible = findings.filter((f) => {
    const priority = f.severity === "critical" || f.severity === "high";
    return (filter === "all" || (filter === "pending" && !f.disposition && f.severity !== "info") || (filter === "urgent" && priority) || (filter === "reviewed" && !!f.disposition)) && `${f.finding_text} ${AGENT[f.agent] ?? f.agent}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => Number(!!a.disposition) - Number(!!b.disposition));
  return <>
    <div className="og-review-toolbar">
      <input className="input" aria-label="Search findings" placeholder="Search findings or source…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <select className="input" aria-label="Filter findings" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All findings</option><option value="pending">Needs review</option><option value="urgent">Critical & high</option><option value="reviewed">Reviewed</option></select>
    </div>
    <p className="small muted" aria-live="polite">Showing {visible.length} of {findings.length} findings.</p>
    {visible.map((f) => <article key={f.id} className={`og-review-finding ${f.severity === "critical" || f.severity === "high" ? "is-urgent" : f.severity === "medium" ? "is-warning" : ""}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row"><Badge tone={f.severity === "critical" || f.severity === "high" ? "bad" : f.severity === "medium" ? "warn" : "info"}>{SEVERITY[f.severity] ?? f.severity}</Badge><span className="small muted">{AGENT[f.agent] ?? f.agent}</span></div>
        <Badge tone={f.disposition === "rejected" ? "bad" : f.disposition === "request_info" ? "warn" : "neutral"}>{f.disposition ? DISPOSITION[f.disposition] ?? f.disposition : "Not reviewed"}</Badge>
      </div>
      <h3>{f.finding_text}</h3>
      {!f.verified && <p className="small muted">Automated evidence is incomplete. Compare the original documents before deciding.</p>}
      {(f.source_refs ?? []).map((ref, i) => <div key={i} className="og-review-source">
        {ref.quote && <blockquote style={{ margin: "0 0 8px" }}>“{ref.quote}”</blockquote>}
        {sources[ref.doc] ? <a href={sources[ref.doc]} target="_blank" rel="noreferrer">Open source document{ref.page ? ` · page ${ref.page}` : ""}</a> : <span className="small muted">Source: {ref.doc}{ref.page ? ` · page ${ref.page}` : ""}</span>}
      </div>)}
      {!decided && <details className="og-review-fold" open={!f.disposition && (f.severity === "critical" || f.severity === "high")}>
        <summary>{f.disposition ? "Update review" : "Record review"}</summary>
        <form action={disposeAction} className="og-review-form">
          <input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="findingId" value={f.id} />
          <label className="field">Review outcome<select className="input" name="disposition" defaultValue={f.disposition ?? ""} required><option value="" disabled>Select an outcome</option><option value="accepted">Confirm finding</option><option value="overridden">Override with evidence</option><option value="request_info">Request more information</option><option value="rejected">Use as a reason to decline</option></select></label>
          <label className="field">Reason or evidence reference<textarea className="input" name="reason" rows={2} placeholder="Example: the shortened name matches page 2 of the company deed." defaultValue={f.disposition_reason ?? ""} /></label>
          <p className="small muted">An override requires a reason of at least 10 characters. Saving a review does not approve the venue.</p>
          <div><SubmitButton pendingText="Saving…">Save review</SubmitButton></div>
        </form>
      </details>}
      {f.disposition_reason && <p className="small muted">Review note: {f.disposition_reason}{f.disposed_by ? ` · ${f.disposed_by}` : ""}</p>}
      <details className="og-review-fold"><summary>Check details</summary><p className="small muted">Code: {f.finding_code} · Automated evidence: {f.verified ? "available" : "unverified"}</p></details>
    </article>)}
    {!visible.length && <p className="muted">{findings.length ? "No findings match these filters. Try another filter or clear the search." : "No findings yet. Confirm the document check has finished."}</p>}
  </>;
}
