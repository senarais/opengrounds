import { Badge, Card, KV } from "@venue-rwa/ui";
import { evidenceCoverage, EXTRACTABLE, type EvidenceDocument } from "@venue-rwa/verification";

const DOC_LABEL: Record<string, string> = { deed: "Company deed", nib: "Business ID · NIB", npwp: "Tax ID · NPWP", land_certificate: "Land certificate", bank_statement: "Bank statement" };
interface ReviewFinding { severity: string; finding_text: string; disposition?: string | null }

export function ReviewSummary({ docs, findings, checkedAt, model, running }: {
  docs: EvidenceDocument[]; findings: ReviewFinding[]; checkedAt?: string; model?: string | null; running: boolean;
}) {
  const coverage = evidenceCoverage(docs);
  const extractable = docs.filter((d) => EXTRACTABLE.includes(d.kind as typeof EXTRACTABLE[number]));
  const successful = extractable.filter((d) => d.extraction_status === "ok" || d.extraction_status === "partial").length;
  const failed = extractable.filter((d) => d.extraction_status === "failed" || d.extraction_status === "unreadable").length;
  const urgent = findings.filter((f) => f.severity === "high" || f.severity === "critical");
  const pending = urgent.filter((f) => !f.disposition).length;
  const warnings = findings.filter((f) => f.severity === "medium" || f.severity === "low");
  const checked = !!checkedAt;
  const title = running ? "Document check in progress" : !checked ? "Evidence not checked" : urgent.length ? "Priority findings need review" : failed || coverage.score < 100 ? "Evidence needs completion or manual review" : "Evidence is ready for review";
  return (
    <Card title="Evidence overview" subtitle="Check evidence coverage before reviewing individual findings." className="mt">
      <div className="grid c2">
        <div>
          <h3 style={{ marginTop: 0 }}>{title}</h3>
          <p>{!checked ? "Run the check to extract and compare document evidence. No risk conclusions are available yet." : `${pending} priority findings need review. ${warnings.length} other items need attention; ${failed} documents need a manual check.`}</p>
          {checked && <ul className="small" style={{ paddingLeft: 18 }}>{[...urgent, ...warnings].slice(0, 3).map((f, i) => <li key={i} style={{ marginBottom: 8 }}>{f.finding_text}</li>)}</ul>}
          {checked && urgent.length === 0 && warnings.length === 0 && <p className="small muted">No discrepancies were detected. This does not establish document authenticity or absence of risk.</p>}
          <details className="disclose"><summary>Document extraction status</summary><div className="body"><KV rows={[["AI extraction", running ? "Reading documents" : !checked ? "No check results" : `${successful} of ${extractable.length} documents read, including partial results`], ["Extraction model", checked ? model ?? "LLM not configured for the last check" : "Not recorded"], ["Last checked", checkedAt ? new Date(checkedAt).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" }) + " WIB" : "Not run"]]} />
          <p className="small muted">AI reads document text. Cross-checks and summaries use deterministic rules; people make every decision.</p></div></details>
        </div>
        <div>
          <div className="row" style={{ justifyContent: "space-between" }}><b>Readable evidence coverage</b><Badge tone="info">{checked && !running ? `${coverage.score}/100` : "Pending"}</Badge></div>
          <progress value={coverage.score} max={100} aria-label="Readable evidence coverage" style={{ width: "100%", height: 12, accentColor: "#c25a00", margin: "12px 0" }} />
          <p className="small muted">Shows how much required information was read and supported by citations. It is not an investment rating.</p>
          <details className="disclose"><summary>How is this score calculated?</summary><div className="body"><p>Each required document contributes up to 20 points [UI assumption], based on verified citations. Missing or unreadable information receives 0 points.</p><KV rows={coverage.rows.map((r) => [DOC_LABEL[r.kind] ?? r.kind, !r.present ? "Not uploaded · 0/20" : `${r.verified}/${r.total} fields cited · ${(20 * r.verified / r.total).toFixed(1)}/20`])} />
          </div></details><p className="small muted" style={{ marginTop: 12 }}>A score of 100 means required fields have citations. It does not mean the venue is risk-free. Priority findings still need review.</p>
        </div>
      </div>
    </Card>
  );
}
