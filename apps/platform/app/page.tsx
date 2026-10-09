import Link from "next/link";
import { FEE_BPS } from "@venue-rwa/shared";
import { Badge, Card, MascotSay, Progress, Stepper } from "@venue-rwa/ui";
import { MoneyFlow } from "@/components/visual/MoneyFlow";
import { loadOffering, STATE_STEPS, stateStep } from "@/lib/offering";
import { pct, rp } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const o = await loadOffering();
  const step = o?.s ? stateStep(o.s.state) : null;

  return (
    <div className="container">
      <section className="hero">
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Pendanaan venue olahraga</div>
          <h1>Bagi hasil <em>omzet</em> venue, dibuktikan dari data gateway.</h1>
          <p className="lead">Pemilik venue menjual sebagian omzet booking selama tenor tertentu ke banyak investor kecil. Setiap pembayaran pelanggan langsung dibagi: bagian investor masuk kantong bersama, sisanya untuk owner.</p>
          <div className="cta">
            <Link className="btn primary lg" href="/offering">Lihat penawaran</Link>
            <Link className="btn lg" href="/owner">Untuk owner venue</Link>
          </div>
          <div style={{ marginTop: 22 }}><MascotSay>Yang dijual bagian omzet selama tenor, bukan kepemilikan venue. Owner tetap pemilik dan operator.</MascotSay></div>
        </div>

        <Card className="offer" tone="accent">
          {o ? (
            <>
              <div className="row between"><span className="eyebrow">Penawaran aktif</span><Badge tone={o.s?.state === "Offering" ? "ok" : o.s?.state === "Draft" ? "warn" : "info"}>{!o.s || o.s.state === "Draft" ? "Dalam verifikasi" : o.s.state}</Badge></div>
              <h2 style={{ margin: "10px 0 2px", fontSize: 22 }}>{o.venue.name}</h2>
              <p className="muted small">{o.venue.disclosure?.public ? `${o.venue.disclosure.public.profile.area}, ${o.venue.disclosure.public.profile.city} · ${o.venue.disclosure.public.profile.sports.join(", ")}` : "Venue olahraga"}</p>
              <dl className="facts">
                <div><dt>Bagian omzet</dt><dd>{pct(o.series.share_bps / 10000)}</dd></div>
                <div><dt>Tenor</dt><dd>{Math.round(o.series.tenor_days / 30)} bulan</dd></div>
                <div><dt>Harga/token</dt><dd>{rp(o.series.unit_price)}</dd></div>
              </dl>
              <div style={{ marginTop: 18 }}>
                {o.s ? <Progress value={Number(o.s.raised)} max={Number(o.s.target)} left={<>{rp(o.s.raised)} terkumpul</>} right={<>target {rp(o.s.target)}</>} /> : null}
              </div>
              <Link className="btn primary" style={{ marginTop: 18, width: "100%" }} href={`/offering/${o.series.id}`}>Detail & bukti pendapatan →</Link>
            </>
          ) : (
            <p className="muted">Belum ada penawaran. Owner venue dapat mendaftar dan mengajukan penjualan omzet dari menu "Untuk owner".</p>
          )}
        </Card>
      </section>

      {o && o.s && step && (
        <Card title="Status penawaran" subtitle="Dari verifikasi hingga seri selesai. Status dibaca langsung dari kontrak di Sepolia.">
          <Stepper steps={STATE_STEPS} current={step.current} failed={step.failed} />
        </Card>
      )}

      <div className="section-title"><h2>Satu booking, tiga kantong</h2></div>
      <Card subtitle="Contoh pembayaran pelanggan Rp180.000. Angka mengikuti rumus yang sama dengan kontrak dan pembukuan.">
        <MoneyFlow amount={180_000} shareBps={o?.series.share_bps ?? 1000} feeBps={FEE_BPS} split="simulated" />
      </Card>

      <div className="section-title"><h2>Cara kerja</h2></div>
      <div className="steps-grid">
        <div className="s"><h3>Owner mengajukan</h3><p>Mendaftar, mengunggah dokumen, dan menghubungkan sistem booking. Persen dan tenor dikunci di kontrak.</p></div>
        <div className="s"><h3>Verifikasi berlapis</h3><p>Omzet dicocokkan dengan settlement payment gateway setiap hari. Aturan deterministik menghasilkan skor; AI hanya menilai.</p></div>
        <div className="s"><h3>Tim + auditor setuju</h3><p>Review oleh tim dan auditor independen, lalu 2 tanda tangan wallet (wajib termasuk auditor) di blockchain. Tanpa itu, penawaran tidak bisa dibuka.</p></div>
        <div className="s"><h3>Beli & kantong</h3><p>Investor membeli token pada harga tetap. Setiap transaksi pelanggan menambah kantong investor sesuai persen yang dijual.</p></div>
        <div className="s"><h3>Redeem</h3><p>Serahkan token, token dibakar, terima rupiah dari kantong. Bukan pembagian berkala.</p></div>
      </div>

      <div className="section-title"><h2>Mengapa bisa dipercaya</h2></div>
      <div className="grid c3">
        <Card title="Bukti dari gateway"><p className="muted">Platform tidak percaya laporan owner. Omzet dihitung dari settlement PSP; ledger POS hanya sumber sekunder. Selisih tak terjelaskan menjadi exception.</p></Card>
        <Card title="Hash harian di blockchain"><p className="muted">Merkle root ledger harian di-anchor dan di-co-sign pihak independen: bukti data <b>tidak diubah</b>. {o && <>Sudah <b>{o.anchoredDays}</b> hari ter-anchor.</>}</p></Card>
        <Card title="Dana dirilis bertahap"><p className="muted">Sekitar 50% saat target tercapai dan attestation masih valid; sisanya setelah periode pertama terekonsiliasi bersih. Gagal syarat berarti refund penuh.</p></Card>
      </div>

      <div className="mt-l">
        <Card title="Yang perlu Anda pahami" tone="accent">
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
            <li>Token <b>tidak punya harga pasar</b> dan tidak bisa dipindahtangankan. Yang ditampilkan adalah <b>dibayar</b> vs <b>nilai tebus</b> (estimasi).</li>
            <li>Nilai tebus mulai dari sekitar Rp0 dan hanya tumbuh seiring omzet terbukti. <b>Tebus awal berarti kehilangan bagian masa depan.</b></li>
            <li>Dibagi dari <b>omzet</b>, bukan laba: owner tetap membayar bagian investor saat rugi. Tanpa agunan.</li>
            <li>Ini demo di testnet. Tidak ada uang riil, tidak ada penawaran publik, dan tidak ada klaim persetujuan OJK.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
