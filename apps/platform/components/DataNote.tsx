import { itemsFor, VISIBILITY_LABEL } from "@venue-rwa/shared";

/** Catatan di setiap bagian form: untuk apa data diminta dan siapa yang bisa melihat (dari katalog yang sama dengan /kebijakan-data). */
export function DataNote({ ids }: { ids: string[] }) {
  return (
    <details className="disclose" style={{ marginBottom: 14 }}>
      <summary>Untuk apa data ini dan siapa yang melihat?</summary>
      <div className="body">
        <ul className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.6 }}>
          {itemsFor(...ids).map((d) => (
            <li key={d.id}><b>{d.label}.</b> {d.purpose} <span className="muted">Dilihat oleh: {VISIBILITY_LABEL[d.visibility]}.{d.ai !== "tidak" ? " Teks disamarkan sebelum dianalisis AI." : ""}</span></li>
          ))}
        </ul>
        <p className="small muted" style={{ margin: "8px 0 0" }}><a href="/kebijakan-data" target="_blank" style={{ color: "var(--accent)", fontWeight: 700 }}>Baca kebijakan data lengkap ↗</a></p>
      </div>
    </details>
  );
}
