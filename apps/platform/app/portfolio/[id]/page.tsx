import Link from "next/link";
import { getAddress } from "viem";
import { Badge, Card, Empty, Flash, Kpi, Notice, PageHeader } from "@venue-rwa/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { RedeemButton, TransferButton } from "@/components/Wallet";
import { DailyBars } from "@/components/visual/DailyBars";
import { PeriodBars } from "@/components/visual/PeriodBars";
import { ValueChart } from "@/components/visual/ValueChart";
import { chain, etherscan, etherscanTx } from "@/lib/chain";
import { requireInvestor } from "@/lib/auth";
import { holding, venueFeed } from "@/lib/holdings";
import { isKycVerified } from "@/lib/flows/investor";
import { pct, rp, short } from "@/lib/format";
import { refund } from "../actions";

export const dynamic = "force-dynamic";
const STATE_ID: Record<string, [string, "ok" | "warn" | "bad" | "neutral" | "info"]> = {
  Draft: ["Belum dibuka", "neutral"], Offering: ["Penawaran dibuka", "info"], Funded: ["Terdanai", "ok"], Active: ["Aktif", "ok"], Closed: ["Selesai", "neutral"], Failed: ["Gagal, refund", "bad"],
};
const KIND: Record<string, [string, "ok" | "warn" | "bad" | "neutral" | "info"]> = { beli: ["beli", "info"], redeem: ["tebus", "warn"], kirim: ["kirim", "neutral"], terima: ["terima", "ok"], periode: ["kantong", "ok"] };
const dt = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Detail satu token yang dipegang investor: posisi, akrual berjalan, grafik, aktivitas, aksi, dan bukti kontrak. */
export default async function TokenDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireInvestor(`/portfolio/${id}`);
  if (!me.wallet) return <div className="container"><Card title="Wallet belum siap"><Empty>Buka <Link href="/portfolio">Portofolio</Link> sebentar supaya wallet Anda dibuat dan ditautkan.</Empty></Card></div>;
  const wallet = getAddress(me.wallet);
  const h = await holding(id, wallet).catch((e) => ({ error: String(e?.message ?? e) }) as const);
  if ("error" in h) return <div className="container"><Card title="Tidak bisa memuat token"><Empty>{h.error}</Empty></Card></div>;
  const { ctx, info, units, locked, paid, basis, perToken, value, history, bars, accrual, activity } = h;
  const { series, venue, ref } = ctx;
  const [stateLabel, stateTone] = STATE_ID[info.state] ?? [info.state, "neutral"];
  const free = h.bal - locked;
  const ownPct = info.minted > 0n ? (units / Number(info.minted)) * 100 : 0;
  const toBreakEven = basis > 0 ? Math.min(999, Math.round(((value + (accrual?.mine ?? 0)) / basis) * 100)) : 0;
  const canRedeem = ["Funded", "Active"].includes(info.state) || (info.state === "Closed" && info.S > 0n);
  const months = Math.round(series.tenor_days / 30);
  // keuangan venue realtime: hanya untuk pemegang token yang sudah KYC (tanpa identitas pelanggan)
  const holder = units > 0 || paid > 0;
  const kycOk = holder ? await isKycVerified(wallet) : false;
  const feed = holder && kycOk && ctx.companyId ? await venueFeed(ctx.companyId, { fundedSince: h.fundedSince, shareBps: series.share_bps }).catch(() => null) : null;
  const TYPE_ID: Record<string, string> = { sale: "Penjualan", refund: "Refund", chargeback: "Chargeback", tax: "Pajak (PB1)", fee: "Biaya gateway" };

  const guide = info.state === "Offering"
    ? <>Penawaran masih dibuka: <b>{rp(Number(info.raised))}</b> terkumpul dari minimum <b>{rp(Number(info.minRaise))}</b>{info.raised >= info.minRaise ? " (minimum sudah tercapai)" : ""}. Omzet baru masuk kantong investor <b>setelah penawaran ditutup dan terdanai</b>. Bila minimum tidak tercapai, Anda di-refund penuh.</>
    : ["Funded", "Active"].includes(info.state)
      ? <>Setiap pembayaran pelanggan yang settle di payment gateway menambah kantong investor sebesar {pct(series.share_bps / 10000)} omzet eligible. <b>Akrual berjalan</b> adalah perkiraan bagian Anda yang belum difinalkan; nilainya pindah ke <b>nilai tebus</b> saat periode difinalkan.</>
      : info.state === "Failed" ? <>Minimum raise tidak tercapai. Anda berhak atas refund penuh.</>
      : info.state === "Closed" ? <>Tenor selesai. Kantong tidak bertambah lagi; Anda bisa menebus token yang tersisa.</>
      : <>Penawaran belum dibuka.</>;

  return (
    <div className="container">
      <p className="small" style={{ marginBottom: 10 }}><Link href="/portfolio">← Portofolio</Link></p>
      <PageHeader title={venue.name} lead={`Token ${series.token_symbol ?? ""} · ${pct(series.share_bps / 10000)} omzet selama ${months} bulan · harga beli ${rp(Number(info.unitPrice))} per token.`}>
        <Badge tone={stateTone}>{stateLabel}</Badge>
        <Link className="btn sm" href={`/offering/${series.id}`}>Halaman penawaran</Link>
      </PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      {(feed || ["Funded", "Active"].includes(info.state)) && <AutoRefresh seconds={30} />}

      <div className="grid c4">
        <Kpi label="Token Anda" value={units.toLocaleString("id-ID")} hint={`${ownPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}% dari ${info.minted.toString()} token terjual${locked > 0n ? ` · ${locked} terkunci` : ""}`} />
        <Kpi label="Sudah dibayar" value={rp(paid)} hint="garis impas" />
        <Kpi label="Nilai tebus sekarang" value={rp(value)} hint={`${rp(perToken)} per token · final`} accent />
        <Kpi label="Akrual berjalan" value={accrual ? `+${rp(accrual.mine)}` : "–"} hint={accrual ? `belum final · sejak ${new Date(accrual.since).toLocaleDateString("id-ID")}` : info.state === "Offering" ? "mulai setelah terdanai" : "tidak ada"} />
      </div>

      <div className="mt">
        <Notice tone={info.state === "Failed" ? "bad" : "info"}>{guide} Saat ini Anda di <b>{toBreakEven}%</b> dari titik impas (nilai tebus + akrual dibanding yang dibayar).</Notice>
      </div>

      <div className="grid c2 mt">
        <Card title="Nilai tebus dari waktu ke waktu" subtitle="Estimasi bagian kantong investor untuk token yang Anda pegang. Bukan harga pasar.">
          {history.length >= 2 ? <ValueChart points={history} paid={basis} title="Riwayat nilai tebus" /> : <Empty>Grafik muncul setelah periode kantong pertama difinalkan.</Empty>}
        </Card>
        <Card title="Masuk kantong per periode" subtitle="Bagian Anda dari setiap periode yang difinalkan (omzet eligible × persen yang dijual × porsi token Anda).">
          {bars.length > 0 ? <PeriodBars bars={bars} title="Bagian Anda per periode" /> : <Empty>Belum ada periode yang difinalkan.</Empty>}
        </Card>
      </div>

      <div className="mt">
        <Card title="Keuangan venue (realtime dari PoS)" subtitle="Langsung dari ledger PoS yang append-only dan di-hash harian. Hanya pembayaran yang settle di payment gateway yang dihitung sebagai omzet. Potongan: refund, pajak, dan biaya gateway. Biaya operasional venue tidak dihitung karena bagi hasil dari omzet, bukan laba."
          actions={<Badge tone="ok" plain>tanpa data pelanggan</Badge>}>
          {!holder ? <Empty>Hanya untuk pemegang token ini.</Empty> : !kycOk ? <Empty>Selesaikan KYC di Portofolio untuk melihat keuangan venue.</Empty> : !ctx.companyId ? <Empty>Workspace PoS venue belum aktif.</Empty> : !feed ? <Empty>Data PoS sedang tidak bisa dimuat. Muat ulang sebentar lagi.</Empty> : (
            <div className="stack" style={{ ["--gap" as any]: "16px" }}>
              <dl className="facts" style={{ margin: 0 }}>
                <div><dt>Omzet settle (30 hari)</dt><dd>{rp(feed.totals.gross)}</dd></div>
                <div><dt>Potongan</dt><dd>{rp(feed.totals.refunds + feed.totals.taxes + feed.totals.fees)}</dd></div>
                <div><dt>Eligible Revenue</dt><dd>{rp(feed.totals.eligible)}</dd></div>
                <div><dt>Hak kantong investor</dt><dd>{rp(feed.totals.investor)}</dd></div>
              </dl>
              {!h.fundedSince && <Notice tone="info">Penawaran belum terdanai, jadi omzet di bawah ini masih hak owner. Setelah penawaran ditutup terdanai, {pct(series.share_bps / 10000)} Eligible Revenue masuk kantong investor.</Notice>}
              <DailyBars days={feed.days} />
              <div>
                <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Transaksi terbaru</div>
                {feed.recent.length === 0 ? <Empty>Belum ada transaksi dalam 30 hari terakhir.</Empty> : (
                  <div className="table-wrap"><table className="table">
                    <thead><tr><th>Waktu</th><th>Jenis</th><th className="r">Nominal</th><th>Status</th><th>Bukti</th></tr></thead>
                    <tbody>{feed.recent.map((e) => (
                      <tr key={e.hash}>
                        <td className="small muted" style={{ whiteSpace: "nowrap" }}>{dt(e.at)}</td>
                        <td>{TYPE_ID[e.type] ?? e.type}</td>
                        <td className="r num">{rp(e.amount)}</td>
                        <td>{e.type === "sale" ? (e.settled ? <Badge tone="ok">settle di gateway</Badge> : <Badge tone="warn">belum settle</Badge>) : <span className="small muted">potongan</span>}</td>
                        <td className="mono small">{short(e.hash)}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {(info.state === "Failed" || (canRedeem && free > 0n) || (["Funded", "Active"].includes(info.state) && free > 0n)) && (
        <div className="mt">
          <Card title="Aksi">
            <div className="stack" style={{ ["--gap" as any]: "16px" }}>
              {info.state === "Failed" && h.bal > 0n && (
                <form action={refund}><input type="hidden" name="back" value={`/portfolio/${series.id}`} /><input type="hidden" name="s" value={series.id} /><button className="btn primary">Ajukan refund penuh ({rp(units * Number(info.unitPrice))})</button></form>
              )}
              {canRedeem && free > 0n && (
                <div><div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Tebus token</div>
                  <RedeemButton seriesId={series.id} series={ref!.series} holder={wallet} nonce={h.nonce.toString()} chainId={chain.id} max={Number(free)} valuePerToken={perToken} /></div>
              )}
              {["Funded", "Active"].includes(info.state) && free > 0n && (
                <div><div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Kirim ke investor lain (KYC)</div>
                  <TransferButton seriesId={series.id} series={ref!.series} holder={wallet} nonce={h.tnonce.toString()} chainId={chain.id} max={Number(free)} /></div>
              )}
            </div>
          </Card>
        </div>
      )}

      <div className="mt">
        <Card title="Aktivitas" subtitle="Pembelian, tebus, kiriman, dan periode kantong untuk token ini.">
          {activity.length === 0 ? <Empty>Belum ada aktivitas.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Waktu</th><th>Jenis</th><th>Keterangan</th><th className="r">Nilai</th></tr></thead>
              <tbody>{activity.map((a, i) => (
                <tr key={i}>
                  <td className="small muted" style={{ whiteSpace: "nowrap" }}>{dt(a.at)}</td>
                  <td><Badge tone={KIND[a.kind]![1]} plain>{KIND[a.kind]![0]}</Badge></td>
                  <td><b>{a.title}</b><div className="small muted">{a.detail}{a.tx && <> · <a href={etherscanTx(a.tx)} target="_blank" rel="noreferrer">tx ↗</a></>}</div></td>
                  <td className="r num">{a.amount !== undefined ? (a.kind === "periode" ? `+${rp(a.amount)}` : rp(a.amount)) : "–"}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </div>

      <div className="mt">
        <Card title="Bukti di blockchain" subtitle="Semua angka di atas bisa dicocokkan dengan kontrak di Sepolia.">
          <table className="kv"><tbody>
            <tr><td>Kontrak penawaran (Series)</td><td><a className="mono" href={etherscan(ref!.series)} target="_blank" rel="noreferrer">{short(ref!.series)} ↗</a></td></tr>
            <tr><td>Token ({series.token_symbol ?? ""})</td><td><a className="mono" href={etherscan(ref!.token)} target="_blank" rel="noreferrer">{short(ref!.token)} ↗</a></td></tr>
            <tr><td>Attestation</td><td>{info.attValid ? <Badge tone="ok">valid</Badge> : <Badge tone="warn">tidak valid / dicabut</Badge>}</td></tr>
            <tr><td>Kantong investor (P) / sudah dibayar (R) / suplai (S)</td><td className="num">{rp(Number(info.P))} / {rp(Number(info.R))} / {info.S.toString()}</td></tr>
          </tbody></table>
        </Card>
      </div>
    </div>
  );
}
