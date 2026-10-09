import Link from "next/link";
import { notFound } from "next/navigation";
import { priceBand } from "@venue-rwa/shared";
import { Badge, Bars, Card, Empty, Flash, KV, Notice, PageHeader, Progress, Stepper } from "@venue-rwa/ui";
import { requireOwner } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { getCtx } from "@/lib/flow";
import { dt, pct, rp } from "@/lib/format";
import { STATUS } from "@/lib/owner-status";
import { readSeries } from "@/lib/chain";
import { ownerAvailable } from "@/lib/flows/series";
import { AutoRefresh } from "@/components/AutoRefresh";
import { currentSeriesOf } from "@/lib/flows/reprice";
import { withdraw } from "./actions";

export const dynamic = "force-dynamic";
const POS_URL = process.env.POS_URL ?? "http://localhost:3001";
const BAND: Record<string, [string, "ok" | "warn" | "bad"]> = {
  ok: ["Dalam pita (≤ +10%)", "ok"], ok_below_reference_warning: ["Di bawah referensi: boleh, dengan peringatan", "warn"],
  needs_reviewer: ["+10–25%: butuh reviewer dan bukti baru", "warn"], rejected: ["> +25%: ditolak otomatis", "bad"],
};
const DOC_LABEL: Record<string, string> = { sales_data: "Data penjualan", ownership: "Bukti kepemilikan", insurance: "Asuransi", consent_letter: "Surat persetujuan bank", lease: "Perjanjian sewa", bank_statement: "Mutasi rekening", loan: "Kredit & jaminan", tax: "NPWP / pajak", license: "Izin usaha", covenant: "Covenant", other: "Lainnya" };

export default async function ApplicationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireOwner(`/owner/${id}`);
  const pf = platformDb();
  const { data: venue } = await pf.from("venues").select("*").eq("id", id).maybeSingle();
  if (!venue || venue.owner_id !== me.userId) notFound();
  const series = await currentSeriesOf(id);
  const [{ data: run }, { data: docs }] = await Promise.all([
    pf.from("verification_runs").select("*").eq("series_id", series.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    pf.from("documents").select("*").eq("venue_id", id).order("uploaded_at"),
  ]);
  const st = STATUS[venue.status] ?? STATUS.applied!;
  const step = venue.status === "applied" ? 0 : venue.status === "verifying" ? 1 : venue.status === "approved" ? 2 : venue.status === "active" ? (["Funded", "Active", "Closed"].includes(series.status) ? 4 : 3) : 1;
  const g = run?.gates as any;
  const band = run ? priceBand(Number(series.unit_price), Number(run.reference_price)) : null;
  const [bandText, bandTone] = band ? BAND[band]! : ["", "ok" as const];
  const months: number[] = venue.reported_revenue?.months ?? [];
  const ctx = series.contract_address ? await getCtx(series.id) : null;
  const info = ctx?.ref ? await readSeries(ctx.ref).catch(() => null) : null;
  const available = ctx ? await ownerAvailable(ctx) : 0;
  const { data: payouts } = await pf.from("owner_payouts").select("amount, created_at").eq("series_id", series.id).order("created_at", { ascending: false }).limit(5);

  return (
    <div className="container">
      <PageHeader eyebrow="Pengajuan" title={venue.name} lead={`${venue.company_info?.city ?? ""} · ${venue.sport}`}>
        <Badge tone={st.tone}>{st.label}</Badge>
      </PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      {venue.ai_status === "running" && <AutoRefresh />}
      <div style={{ marginBottom: 22 }}><Stepper steps={["Diajukan", "Verifikasi", "Disetujui", "Penawaran", "Dana cair"]} current={step} failed={venue.status === "rejected"} /></div>

      {venue.status === "approved" || venue.status === "active" ? (
        <div style={{ marginBottom: 20 }}>
          <Notice tone="ok" title="Pengajuan disetujui.">Workspace PoS perusahaan Anda sudah aktif: masuk dengan email yang sama di PoS untuk menambah produk dan mencatat booking.
            {" "}<a href={POS_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Buka PoS ↗</a>{series.contract_address && <> · <Link href={`/offering/${series.id}`} style={{ fontWeight: 700 }}>Lihat halaman penawaran →</Link></>}</Notice>
        </div>
      ) : venue.status === "rejected" ? (
        <div style={{ marginBottom: 20 }}><Notice tone="bad" title="Pengajuan tidak disetujui.">{series.review_note ? `Alasan reviewer: ${series.review_note}. ` : ""}Anda dapat mengajukan ulang dengan data yang diperbaiki.</Notice></div>
      ) : (
        <div style={{ marginBottom: 20 }}><Notice tone="info">Verifikasi otomatis sudah selesai. Tiga penandatangan manusia (kuorum 2-dari-3) sedang memeriksa; Anda akan melihat statusnya berubah di halaman ini.</Notice></div>
      )}

      <div className="grid c2">
        <Card title="Hasil verifikasi" actions={run ? <Badge tone={run.recommendation === "pass" ? "ok" : "bad"}>{run.recommendation === "pass" ? "Lolos" : "Tidak lolos"}</Badge> : undefined}>
          {run ? (
            <div className="stack" style={{ ["--gap" as any]: "14px" }}>
              <div><div className="eyebrow">Skor</div><div className="num" style={{ fontFamily: "var(--font-head)", fontSize: 34, fontWeight: 800 }}>{run.score.toLocaleString("id-ID")}<span className="muted" style={{ fontSize: 15 }}> / 10.000</span></div></div>
              {(g?.reasons ?? []).length > 0 && <Notice tone="bad" title="Alasan:">{g.reasons.join(" · ")}</Notice>}
              {(g?.warnings ?? []).map((w: string) => <Notice key={w} tone="warn">{w}</Notice>)}
              <table className="kv"><tbody>{(g?.gates ?? []).map((x: any) => <tr key={x.id}><td>{x.label}<div className="small muted">{x.detail}</div></td><td><Badge tone={x.pass ? "ok" : "bad"}>{x.pass ? "lolos" : "gagal"}</Badge></td></tr>)}</tbody></table>
            </div>
          ) : <Empty>Belum ada hasil.</Empty>}
        </Card>
        <Card title="Penawaran yang diajukan">
          <KV rows={[
            ["Target dana", rp(series.target)], ["Minimum raise (gagal = refund penuh)", rp(series.min_raise)], ["Bagian omzet", pct(series.share_bps / 10000)],
            ["Tenor", `${Math.round(series.tenor_days / 30)} bulan`], ["Harga per token", rp(series.unit_price)], ["Simbol token", series.token_symbol ?? "–"],
            ...(run ? [["Harga referensi / maksimal", `${rp(run.reference_price)} / ${rp(run.max_price)}`] as [string, string], ["Pita harga", <Badge key="b" tone={bandTone}>{bandText}</Badge>] as [string, any]] : []),
          ]} />
        </Card>
      </div>

      {info && info.state !== "Draft" && (
        <div className="mt">
          <Card title="Dana penawaran" subtitle="Kustodian simulasi: dana investor ditahan di escrow dan dirilis bertahap ke saldo Anda.">
            <div className="grid c4">
              <div className="kpi"><div className="label">Terkumpul (escrow)</div><div className="value">{rp(info.raised)}</div><div className="hint">status {info.state}</div></div>
              <div className="kpi"><div className="label">Sudah dirilis ke Anda</div><div className="value">{rp(info.released)}</div><div className="hint">tahap 1 {info.tranche1Released ? "✓" : "–"} · tahap 2 {info.tranche2Released ? "✓" : "–"}</div></div>
              <div className="kpi accent"><div className="label">Saldo bisa ditarik</div><div className="value">{rp(available)}</div></div>
            </div>
            {available > 0 && (
              <form action={withdraw} className="row" style={{ marginTop: 14 }}>
                <input type="hidden" name="id" value={venue.id} />
                <input className="input" name="amount" inputMode="numeric" defaultValue={String(available)} style={{ maxWidth: 220 }} aria-label="Jumlah penarikan" />
                <button className="btn primary">Tarik ke rekening (simulasi)</button>
              </form>
            )}
            {(payouts ?? []).length > 0 && <p className="small muted" style={{ marginTop: 10 }}>Penarikan terakhir: {payouts!.map((p) => `${rp(p.amount)} (${dt(p.created_at)})`).join(" · ")}</p>}
            <p className="small muted" style={{ marginTop: 10 }}>Tahap 2 hanya cair setelah periode pertama terekonsiliasi tanpa exception yang belum dijelaskan.</p>
          </Card>
        </div>
      )}

      <div className="mt">
        <Card title="Analisis dokumen (AI)" subtitle="Dokumen yang Anda unggah dibaca otomatis dan dicocokkan dengan isian formulir. AI hanya mengekstrak; keputusan oleh aturan dan reviewer."
          actions={<Badge tone={venue.ai_status === "done" ? "ok" : venue.ai_status === "failed" ? "bad" : venue.ai_status === "running" ? "warn" : "neutral"}>{venue.ai_status === "done" ? "selesai" : venue.ai_status === "failed" ? "gagal" : venue.ai_status === "running" ? "sedang berjalan" : "menunggu"}</Badge>}>
          {venue.ai_report?.checks ? (
            <table className="kv"><tbody>{(venue.ai_report.checks as any[]).map((c) => <tr key={c.id}><td>{c.label}<div className="small muted">{c.detail}</div></td><td><Badge tone={c.status === "pass" ? "ok" : c.status === "fail" ? "bad" : c.status === "warn" ? "warn" : "neutral"}>{c.status === "pass" ? "cocok" : c.status === "fail" ? "tidak cocok" : c.status === "warn" ? "peringatan" : "dicek manual"}</Badge></td></tr>)}</tbody></table>
          ) : venue.ai_report?.error ? <Notice tone="warn">Analisis otomatis tidak berjalan: {venue.ai_report.error}. Reviewer akan memeriksa dokumen secara manual.</Notice>
            : <Empty>{venue.ai_status === "running" ? "Sedang dianalisis. Muat ulang halaman ini beberapa saat lagi." : "Belum ada hasil analisis."}</Empty>}
          {(venue.ai_report?.checks as any[] | undefined)?.some((c) => c.status === "fail") && <div style={{ marginTop: 12 }}><Notice tone="bad" title="Ada ketidakcocokan.">Isian formulir berbeda dari isi dokumen. Perbaiki dengan mengajukan ulang bila isian Anda yang keliru; reviewer tetap akan menilai.</Notice></div>}
        </Card>
      </div>

      <div className="grid c2 mt">
        <Card title="Omzet yang Anda laporkan" subtitle="Belum terverifikasi dengan settlement gateway.">
          {months.length ? <Bars rows={months.map((m, i) => ({ label: `−${months.length - i}b`, value: m, display: rp(m) }))} /> : <Empty>–</Empty>}
          <p className="small muted" style={{ marginTop: 10 }}>Okupansi dilaporkan: {venue.reported_revenue?.occupancyPct ?? "–"}%</p>
        </Card>
        <Card title="Dokumen">
          {(docs ?? []).length === 0 ? <Empty>Belum ada dokumen.</Empty> : (
            <table className="table"><thead><tr><th>Jenis</th><th>File</th><th className="r">Ukuran</th></tr></thead>
              <tbody>{docs!.map((d) => <tr key={d.id}><td>{DOC_LABEL[d.kind] ?? d.kind}</td><td className="small">{d.original_name}<div className="mono muted">sha256 {String(d.sha256).slice(0, 12)}…</div></td><td className="r small">{d.size_bytes ? `${Math.round(Number(d.size_bytes) / 1024)} KB` : "–"}</td></tr>)}</tbody></table>
          )}
        </Card>
      </div>
      <div className="mt">
        <Notice tone="info" title="Syarat penawaran terkunci.">
          {Number(series.target / series.unit_price).toLocaleString("id-ID")} token × {rp(Number(series.unit_price))}, {(series.share_bps / 100).toLocaleString("id-ID")}% omzet selama {Math.round(series.tenor_days / 30)} bulan, minimum {rp(Number(series.min_raise))}. Angka ini dikunci sejak pengajuan dikirim dan tercatat di kontrak; tidak bisa diubah dan tidak ada penambahan token.
        </Notice>
      </div>
      <p className="small muted mt">Diajukan {dt(venue.created_at)}.</p>
    </div>
  );
}
