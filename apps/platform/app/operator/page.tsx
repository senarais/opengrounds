import { eligibleBetween } from "@venue-rwa/connectors";
import { Badge, Card, Empty, Flash, Kpi, KV, Notice, PageHeader, Stepper } from "@venue-rwa/ui";
import { SeriesPicker } from "@/components/SeriesPicker";
import { etherscan, publicClient, readSeries, seriesAbi } from "@/lib/chain";
import { posDb } from "@/lib/db";
import { requireArea } from "@/lib/auth";
import { getStaffCtx, getCtx } from "@/lib/flow";
import { operatorAddress } from "@/lib/operator";
import { pct, rp, short } from "@/lib/format";
import { approveRedeem, closeOffering, confirmClean, confirmRedeem, deploy, endTenor, failRedeem, finalizePeriod, openOffering, reconcilePeriod, releaseTranche } from "./actions";

export const dynamic = "force-dynamic";
const FLOW = ["Draft", "Offering", "Funded", "Active", "Closed"];
const RSTATUS = ["–", "Pending", "Disetujui", "Dibayar", "Gagal", "Dibatalkan"];

export default async function OperatorPage({ searchParams }: { searchParams: Promise<{ s?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  await requireArea("operator");
  const ctx = await getStaffCtx(sp.s).catch(() => null);
  if (!ctx) return <div className="container"><Card title="Belum ada seri"><Empty>Belum ada pengajuan yang masuk.</Empty></Card></div>;
  const { pf, series, venue, ref, companyId } = ctx;
  let op: string | null = null;
  try { op = operatorAddress(); } catch {}
  if (!ref) return <Undeployed ctx={ctx} op={op} sp={sp} />;
  const s = await readSeries(ref);

  const [{ data: periods }, { data: custody }, { data: excs }] = await Promise.all([
    pf.from("pool_periods").select("*").eq("series_id", series.id).order("period_id", { ascending: false }),
    pf.from("custody_ledger").select("*").eq("series_id", series.id).order("id", { ascending: false }).limit(10),
    pf.from("recon_exceptions").select("*").eq("series_id", series.id).eq("explained", false).order("date", { ascending: false }),
  ]);
  const marker = periods?.[0];
  let pending = 0, pendingElig = 0;
  if ((s.state === "Funded" || s.state === "Active") && marker?.period_end && companyId) {
    const c = await eligibleBetween(posDb(), companyId!, new Date(marker.period_end), new Date());
    pendingElig = c.eligible;
    pending = Math.floor((c.eligible * s.shareBps) / 10_000);
  }
  const n = Number(s.nextRedeemId);
  const redeems = await Promise.all(Array.from({ length: n }, (_, i) => publicClient.readContract({ address: ref.series, abi: seriesAbi, functionName: "redeems", args: [BigInt(i + 1)] }).then((r: any) => ({ id: i + 1, holder: r[0] as string, units: r[1] as bigint, payout: r[2] as bigint, status: Number(r[3]) }))));
  const stIdx = s.state === "Failed" ? 1 : Math.max(0, FLOW.indexOf(s.state));
  const soldOut = s.minted === s.cap;
  const split = s.state === "Funded" || s.state === "Active";
  const hidden = <input type="hidden" name="s" value={series.id} />;

  return (
    <div className="container">
      <PageHeader eyebrow="Back-office · Operator" title={`Konsol operator · ${venue.name}`} lead={<>Platform memegang <b>kunci operator</b> yang hanya memicu kontrak setelah kustodian (simulasi) mengonfirmasi. Uang riil tidak pernah lewat kontrak: kontrak menyimpan state dan pemicu.</>}>
        {op ? <span className="small muted mono">operator {short(op)}</span> : <Badge tone="bad">Operator belum diset</Badge>}
      </PageHeader>
      <SeriesPicker path="/operator" current={series.id} />
      <Flash ok={sp.ok} err={sp.err} />
      {!op && <div style={{ marginBottom: 18 }}><Notice tone="bad" title="Operator belum disiapkan.">Jalankan <span className="mono">./scripts/setup-operator.sh</span> agar aksi di bawah bisa mengirim transaksi.</Notice></div>}

      <Card>
        <Stepper steps={["Draft", "Penawaran", "Terdanai", "Aktif", "Selesai"]} current={stIdx} failed={s.state === "Failed"} />
        <div className="grid c4 mt">
          <Kpi label="Status on-chain" value={s.state} hint={s.attValid ? "attestation valid" : "attestation TIDAK valid"} />
          <Kpi label="Escrow terkumpul" value={rp(s.raised)} hint={`min ${rp(s.minRaise)} · target ${rp(s.target)}`} />
          <Kpi label="Token terjual" value={`${s.minted}/${s.cap}`} hint={`${rp(s.unitPrice)} per token`} />
          <Kpi label="Dirilis ke owner" value={rp(s.released)} hint={`tahap 1 ${s.tranche1Released ? "✓" : "–"} · tahap 2 ${s.tranche2Released ? "✓" : "–"}`} accent />
        </div>
      </Card>

      <div className="grid c2 mt">
        <Card title="Penawaran & rilis dana">
          <div className="stack" style={{ ["--gap" as any]: "12px" }}>
            <div className="row">
              <form action={openOffering}>{hidden}<button className="btn primary" disabled={s.state !== "Draft"}>1 · Buka penawaran</button></form>
              <form action={closeOffering}>{hidden}<button className="btn" disabled={s.state !== "Offering"}>2 · Tutup penawaran</button></form>
              <form action={releaseTranche}>{hidden}<input type="hidden" name="n" value="1" /><button className="btn primary" disabled={s.state !== "Funded"}>3 · Rilis tahap 1 (50%)</button></form>
            </div>
            <p className="small muted">Kontrak menolak membuka penawaran tanpa attestation valid dan harga di atas maksimal. Bisa ditutup bila waktu habis, <b>terjual habis</b> ({soldOut ? "sudah" : "belum"}), atau attestation dicabut. <b>Cara 1</b>: minimum {rp(s.minRaise)} tercapai ⇒ Funded; jika tidak ⇒ Failed dan refund penuh. Tahap 1 cair saat target tercapai dan attestation masih valid.</p>
          </div>
        </Card>

        <Card title="Kantong investor" actions={split ? <Badge tone="ok">split aktif</Badge> : <Badge>belum aktif</Badge>}>
          <KV rows={[
            ["P · total masuk kantong (final)", rp(s.P)],
            ["R · sudah/akan dibayar", rp(s.R)],
            ["S · suplai akuntansi", `${s.S} token`],
            ["Nilai tebus/token (estimasi)", rp(s.redeemValue)],
            ["Akrual real-time (pending)", <span key="a"><b>{rp(pending)}</b><br /><span className="small muted">{pct(s.shareBps / 10000)} × {rp(pendingElig)}</span></span>],
          ]} />
          <div className="row mt-s">
            <form action={finalizePeriod}>{hidden}<button className="btn primary" disabled={!split}>4 · Finalkan periode</button></form>
            <form action={reconcilePeriod}>{hidden}<button className="btn" disabled={Number(s.lastPeriod) < 1}>5 · Rekonsiliasi periode {String(s.lastPeriod)}</button></form>
            <form action={confirmClean}>{hidden}<button className="btn" disabled={!(periods ?? []).some((p) => p.reconciled === false) || (excs ?? []).length > 0}>Konfirmasi periode bersih (setelah exception dijelaskan)</button></form>
            <form action={releaseTranche}>{hidden}<input type="hidden" name="n" value="2" /><button className="btn primary" disabled={!s.tranche1Released || s.tranche2Released || s.state !== "Active"}>6 · Rilis tahap 2</button></form>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>Final setelah settlement PSP dan jendela refund lewat (di demo: langsung). Tahap 2 hanya cair bila periode pertama terekonsiliasi <b>tanpa exception</b> dan attestation valid{s.exceptionOpen && <>; <Badge tone="bad">exception auditor terbuka menahannya</Badge></>}.</p>
        </Card>
      </div>

      {excs && excs.length > 0 && (
        <div className="mt">
          <Card tone="bad" title="Exception terbuka" actions={<Badge tone="bad">{excs.length}</Badge>}>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Tanggal</th><th>Jenis</th><th className="r">Nominal</th></tr></thead>
              <tbody>{excs.map((e) => <tr key={e.id}><td>{e.date}</td><td>{e.kind}</td><td className="r">{rp(e.amount)}</td></tr>)}</tbody>
            </table></div>
            <p className="small muted" style={{ marginTop: 10 }}>Rilis tahap 2 ditahan. Auditor dapat menandai exception on-chain dan penandatangan dapat mencabut attestation.</p>
          </Card>
        </div>
      )}

      <div className="mt">
        <Card title="Antrian redeem" subtitle="request → token dikunci → kustodian bayar → konfirmasi → burn (gagal = buka kunci). FIFO.">
          {redeems.length === 0 ? <Empty>Belum ada permintaan. Investor mengajukan dari halaman Portofolio.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>#</th><th>Holder</th><th className="r">Token</th><th className="r">Dibayar</th><th>Status</th><th /></tr></thead>
              <tbody>{redeems.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td><td className="mono">{short(r.holder)}</td><td className="r">{r.units.toString()}</td><td className="r">{r.payout > 0n ? rp(r.payout) : "–"}</td>
                  <td><Badge tone={r.status === 3 ? "ok" : r.status === 4 ? "bad" : r.status === 2 ? "warn" : "neutral"}>{RSTATUS[r.status]}</Badge></td>
                  <td className="r">
                    {r.status === 1 && <form action={approveRedeem} className="inline">{hidden}<input type="hidden" name="id" value={r.id} /><button className="btn sm primary">Setujui (kunci angka)</button></form>}
                    {r.status === 2 && <><form action={confirmRedeem} className="inline">{hidden}<input type="hidden" name="id" value={r.id} /><button className="btn sm primary">Kustodian sudah bayar → bakar token</button></form>{" "}<form action={failRedeem} className="inline">{hidden}<input type="hidden" name="id" value={r.id} /><button className="btn sm danger">Gagal</button></form></>}
                  </td>
                </tr>))}
              </tbody>
            </table></div>
          )}
        </Card>
      </div>

      <div className="grid c2 mt">
        <Card title="Periode pembukuan">
          {periods?.some((p) => p.period_id > 0) ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>#</th><th className="r">Eligible</th><th className="r">Ke kantong</th><th>Rekonsiliasi</th></tr></thead>
              <tbody>{periods.filter((p) => p.period_id > 0).map((p) => <tr key={p.period_id}><td>{p.period_id}</td><td className="r">{rp(p.eligible_revenue ?? 0)}</td><td className="r">{rp(p.final_amount ?? 0)}</td><td>{p.reconciled === true ? <Badge tone="ok">bersih</Badge> : p.reconciled === false ? <Badge tone="bad">exception</Badge> : <Badge>belum</Badge>}</td></tr>)}</tbody>
            </table></div>
          ) : <Empty>Belum ada periode.</Empty>}
        </Card>
        <Card title="Kustodian (SIMULASI)" subtitle="Produksi: bank/mitra kustodian berlisensi; platform tidak memegang dana pihak ketiga.">
          <div style={{ marginBottom: 12 }}><Notice tone="warn" title="Pool di Xendit belum aktif.">Pembayaran pelanggan sudah lewat Xendit (test mode), tetapi split ke sub-akun butuh xenPlatform yang belum aktif di akun ini. Kantong investor dicatat per transaksi di sini. Lihat <span className="mono">docs/XENDIT.md</span>.</Notice></div>
          {custody && custody.length ? (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Akun</th><th className="r">Jumlah</th><th>Ref</th></tr></thead>
              <tbody>{custody.map((c) => <tr key={c.id}><td>{c.account}</td><td className="r">{rp(c.amount)}</td><td className="muted small">{c.ref}</td></tr>)}</tbody>
            </table></div>
          ) : <Empty>Belum ada mutasi.</Empty>}
        </Card>
      </div>

      <div className="row mt">
        <form action={endTenor}>{hidden}<button className="btn sm" disabled={!split}>Akhiri tenor (hanya bila tenor habis)</button></form>
        <a className="small muted" href={etherscan(ref.series)} target="_blank">Series di Etherscan ↗</a>
      </div>
    </div>
  );
}

/** Seri belum punya kontrak: satu-satunya aksi adalah deploy. */
function Undeployed({ ctx, op, sp }: { ctx: Awaited<ReturnType<typeof getCtx>>; op: string | null; sp: { ok?: string; err?: string } }) {
  const { series, venue } = ctx;
  return (
    <div className="container">
      <PageHeader eyebrow="Back-office · Operator" title={`Konsol operator · ${venue.name}`} lead="Kontrak seri belum dideploy. Setiap pengajuan mendapat kontrak Series (dan token) sendiri; attestation reviewer terikat ke alamat kontrak itu.">
        {op ? <span className="small muted mono">operator {short(op)}</span> : <Badge tone="bad">Operator belum diset</Badge>}
      </PageHeader>
      <SeriesPicker path="/operator" current={series.id} />
      <Flash ok={sp.ok} err={sp.err} />
      {series.review_status !== "approved" && <div style={{ marginBottom: 14 }}><Notice tone="warn" title={series.review_status === "rejected" ? "Pengajuan ditolak reviewer." : "Menunggu putusan review."}>{series.review_status === "rejected" ? `Alasan: ${series.review_note}. Kontrak tidak akan dideploy.` : "Operator DAN auditor harus sama-sama menyetujui (tanda tangan MetaMask) di halaman Review. Begitu suara kedua masuk, kontrak dideploy otomatis."}</Notice></div>}
      <Card title="Deploy kontrak seri" subtitle={`${series.name} · simbol ${series.token_symbol}`}>
        <KV rows={[
          ["Target / minimum raise", `${rp(series.target)} / ${rp(series.min_raise)}`],
          ["Harga per token", rp(series.unit_price)],
          ["Bagian omzet / tenor", `${pct(series.share_bps / 10000)} / ${Math.round(series.tenor_days / 30)} bulan`],
          ["Admin & operator kontrak", op ? short(op) + " (hot wallet platform di server, diungkapkan): admin = boleh mengatur peran di kontrak; operator = yang mengirim transaksi harian (buka/tutup penawaran, rilis dana, finalisasi periode, proses redeem). Tidak bisa mint tanpa attestation valid." : "belum diset"],
        ]} />
        <form action={deploy} className="mt-s"><input type="hidden" name="s" value={series.id} /><button className="btn primary" disabled={!op || series.review_status !== "approved"}>Deploy kontrak ke Sepolia</button></form>
        <p className="small muted" style={{ marginTop: 10 }}>Gas diestimasi oleh node Sepolia (biayanya jauh di atas estimasi lokal Foundry; operator perlu saldo ETH cukup). Normalnya deploy berjalan otomatis setelah review disetujui; tombol ini untuk mengulang bila deploy otomatis gagal (mis. saldo ETH operator kurang).</p>
      </Card>
    </div>
  );
}
