import Link from "next/link";
import { Badge, Bars, Card, Empty, Flash, KV, Notice, PageHeader, Progress } from "@venue-rwa/ui";
import { SeriesPicker } from "@/components/SeriesPicker";
import { requireArea } from "@/lib/auth";
import { posDb } from "@/lib/db";
import { getStaffCtx } from "@/lib/flow";
import { dt, pct, rp } from "@/lib/format";
import { runVerification } from "@/lib/stats";
import { saveVerification } from "./actions";

export const dynamic = "force-dynamic";
const KIND: Record<string, string> = { fictitious_booking: "Booking fiktif (referensi pelanggan berulang)", cash_outside_system: "Pembayaran tunai di luar sistem", unexplained_gap: "Selisih tak terjelaskan", hash_chain_broken: "Rantai hash putus" };
const BAND: Record<string, [string, "ok" | "warn" | "bad"]> = {
  ok: ["Dalam pita (≤ +10%)", "ok"], ok_below_reference_warning: ["Di bawah referensi: boleh, dengan peringatan", "warn"],
  needs_reviewer: ["+10–25%: butuh reviewer dan bukti baru", "warn"], rejected: ["> +25%: ditolak otomatis", "bad"],
};

export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ s?: string; asof?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  await requireArea("verification");
  const ctx = await getStaffCtx(sp.s).catch(() => null);
  if (!ctx) return <div className="container"><Card title="Belum ada seri"><Empty>Belum ada pengajuan.</Empty></Card></div>;
  const { series, venue, companyId } = ctx;
  const asof = sp.asof === "30" ? "30" : "now";
  const head = (
    <>
      <PageHeader eyebrow="Back-office · Verifikasi" title={`Verifikasi dari data PoS · ${venue.name}`} lead="Rekonsiliasi buku PoS dengan settlement gateway, lalu policy engine deterministik memberi skor dan rekomendasi. AI hanya menilai; yang menandatangani adalah manusia." />
      <SeriesPicker path="/verification" current={series.id} />
      <Flash ok={sp.ok} err={sp.err} />
    </>
  );
  if (!companyId) return <div className="container">{head}<Card title="Belum ada data PoS"><Notice tone="info">Perusahaan ini belum punya workspace PoS (dibuat saat attestation disetujui). Selama itu, verifikasi memakai data yang dilaporkan owner; lihat hasilnya di halaman Reviewer.</Notice></Card></div>;

  const at = asof === "30" ? new Date(Date.now() - 30 * 86_400_000) : new Date();
  const out = await runVerification(posDb(), companyId, at, venue.dossier, { target: Number(series.target), unitPrice: Number(series.unit_price), shareBps: series.share_bps, tenorDays: series.tenor_days }, venue.ai_report?.checks);
  const { policy, recon } = out;
  const pass = policy.recommendation === "pass";
  const [bandText, bandTone] = BAND[policy.price.band]!;
  const base = `/verification?s=${series.id}`;

  return (
    <div className="container">
      {head}
      <div className="row" style={{ gap: 8, marginBottom: 18 }}>
        <b>Verifikasi pada</b>
        <Link className={`badge ${asof === "30" ? "accent" : ""}`} href={`${base}&asof=30`}>30 hari lalu (saat pengajuan)</Link>
        <Link className={`badge ${asof === "now" ? "accent" : ""}`} href={`${base}&asof=now`}>Sekarang</Link>
        <span className="muted small">data sampai {dt(out.asOf)} · {out.entryCount.toLocaleString("id-ID")} entri ledger</span>
      </div>

      <Card tone={pass ? "ok" : "bad"} title="Rekomendasi policy engine" actions={<Badge tone={pass ? "ok" : "bad"}>{pass ? "LOLOS" : "TIDAK LOLOS"}</Badge>}>
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div>
            <div className="eyebrow">Skor</div>
            <div className="num" style={{ fontFamily: "var(--font-head)", fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{policy.score.toLocaleString("id-ID")}<span className="muted" style={{ fontSize: 16, fontWeight: 600 }}> / 10.000</span></div>
          </div>
          <form action={saveVerification}><input type="hidden" name="s" value={series.id} /><input type="hidden" name="asof" value={asof} /><button className="btn primary">Simpan sebagai dasar attestation</button></form>
        </div>
        {policy.reasons.length > 0 && <div className="mt-s"><Notice tone="bad" title="Alasan:">{policy.reasons.join(" · ")}</Notice></div>}
      </Card>

      <div className="grid c2 mt">
        <Card title="Gerbang wajib (pass/fail)">
          <div className="stack" style={{ ["--gap" as any]: "10px" }}>
            {policy.gates.map((g) => (
              <div key={g.id} className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                <div><div style={{ fontWeight: 600 }}>{g.label}</div><div className="small muted">{g.detail}</div></div>
                <Badge tone={g.pass ? "ok" : "bad"}>{g.pass ? "lolos" : "gagal"}</Badge>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Skor">
          <div className="stack" style={{ ["--gap" as any]: "12px" }}>
            {policy.components.map((c) => (
              <div key={c.id}>
                <div className="row between small"><span><b>{c.label}</b> <span className="muted">· {c.detail}</span></span><span className="num">{c.points}/{c.max}</span></div>
                <div style={{ marginTop: 5 }}><Progress slim value={c.points} max={c.max} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid c2 mt">
        <Card title="Harga token">
          <KV rows={[
            ["Harga referensi", rp(policy.price.reference)],
            ["Harga maksimal (masuk attestation)", rp(policy.price.maxPrice)],
            ["Harga diajukan owner", rp(policy.price.proposed)],
            ["Pita harga", <Badge key="b" tone={bandTone}>{bandText}</Badge>],
            ["Haircut", `${pct(policy.price.haircut)} (data ${out.monthly.length} bln)`],
          ]} />
          <p className="small muted" style={{ marginTop: 12 }}>Referensi = proyeksi bayaran per token selama tenor ÷ (1 + margin minimum investor 30%). Angka 10/25/30 adalah parameter kebijakan, bukan hasil riset benchmark.</p>
        </Card>
        <Card title="Eligible Revenue per 30 hari" subtitle="Hanya penjualan yang settle di PSP, dikurangi refund, pajak, dan biaya gateway.">
          <Bars rows={out.monthly.map((m, i) => ({ label: `${(out.monthly.length - 1 - i) * 30}–${(out.monthly.length - i) * 30}h`, value: m, display: rp(m) }))} />
        </Card>
      </div>

      <div className="mt">
        <Card tone={recon.exceptions.length ? "bad" : undefined} title="Rekonsiliasi: PoS vs settlement PSP" actions={recon.exceptions.length === 0 ? <Badge tone="ok">bersih</Badge> : <Badge tone="bad">{recon.exceptions.length} exception terbuka</Badge>}>
          <p className="muted small">Hanya selisih tak terjelaskan yang masuk exception queue (jendela {out.openExceptionWindowDays} hari terakhir). {recon.chainBrokenAt >= 0 ? "Rantai hash putus!" : "Rantai hash ledger utuh."}</p>
          {recon.exceptions.length > 0 && (
            <div className="table-wrap mt-s"><table className="table">
              <thead><tr><th>Tanggal</th><th>Jenis</th><th className="r">Nominal</th></tr></thead>
              <tbody>{recon.exceptions.map((e, i) => <tr key={i}><td>{e.date}</td><td>{KIND[e.kind]}</td><td className="r">{rp(e.amount)}</td></tr>)}</tbody>
            </table></div>
          )}
        </Card>
      </div>
    </div>
  );
}
