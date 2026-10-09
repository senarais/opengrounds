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
import styles from "../ReviewWorkspace.module.css";
import Link from "next/link";
import { reviewApprovalProgress } from "@/lib/flows/review-signature";

export const dynamic = "force-dynamic";


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
    catch { progressError = "Persetujuan belum bisa diperiksa. Muat ulang halaman dan pastikan koneksi ke Sepolia tersedia."; }
  }
  const ownVote = me.role === "operator" ? progress?.operator : progress?.reviewer;
  const sources = Object.fromEntries(docs.filter((d) => urls[d.id] && docs.filter((other) => other.kind === d.kind).length === 1).map((d) => [d.kind, urls[d.id]!]));

  return (
    <div className="container">
      <Link href="/review" className="small">← Kembali ke daftar pengajuan</Link>
      <PageHeader eyebrow="Review pengajuan" title={venue.name} lead={`${org.legal_name} · ${venue.city}`}><Badge tone={kc.status === "APPROVED" ? "ok" : kc.status === "REJECTED" ? "bad" : "info"}>{KYB_STATUS_LABEL[kc.status]}</Badge></PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      <ReviewSummary docs={docs} findings={findings} checkedAt={kc.gate_result?.checkedAt} model={kc.gate_result?.llm} running={kc.status === "AUTOMATED_CHECK"} />
      <nav className={styles.nav} aria-label="Bagian review"><a href="#findings">Temuan & bukti</a><a href="#documents">Dokumen pengajuan</a><a href="#valuation">Data & valuasi</a><a href="#decision">Keputusan</a></nav>
      <div className={styles.desk}>
        <div>
          <section id="findings" className={styles.section}>
            <h2>Temuan & bukti</h2>
            <p className={styles.help}>Mulai dari penghalang utama dan prioritas tinggi. Baca kutipan sumber, cocokkan dengan dokumen, lalu catat hasil tinjauan Anda.</p>
            {!kc.risk_summary && <Notice tone="info">Pemeriksaan belum memiliki hasil. Jalankan pembacaan dokumen melalui panel di bawah.</Notice>}
            <ReviewFindings findings={findings} caseId={id} decided={decided} sources={sources} />
          </section>
          <VenueMedia venueId={venue.id} name={venue.name} area={venue.city} facilities={input.venue.facilities} openHour={input.venue.openHour} closeHour={input.venue.closeHour} />
          <section id="documents" className={styles.section}>
            <Card title="Dokumen pengajuan" subtitle="Buka dokumen asli untuk memastikan isi dan konteks kutipan.">
              {docs.map((d) => <div key={d.id} className={styles.document}>
                <div><b className="small">{d.original_name ?? d.kind}</b><p className="small muted" style={{ margin: "4px 0" }}>{d.kind.replaceAll("_", " ")} · {({ ok: "Terbaca otomatis", partial: "Sebagian terbaca", failed: "Pembacaan gagal — periksa manual", unreadable: "Teks tidak terbaca — periksa manual" } as Record<string, string>)[d.extraction_status ?? ""] ?? "Belum ada hasil pembacaan AI"}</p></div>
                {urls[d.id] ? <a className="btn sm" href={urls[d.id]!} target="_blank" rel="noreferrer">Buka dokumen</a> : <span className="small muted">Dokumen belum bisa dibuka</span>}
              </div>)}
              {docs.length === 0 && <p className="muted">Belum ada dokumen diunggah.</p>}
            </Card>
          </section>
          <section id="valuation" className={styles.section}>
            <Card title="Data venue & badan usaha" subtitle="Data yang diajukan; cocokkan dengan bukti sebelum menyetujui.">
              <KV rows={[["Pemegang hak tanah", `${land.holder_name} (${land.right_type})`], ["Status jaminan", land.encumbered ? (land.encumbrance_consent ? "Dijaminkan; ada persetujuan kreditur" : "Dijaminkan; tanpa persetujuan kreditur") : "Tidak dijaminkan"], ["Pendapatan melalui kanal digital", `${fin.digitalShareBps / 100}%`], ["Biaya operasional / omzet", `${fin.avgOpexBps / 100}%`], ["Riwayat keuangan", `${input.financials.length} bulan`], ["Hak ekonomi yang dijual", `${input.offering.stakeBps / 100}% laba bersih yang bisa dibagikan`], ["Direksi", input.company.directors.map((d) => d.name).join(", ")], ["Pemilik manfaat", input.beneficialOwners.map((b) => `${b.fullName} (${b.ownershipPct}%)`).join(", ")]]} />
            </Card>
            <Card title="Dasar valuasi" subtitle="Harga memakai nilai terendah dari aset dan kemampuan menghasilkan laba." className="mt">
              {val ? <KV rows={[["Nilai aset venue", rp(val.assetValue)], ["Laba yang bisa dibagikan setahun" + (kc.gate_result.financial.annualized ? " (disetahunkan)" : ""), rp(val.d12)], ["Nilai berdasarkan laba (laba ÷ 9%)", rp(val.vIncome)], ["Valuasi yang digunakan", rp(val.v)], ["Imbal hasil tersirat", <>{val.yieldBps / 100}% <Badge tone={val.inBand ? "ok" : "warn"}>{val.inBand ? "Dalam rentang asumsi" : "Perlu tinjau kewajaran"}</Badge></>], ["Jumlah token", val.supply.toLocaleString("id-ID")], ["Harga referensi per token", rp(val.refPrice)]]} /> : <Notice tone="warn">Belum ada valuasi yang dapat digunakan. Jalankan pemeriksaan dan pastikan laba tahunan positif.</Notice>}
              <p className="small muted">Tingkat 9% dan rentang kewajaran 5–20% adalah asumsi demo. Nilai aset menjadi patokan harga; token ini tidak dijamin oleh aset venue.</p>
            </Card>
            {!decided && <details className={`disclose mt`} open={!kc.risk_summary}>
              <summary>{kc.risk_summary ? "Perbarui pemeriksaan dokumen" : "Jalankan pemeriksaan dokumen"}</summary>
              <form action={checkAction} className={styles.form} style={{ paddingBottom: 16 }}>
                <input type="hidden" name="caseId" value={id} />
                <label className="field">Nilai aset dari bukti (Rp)<input className="input" name="assetValue" type="number" min={1} required defaultValue={val?.assetValue ?? input.land.assetValue} /></label>
                <p className="small muted">Dokumen akan dibaca ulang. Temuan yang sudah Anda tinjau tetap disimpan. Tunggu hingga proses selesai.</p>
                <div><SubmitButton className="btn primary" pendingText="Membaca dokumen…" disabled={kc.status === "AUTOMATED_CHECK"}>{kc.risk_summary ? "Jalankan pemeriksaan ulang" : "Mulai pemeriksaan"}</SubmitButton></div>
              </form>
            </details>}
          </section>
        </div>
        <aside id="decision" className={styles.rail}>
          <Card title={decided ? "Keputusan tersimpan" : "Keputusan review"} subtitle={decided ? "Pengajuan ini sudah diputus." : "Selesaikan tinjauan bukti sebelum menyetujui."}>
            {decided ? <><Badge tone={kc.status === "APPROVED" ? "ok" : "bad"}>{KYB_STATUS_LABEL[kc.status]}</Badge><p>{kc.decision_note ?? "Tidak ada catatan tambahan."}</p><p className="small muted">Diputus oleh {kc.decided_by ?? "reviewer"}</p></> : <>
              <p><b>{Number(!!progress?.operator) + Number(!!progress?.reviewer)} dari 2 persetujuan</b></p>
              <KV rows={[["Operator", progress?.operator ? "Sudah menandatangani" : "Menunggu tanda tangan"], ["Reviewer independen", progress?.reviewer ? "Sudah menandatangani" : "Menunggu tanda tangan"]]} />
              <p className="small muted">Keduanya wajib menyetujui data dan nilai aset yang sama. Setelah lengkap, kontrak seri dibuat otomatis.</p>
              {progressError && <Notice tone="warn">{progressError}</Notice>}
              <ul className="small" style={{ paddingLeft: 18 }}>
                <li>{kc.status === "IN_REVIEW" ? "Pemeriksaan selesai" : "Pemeriksaan belum selesai"}</li>
                <li>{open ? `${open} temuan penting belum ditinjau` : "Tidak ada temuan penting yang belum ditinjau"}</li>
                <li>{val ? "Valuasi tersedia" : "Valuasi belum tersedia"}</li>
                {rejected && <li>Ada temuan yang menjadi dasar penolakan</li>}
              </ul>
              {!canApprove && <Notice tone="warn">Persetujuan belum tersedia. Selesaikan pemeriksaan, tinjau temuan penting, dan pastikan valuasi tersedia. Temuan yang ditandai sebagai dasar penolakan harus diselesaikan terlebih dahulu.</Notice>}
              <form action={decideAction} className={styles.form}>
                <input type="hidden" name="caseId" value={id} />
                <label className="field">Nilai aset final (Rp)<input className="input" name="assetValue" type="number" min={1} defaultValue={progress?.assetValue ?? val?.assetValue ?? input.land.assetValue} /></label>
                <label className="field">Catatan keputusan<textarea className="input" name="note" rows={4} placeholder="Jelaskan alasan keputusan dan bukti yang mendukungnya." /></label>
                <p className="small muted">Minimal 10 karakter jika menolak atau meminta data tambahan.</p>
                {ownVote ? <Notice tone="ok">Tanda tangan Anda sudah tersimpan. Menunggu persetujuan pihak lainnya.</Notice> : <SignedApproveButton className={`btn primary ${styles.action}`} disabled={!canApprove || !!progressError} />}
                <SubmitButton className={`btn ${styles.action}`} pendingText="Memproses keputusan…" name="decision" value="NEEDS_INFO" disabled={kc.status !== "IN_REVIEW"}>Minta data tambahan</SubmitButton>
                <SubmitButton className={`btn danger ${styles.action}`} pendingText="Memproses keputusan…" name="decision" value="REJECTED" disabled={kc.status !== "IN_REVIEW"}>Tolak pengajuan</SubmitButton>
              </form>
              <p className="small muted" style={{ marginTop: 16 }}>Dua persetujuan review menyiapkan kontrak dan tanda tangan platform secara otomatis. Token baru terbit setelah owner mengonfirmasi pengalihan hak dan pembayaran melalui tanda tangan akuisisi.</p>
            </>}
          </Card>
        </aside>
      </div>
    </div>
  );
}
