import { VenueMedia } from "@/components/VenueMedia";
import { notFound } from "next/navigation";
import { Badge, Card, Flash, KV, Kpi, Notice, PageHeader } from "@venue-rwa/ui";
import { DEMO_PARAMS } from "@venue-rwa/shared";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Statements, Asumsi } from "@/components/Statements";
import { BuyBox } from "@/components/Wallet";
import { SpotlightPanel } from "@/components/SpotlightPanel";
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
export const metadata = { title: "Venue series · Open Grounds" };

const sportName: Record<string, string> = { futsal: "Futsal", padel: "Padel", tenis: "Tennis", basket: "Basketball", badminton: "Badminton", voli: "Volleyball", "mini soccer": "Mini soccer", lainnya: "Other" };
const surfaceName: Record<string, string> = { "rumput sintetis": "Artificial turf", vinyl: "Vinyl", "parket kayu": "Wood parquet", "semen/beton": "Concrete", karpet: "Carpet", "tanah liat": "Clay", lainnya: "Other" };
const rightName: Record<string, string> = { SHM: "Freehold · SHM", HGB: "Building use · HGB", HGU: "Cultivation · HGU", HP: "Right to use · HP" };

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
      <PageHeader eyebrow={`${v.city}, ${v.province} · ${s.symbol}`} title={v.name} lead={`A share of ${(s.stake_bps / 100).toFixed(0)}% of distributable net profit rights. Not venue ownership, land, or company equity.`}>
        <Badge tone={info.state === "Active" ? "ok" : bad ? "bad" : "neutral"}>{info.state}</Badge>
      </PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      {bad && <Notice tone="bad" title={`Series status: ${info.state}.`}>{info.state === "Overdue" ? "A distribution is overdue. Purchases and sell-backs are paused until the series recovers." : "Purchases and sell-backs are paused. Status is read from the contract."}</Notice>}

      <VenueMedia venueId={v.id} name={v.name} area={`${v.city}, ${v.province}`} facilities={profile?.profile?.facilities ?? v.facilities ?? []} openHour={v.open_hour} closeHour={v.close_hour} />

      <div className="grid c4 mt">
        <Kpi label="Reference price" value={rp(Number(info.refPriceIdr))} hint="per token · purchase price, not income" />
        <Kpi label="Tokens circulating" value={`${Number(info.circulating).toLocaleString("en-US")} / ${Number(info.supply).toLocaleString("en-US")}`} hint="remaining supply held in Grounds treasury" />
        <Kpi label="Holders" value={String(info.holderCount)} />
        <Kpi label="Periods posted" value={String(info.lastPeriodId)} />
      </div>

      <div className="grid c2 mt">
        <SpotlightPanel className="og-buy-panel"><div className="card-head"><div><h2>Buy tokens</h2><p>Sign your order. Tokens are allocated only after payment settles.</p></div></div>
          {me?.role === "investor" ? (
            buyBlock ? <Notice tone="warn">{buyBlock} <a href="/portfolio" style={{ fontWeight: 700 }}>Open portfolio</a></Notice> :
            info.state !== "Active" ? <p className="muted">Purchases open when the series is Active.</p> :
            <BuyBox seriesId={id} refPrice={Number(info.refPriceIdr)} available={available} balance={balance} gateway={xenditConfigured() ? "xendit" : "mock"} />
          ) : me ? <p className="muted">Purchases are available to investor accounts.</p> : <p>Log in or create an investor account to buy. <a href="/register" style={{ fontWeight: 700 }}>Create account</a></p>}
          <div className="divider" />
          <Statements compact />
        </SpotlightPanel>
        <Card title="How the reference price is set" subtitle="Review the valuation formula">
          {val ? <KV rows={[
            ["Asset value · reviewer input", rp(val.assetValue)],
            ["12-month distributable profit · D12", rp(val.d12)],
            ["D12 ÷ r · r = " + val.requiredYieldPct + "%", <>{rp(val.vIncome)}<Asumsi /></>],
            ["V · lower of asset or income value", <>{rp(val.v)} ({val.basis === "asset" ? "asset basis" : "income basis"})</>],
            ["Implied yield · y", <>{val.yieldPct}% {val.inBand ? <Badge tone="ok">within assumed range</Badge> : <Badge tone="warn">outside range · review</Badge>}</>],
            ["Economic rights acquired · X", val.stakePct + "%"],
            ["Token supply · nominal price", `${val.supply.toLocaleString("en-US")} · ${rp(val.refPrice)}`],
          ]} /> : <p className="muted">Valuation is not available yet.</p>}
          <p className="small muted" style={{ marginTop: 8 }}>Venue assets are a pricing benchmark, not collateral. Tokens are not backed by venue assets.</p>
        </Card>
      </div>

      <div className="grid c2 mt">
          <Card title="Venue profile">
          {profile ? <>
            <KV rows={[["Sports", profile.profile.sports.map((sport: string) => sportName[sport.toLowerCase()] ?? sport).join(", ")], ["Courts", `${profile.profile.courts}`], ["Operating hours", `${profile.profile.openHour}:00–${profile.profile.closeHour}:00`], ["Operating since", profile.profile.operatingSince], ["Use of proceeds", profile.profile.useOfFunds]]} />
            <div className="divider" />
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{profile.profile.facilities.map((f: any) => <li key={f.name}>{f.name} · {sportName[f.sport.toLowerCase()] ?? f.sport} · {f.lengthM}×{f.widthM} m · {surfaceName[f.surface.toLowerCase()] ?? f.surface}{f.indoor ? " · indoor" : ""} · {rp(f.pricePerHour)}/hour</li>)}</ul>
          </> : null}
        </Card>
        <Card title="Risks to consider">
          {profile ? <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Self-owned land ({rightName[profile.risk.landRight] ?? profile.risk.landRight}); {profile.risk.landEncumbered ? "currently pledged" + (profile.risk.encumbranceConsent ? " with lender consent" : " without lender consent") : "not pledged"}.</li>
            <li>{profile.risk.hasDebt ? "The owner has outstanding debt" + (profile.risk.debtCovenantRestricts ? " with restrictions on revenue transfers" : "") + "." : "No debt was disclosed."}</li>
            <li>{profile.financials.digitalSharePct}% of reported gross revenue was paid digitally; cash sales are not gateway-verified.</li>
            <li>Distributions depend on venue performance. A loss-making month has no distribution; losses do not carry forward.</li>
            <li>Buybacks are not guaranteed. Lot lock: {info.params.lockPeriod / 60} minutes in demo mode.<Asumsi /></li>
          </ul> : null}
        </Card>
      </div>

      <div className="section-title mt"><h2>Monthly profit waterfall</h2></div>
      <Card>
        {periods.length === 0 ? <p className="muted">No profit periods have been posted yet.</p> : (
          <div style={{ overflowX: "auto" }}><table className="table">
            <thead><tr><th>Period</th><th>Gross revenue</th><th>Deductions</th><th>D · distributable</th><th>Investor pool</th><th>Per token</th><th>Status</th></tr></thead>
            <tbody>{periods.map((p) => (
              <tr key={p.id}>
                <td>{p.period_no}<div className="small muted">{dt(p.period_end)}</div></td>
                <td>{rp(Number(p.gross))}</td>
                <td className="small">refunds {rp(Number(p.refunds))} · expenses {rp(Number(p.opex))} · tax {rp(Number(p.tax))} · operator {rp(Number(p.operator_fee))} · reserve {rp(Number(p.reserve))} · platform {rp(Number(p.platform_fee))}</td>
                <td><b>{rp(Number(p.distributable))}</b></td>
                <td>{rp(Number(p.p_inv))}</td>
                <td>{info.supply > 0n ? "Rp" + (Number(p.p_inv) / Number(info.supply)).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "-"}</td>
                <td><Badge tone={p.status === "paid" ? "ok" : "warn"}>{p.status === "paid" ? "Credited" : p.status === "awaiting_topup" ? "Owner true-up due" : "Posted"}</Badge></td>
              </tr>))}</tbody>
          </table></div>
        )}
        <p className="small muted" style={{ marginTop: 8 }}>The owner and platform sign these figures; the contract recalculates them. Assumptions: SPV fee m = {DEMO_PARAMS.spvFeeBps / 100}%; expense cap = {DEMO_PARAMS.maxOpexBps / 100}% of gross.</p>
      </Card>

      <Card title="On-chain record" className="mt">
        <KV rows={[
          ["Series contract", <a className="mono" href={etherscan(ctx.address)} target="_blank" rel="noreferrer">{ctx.address}</a>],
          ["Token contract", <a className="mono" href={etherscan(info.token)} target="_blank" rel="noreferrer">{info.token}</a>],
          ["Activation transaction", s.activated_tx ? <a className="mono" href={etherscanTx(s.activated_tx)} target="_blank" rel="noreferrer">{s.activated_tx.slice(0, 18)}…</a> : "-"],
          ["Profile hash · included in attestation", <span className="mono small">{v.public_profile_hash ?? "-"}</span>],
        ]} />
      </Card>
    </div>
  );
}
