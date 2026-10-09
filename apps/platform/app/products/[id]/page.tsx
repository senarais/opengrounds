import { notFound } from "next/navigation";
import { Badge, Card, Flash, KV, Kpi, Notice, PageHeader } from "@venue-rwa/ui";
import { DEMO_PARAMS } from "@venue-rwa/shared";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Statements, Asumsi } from "@/components/Statements";
import { BuyBox } from "@/components/Wallet";
import { getMe } from "@/lib/auth";
import { etherscan, etherscanTx, readSeries } from "@/lib/chain";
import { platformDb } from "@/lib/db";
import { getSeries } from "@/lib/flow";
import { balanceOf } from "@/lib/flows/cash";
import { assertCanBuy } from "@/lib/flows/investor";
import { checkDeadlines, periodsOf } from "@/lib/flows/periods";
import { syncState } from "@/lib/flows/series";
import { dt, rp } from "@/lib/format";
import { xenditConfigured } from "@/lib/psp";

export const dynamic = "force-dynamic";

export default async function Product({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await getSeries(id).catch(() => null);
  if (!ctx || !ctx.address) notFound();
  const { series: s, venue: v } = ctx;
  await checkDeadlines(id).catch(() => null);
  await syncState(id).catch(() => null);
  const info = await readSeries(ctx.address);
  const profile = v.public_profile;
  const me = await getMe().catch(() => null);
  const periods = (await periodsOf(id)).filter((p) => p.status !== "awaiting_owner" && p.status !== "disputed");
  const { data: reserved } = await platformDb().from("orders").select("tokens").eq("series_id", id).in("status", ["AWAITING_PAYMENT", "PAID"]);
  const available = Math.max(0, Number(info.treasuryBalance) - (reserved ?? []).reduce((a, o) => a + Number(o.tokens), 0));
  let buyBlock: string | null = null;
  if (me?.role === "investor") await assertCanBuy(me).catch((e) => (buyBlock = e.message));
  const balance = me?.role === "investor" ? await balanceOf(me.userId) : 0;
  const val = profile?.valuation;
  const bad = ["Disputed", "Overdue", "Defaulted", "Liquidating", "Closed"].includes(info.state);

  return (
    <div className="container">
      <AutoRefresh seconds={20} />
      <PageHeader eyebrow={`${v.city}, ${v.province}`} title={v.name} lead={`Seri ${s.symbol}: hak manfaat ekonomi atas ${(s.stake_bps / 100).toFixed(0)}% laba bersih yang bisa dibagikan. Bukan kepemilikan tanah, bukan saham.`}>
        <Badge tone={info.state === "Active" ? "ok" : bad ? "bad" : "neutral"}>{info.state}</Badge>
      </PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      {bad && <Notice tone="bad" title={`Seri berstatus ${info.state}.`}>{info.state === "Overdue" ? "Jatah periode belum tersedia sampai tenggat. Pembelian dan jual balik ditutup sampai pulih." : "Pembelian dan jual balik ditutup. Status dibaca langsung dari kontrak."}</Notice>}

      <div className="grid c4 mt">
        <Kpi label="Harga referensi" value={rp(Number(info.refPriceIdr))} hint="per token; harga yang dibayar, bukan penghasilan" />
        <Kpi label="Token beredar" value={`${Number(info.circulating).toLocaleString("id-ID")} / ${Number(info.supply).toLocaleString("id-ID")}`} hint="sisanya di treasury Grounds" />
        <Kpi label="Pemegang" value={String(info.holderCount)} />
        <Kpi label="Periode diposting" value={String(info.lastPeriodId)} />
      </div>

      <div className="grid c2 mt">
        <Card title="Beli token" subtitle="Anda menandatangani pesanan sendiri; token masuk setelah rupiah diterima">
          {me?.role === "investor" ? (
            buyBlock ? <Notice tone="warn">{buyBlock} <a href="/portfolio" style={{ fontWeight: 700 }}>Ke Portofolio</a></Notice> :
            info.state !== "Active" ? <p className="muted">Pembelian dibuka saat seri Active.</p> :
            <BuyBox seriesId={id} refPrice={Number(info.refPriceIdr)} available={available} balance={balance} gateway={xenditConfigured() ? "xendit" : "mock"} />
          ) : me ? <p className="muted">Hanya akun investor yang bisa membeli.</p> : <p>Masuk atau daftar sebagai investor untuk membeli. <a href="/register" style={{ fontWeight: 700 }}>Daftar</a></p>}
          <div className="divider" />
          <Statements compact />
        </Card>
        <Card title="Valuasi: dari mana harga referensi" subtitle="Rumus lengkap di halaman Cara kerja">
          {val ? <KV rows={[
            ["Nilai aset (input reviewer)", <>{rp(val.assetValue)}</>],
            ["Laba bersih 12 bulan (D12)", rp(val.d12)],
            ["D12 ÷ r (r = " + val.requiredYieldPct + "%)", <>{rp(val.vIncome)}<Asumsi /></>],
            ["V = nilai yang lebih kecil", <>{rp(val.v)} ({val.basis === "asset" ? "dari aset" : "dari pendapatan"})</>],
            ["Imbal hasil tersirat y", <>{val.yieldPct}% {val.inBand ? <Badge tone="ok">dalam rentang</Badge> : <Badge tone="warn">di luar rentang, ditinjau</Badge>}</>],
            ["Porsi dibeli Grounds (X)", val.stakePct + "%"],
            ["Jumlah token (N) · harga nominal", `${val.supply.toLocaleString("id-ID")} · ${rp(val.refPrice)}`],
          ]} /> : <p className="muted">Belum tersedia.</p>}
          <p className="small muted" style={{ marginTop: 8 }}>Aset venue adalah patokan harga, bukan jaminan. Token ini tidak dijamin oleh aset venue.</p>
        </Card>
      </div>

      <div className="grid c2 mt">
        <Card title="Profil venue">
          {profile ? <>
            <KV rows={[["Olahraga", profile.profile.sports.join(", ")], ["Lapangan", `${profile.profile.courts}`], ["Jam operasi", `${profile.profile.openHour}:00–${profile.profile.closeHour}:00`], ["Beroperasi sejak", profile.profile.operatingSince], ["Tujuan dana", profile.profile.useOfFunds]]} />
            <div className="divider" />
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{profile.profile.facilities.map((f: any) => <li key={f.name}>{f.name} · {f.sport} · {f.lengthM}×{f.widthM} m · {f.surface}{f.indoor ? " (indoor)" : ""} · {rp(f.pricePerHour)}/jam</li>)}</ul>
          </> : null}
        </Card>
        <Card title="Risiko yang perlu Anda tahu">
          {profile ? <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Tanah milik sendiri ({profile.risk.landRight}); {profile.risk.landEncumbered ? "SEDANG dijaminkan" + (profile.risk.encumbranceConsent ? " dengan persetujuan kreditur" : "") : "tidak dijaminkan"}.</li>
            <li>{profile.risk.hasDebt ? "Owner memiliki utang" + (profile.risk.debtCovenantRestricts ? " dengan pembatasan penjualan pendapatan" : "") + "." : "Tidak ada utang yang diungkapkan."}</li>
            <li>Porsi pembayaran digital {profile.financials.digitalSharePct}% dari omzet; sisanya tunai tidak terlihat di gateway.</li>
            <li>Jatah bergantung kinerja venue; bulan tanpa laba = jatah nol, tanpa dibawa ke bulan berikutnya.</li>
            <li>Jual balik tidak dijamin. Masa kunci per lot {info.params.lockPeriod / 60} menit (demo mode).<Asumsi /></li>
          </ul> : null}
        </Card>
      </div>

      <div className="section-title mt"><h2>Waterfall per periode</h2></div>
      <Card>
        {periods.length === 0 ? <p className="muted">Belum ada periode yang diposting.</p> : (
          <div style={{ overflowX: "auto" }}><table className="table">
            <thead><tr><th>Periode</th><th>Omzet kotor</th><th>Potongan</th><th>D</th><th>Jatah investor</th><th>Jatah / token</th><th>Status</th></tr></thead>
            <tbody>{periods.map((p) => (
              <tr key={p.id}>
                <td>{p.period_no}<div className="small muted">{dt(p.period_end)}</div></td>
                <td>{rp(Number(p.gross))}</td>
                <td className="small">refund {rp(Number(p.refunds))} · biaya {rp(Number(p.opex))} · pajak {rp(Number(p.tax))} · operator {rp(Number(p.operator_fee))} · cadangan {rp(Number(p.reserve))} · platform {rp(Number(p.platform_fee))}</td>
                <td><b>{rp(Number(p.distributable))}</b></td>
                <td>{rp(Number(p.p_inv))}</td>
                <td>{info.supply > 0n ? "Rp" + (Number(p.p_inv) / Number(info.supply)).toLocaleString("id-ID", { maximumFractionDigits: 2 }) : "-"}</td>
                <td><Badge tone={p.status === "paid" ? "ok" : "warn"}>{p.status === "paid" ? "Dikreditkan" : p.status === "awaiting_topup" ? "Menunggu koreksi owner" : "Diposting"}</Badge></td>
              </tr>))}</tbody>
          </table></div>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>Angka ini ditandatangani platform dan owner, lalu dihitung ulang oleh kontrak. Parameter bertanda Asumsi: m {DEMO_PARAMS.spvFeeBps / 100}%, plafon biaya {DEMO_PARAMS.maxOpexBps / 100}% omzet.</p>
      </Card>

      <Card title="Bukti on-chain" className="mt">
        <KV rows={[
          ["Kontrak seri", <a className="mono" href={etherscan(ctx.address)} target="_blank" rel="noreferrer">{ctx.address}</a>],
          ["Token", <a className="mono" href={etherscan(info.token)} target="_blank" rel="noreferrer">{info.token}</a>],
          ["Aktivasi", s.activated_tx ? <a className="mono" href={etherscanTx(s.activated_tx)} target="_blank" rel="noreferrer">{s.activated_tx.slice(0, 18)}…</a> : "-"],
          ["Hash profil (terikat di attestation)", <span className="mono small">{v.public_profile_hash ?? "-"}</span>],
        ]} />
      </Card>
    </div>
  );
}
