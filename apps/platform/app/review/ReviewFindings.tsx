"use client";
import { useState } from "react";
import { Badge } from "@venue-rwa/ui";
import { disposeAction } from "./actions";
import { SubmitButton } from "./SubmitButton";
import styles from "./ReviewWorkspace.module.css";

export interface ReviewFindingRow {
  id: string; severity: string; finding_code: string; finding_text: string; verified: boolean; agent: string;
  disposition?: string | null; disposition_reason?: string | null; disposed_by?: string | null;
  source_refs?: { doc: string; page?: number | null; quote?: string | null }[] | null;
}
const SEVERITY: Record<string, string> = { critical: "Penghalang utama", high: "Prioritas tinggi", medium: "Perlu perhatian", low: "Perlu cek manual", info: "Informasi" };
const DISPOSITION: Record<string, string> = { accepted: "Temuan benar", overridden: "Dikesampingkan dengan alasan", request_info: "Data tambahan diminta", rejected: "Dasar penolakan" };
const AGENT: Record<string, string> = { extraction: "Pembacaan dokumen", cross_check: "Konsistensi data", reconciliation: "Pencocokan keuangan", risk: "Indikator risiko" };

export function ReviewFindings({ findings, caseId, decided, sources }: { findings: ReviewFindingRow[]; caseId: string; decided: boolean; sources: Record<string, string> }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const visible = findings.filter((f) => {
    const priority = f.severity === "critical" || f.severity === "high";
    return (filter === "all" || (filter === "pending" && !f.disposition && f.severity !== "info") || (filter === "urgent" && priority) || (filter === "reviewed" && !!f.disposition)) && `${f.finding_text} ${AGENT[f.agent] ?? f.agent}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => Number(!!a.disposition) - Number(!!b.disposition));
  return <>
    <div className={styles.toolbar}>
      <input className="input" aria-label="Cari temuan" placeholder="Cari nama, dokumen, atau temuan…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <select className="input" aria-label="Filter temuan" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Semua temuan</option><option value="pending">Belum ditinjau</option><option value="urgent">Prioritas tinggi</option><option value="reviewed">Sudah ditinjau</option></select>
    </div>
    <p className="small muted" aria-live="polite">Menampilkan {visible.length} dari {findings.length} temuan.</p>
    {visible.map((f) => <article key={f.id} className={`${styles.item} ${f.severity === "critical" || f.severity === "high" ? styles.urgent : f.severity === "medium" ? styles.warning : ""}`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row"><Badge tone={f.severity === "critical" || f.severity === "high" ? "bad" : f.severity === "medium" ? "warn" : "info"}>{SEVERITY[f.severity] ?? f.severity}</Badge><span className="small muted">{AGENT[f.agent] ?? f.agent}</span></div>
        <Badge tone={f.disposition === "rejected" ? "bad" : f.disposition === "request_info" ? "warn" : "neutral"}>{f.disposition ? DISPOSITION[f.disposition] ?? f.disposition : "Belum ditinjau"}</Badge>
      </div>
      <h3>{f.finding_text}</h3>
      {!f.verified && <p className="small muted">Belum ada bukti otomatis yang cukup. Bandingkan dengan dokumen asli sebelum mengambil keputusan.</p>}
      {(f.source_refs ?? []).map((ref, i) => <div key={i} className={styles.quote}>
        {ref.quote && <blockquote style={{ margin: "0 0 8px" }}>“{ref.quote}”</blockquote>}
        {sources[ref.doc] ? <a href={sources[ref.doc]} target="_blank" rel="noreferrer">Buka dokumen sumber{ref.page ? ` · halaman ${ref.page}` : ""}</a> : <span className="small muted">Sumber: {ref.doc}{ref.page ? ` · halaman ${ref.page}` : ""}</span>}
      </div>)}
      {!decided && <details className={styles.fold} open={!f.disposition && (f.severity === "critical" || f.severity === "high")}>
        <summary>{f.disposition ? "Ubah hasil tinjauan" : "Catat hasil tinjauan"}</summary>
        <form action={disposeAction} className={styles.form}>
          <input type="hidden" name="caseId" value={caseId} /><input type="hidden" name="findingId" value={f.id} />
          <label className="field">Hasil pemeriksaan Anda<select className="input" name="disposition" defaultValue={f.disposition ?? ""} required><option value="" disabled>Pilih hasil tinjauan</option><option value="accepted">Temuan benar — tetap diperhitungkan</option><option value="overridden">Kesampingkan — ada bukti penjelas</option><option value="request_info">Butuh data tambahan</option><option value="rejected">Temuan menjadi dasar penolakan</option></select></label>
          <label className="field">Alasan atau referensi bukti<textarea className="input" name="reason" rows={2} placeholder="Contoh: nama singkat cocok dengan akta halaman 2." defaultValue={f.disposition_reason ?? ""} /></label>
          <p className="small muted">Mengesampingkan temuan wajib disertai alasan minimal 10 karakter. Menyimpan tinjauan ini belum menyetujui venue.</p>
          <div><SubmitButton pendingText="Menyimpan…">Simpan hasil tinjauan</SubmitButton></div>
        </form>
      </details>}
      {f.disposition_reason && <p className="small muted">Catatan: {f.disposition_reason}{f.disposed_by ? ` · ${f.disposed_by}` : ""}</p>}
      <details className={styles.fold}><summary>Detail pemeriksaan</summary><p className="small muted">Kode: {f.finding_code} · Bukti otomatis: {f.verified ? "tersedia" : "belum terverifikasi"}</p></details>
    </article>)}
    {!visible.length && <p className="muted">{findings.length ? "Tidak ada temuan yang sesuai filter. Coba filter lain atau hapus pencarian." : "Belum ada temuan tercatat. Pastikan pemeriksaan dokumen sudah selesai."}</p>}
  </>;
}
