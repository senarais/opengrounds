import { Badge, Card, Notice, PageHeader } from "@venue-rwa/ui";
import { DATA_CATALOG, VISIBILITY_LABEL, type Visibility } from "@venue-rwa/shared";

export const metadata = { title: "Data policy · Open Grounds" };
const TONE: Record<Visibility, "ok" | "warn" | "neutral" | "bad"> = { public: "neutral", kyc_investor: "warn", staff: "warn", owner_only: "warn", never: "ok" };

export default function DataPolicy() {
  return (
    <div className="container">
      <PageHeader eyebrow="Transparency" title="Data, by design." lead="What we collect, why, who can see it, and where it goes. This testnet product document is not legal advice or a claim of legal compliance." />
      <Notice tone="warn" title="Implementation status">Some privacy controls are not built yet. We mark those gaps below. Have this policy reviewed by counsel before processing real personal data.</Notice>

      <div className="section-title"><h2>Data inventory</h2></div>
      <Card>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Data</th><th>Purpose</th><th>Access</th><th>Sent to AI?</th><th>Storage</th></tr></thead>
            <tbody>{DATA_CATALOG.map((d) => (
              <tr key={d.id}>
                <td><b>{d.label}</b>{!d.required && <div className="small muted">Optional</div>}</td>
                <td className="small">{d.purpose}</td>
                <td><Badge tone={TONE[d.visibility]} plain>{VISIBILITY_LABEL[d.visibility]}</Badge></td>
                <td className="small">{d.ai === "tidak" ? "No" : "Yes · redacted text only"}</td>
                <td className="small">{d.where}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Card>

      <div className="grid c2 mt">
        <Card title="What the system does today">
          <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.7, margin: 0 }}>
            <li>Documents use private storage. Staff download links expire after five minutes; venue photos may be public.</li>
            <li>Company identity, bank accounts, contacts, and financial details are server-only; they are not accessible from the browser.</li>
            <li>Before document text reaches an AI model, national IDs, bank numbers, phone numbers, and email addresses are redacted. Images are not sent. Models have no tools or network access; outputs are validated.</li>
            <li>AI cannot approve applications, issue tokens, change bank accounts, or move funds. Humans review every finding. Token issuance requires platform and owner signatures.</li>
            <li>Didit processes investor identity documents. Open Grounds receives status and name for bank-name matching. Without Didit, the KYC path is a labeled sandbox mock.</li>
            <li>Bank-account and national-ID numbers are masked to their last four digits and stored with hashes.</li>
            <li>No personal data is written on-chain. Wallet addresses, figures, and evidence hashes are public and permanent.</li>
            <li>Important actions are recorded in an audit log.</li>
          </ul>
        </Card>
        <Card title="What is not built yet">
          <ul className="small" style={{ paddingLeft: 18, lineHeight: 1.7, margin: 0 }}>
            <li><b>Automatic retention and deletion.</b> No retention schedule exists. Before production, define deletion after appeal periods and legally required retention for active series.</li>
            <li><b>Data-subject requests</b> for access, correction, deletion, or withdrawal of consent. Requests are manual; legal recordkeeping may limit deletion.</li>
            <li><b>Official NIB, NPWP, and deed checks</b> against AHU/OSS are not integrated. Current checks validate formats and compare submitted evidence.</li>
            <li><b>Incident notification.</b> No automated process exists yet.</li>
            <li><b>Formal privacy impact assessment.</b> Not completed.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
