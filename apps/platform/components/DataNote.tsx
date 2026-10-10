import { itemsFor, VISIBILITY_LABEL } from "@venue-rwa/shared";

/** Show why each field is requested and who can access it. */
export function DataNote({ ids }: { ids: string[] }) {
  return (
    <details className="disclose" style={{ marginBottom: 14 }}>
      <summary>Why we ask for this data</summary>
      <div className="body">
        <ul className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
          {itemsFor(...ids).map((d) => (
            <li key={d.id}><b>{d.label}.</b> {d.purpose} <span className="muted">Access: {VISIBILITY_LABEL[d.visibility]}.{d.ai !== "tidak" ? " Only redacted text is analyzed by AI." : ""}</span></li>
          ))}
        </ul>
        <p className="small muted" style={{ margin: "8px 0 0" }}><a href="/kebijakan-data" target="_blank" style={{ color: "var(--accent)", fontWeight: 700 }}>Read the full data policy ↗</a></p>
      </div>
    </details>
  );
}
