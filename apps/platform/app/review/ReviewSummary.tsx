import { Badge, Card, KV } from "@venue-rwa/ui";
import { evidenceCoverage, EXTRACTABLE, type EvidenceDocument } from "@venue-rwa/verification";

const DOC_LABEL: Record<string, string> = { deed: "Akta", nib: "NIB", npwp: "NPWP", land_certificate: "Sertifikat tanah", bank_statement: "Rekening koran" };
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
  const title = running ? "Pemeriksaan sedang berjalan" : !checked ? "Bukti belum diperiksa" : urgent.length ? "Ada temuan penting untuk ditinjau" : failed || coverage.score < 100 ? "Bukti masih perlu dilengkapi atau diperiksa manual" : "Bukti tersedia untuk keputusan reviewer";
  return (
    <Card title="Ringkasan verifikasi" subtitle="Baca kesimpulan awal dan cakupan bukti sebelum meninjau tiap temuan." className="mt">
      <div className="grid c2">
        <div>
          <h3 style={{ marginTop: 0 }}>{title}</h3>
          <p>{!checked ? "Jalankan pemeriksaan untuk membaca dokumen dan membandingkannya dengan pengajuan. Belum ada hasil risiko yang dapat disimpulkan." : `${pending} temuan penting belum ditinjau. Ada ${warnings.length} hal lain yang perlu diperhatikan dan ${failed} dokumen yang perlu dibaca manual.`}</p>
          {checked && <ul className="small" style={{ paddingLeft: 18 }}>{[...urgent, ...warnings].slice(0, 3).map((f, i) => <li key={i} style={{ marginBottom: 8 }}>{f.finding_text}</li>)}</ul>}
          {checked && urgent.length === 0 && warnings.length === 0 && <p className="small muted">Pemeriksaan yang berjalan belum menemukan ketidaksesuaian. Ini tidak membuktikan keaslian dokumen atau ketiadaan risiko.</p>}
          <details className="disclose"><summary>Status pembacaan dokumen</summary><div className="body"><KV rows={[["Ekstraksi AI", running ? "Sedang membaca dokumen" : !checked ? "Belum ada hasil pemeriksaan" : `${successful} dari ${extractable.length} dokumen terbaca (termasuk hasil parsial)`], ["Model ekstraksi", checked ? model ?? "LLM belum dikonfigurasi pada pemeriksaan terakhir" : "Belum tercatat"], ["Pemeriksaan terakhir", checkedAt ? new Date(checkedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB" : "Belum dijalankan"]]} />
          <p className="small muted">AI membaca isi dokumen. Pencocokan data dan ringkasan dihitung dengan aturan tetap; keputusan tetap di Anda.</p></div></details>
        </div>
        <div>
          <div className="row" style={{ justifyContent: "space-between" }}><b>Kelengkapan bukti terbaca</b><Badge tone="info">{checked && !running ? `${coverage.score}/100` : "Belum final"}</Badge></div>
          <progress value={coverage.score} max={100} aria-label="Kelengkapan bukti terbaca" style={{ width: "100%", height: 12, accentColor: "#c25a00", margin: "12px 0" }} />
          <p className="small muted">Angka ini menunjukkan seberapa banyak data wajib yang berhasil dibaca dan didukung kutipan. Ini bukan nilai kelayakan investasi.</p>
          <details className="disclose"><summary>Kenapa nilainya segitu?</summary><div className="body"><p>Setiap dokumen wajib bernilai maksimal 20 poin [Asumsi UI]. Poin diberikan sesuai jumlah data yang punya kutipan terverifikasi. Data kosong atau gagal dibaca mendapat 0 poin.</p><KV rows={coverage.rows.map((r) => [DOC_LABEL[r.kind] ?? r.kind, !r.present ? "Belum diunggah · 0/20" : `${r.verified}/${r.total} data berbukti · ${(20 * r.verified / r.total).toFixed(1)}/20`])} />
          </div></details><p className="small muted" style={{ marginTop: 12 }}>Nilai 100 berarti semua data wajib punya kutipan, bukan berarti venue bebas risiko. Temuan penting tetap harus ditinjau.</p>
        </div>
      </div>
    </Card>
  );
}
