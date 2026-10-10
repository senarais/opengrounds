import Link from "next/link";
import { getAddress, type Address } from "viem";
import { Badge, Card, Empty, Flash, Kpi, Notice, PageHeader, Bars } from "@venue-rwa/ui";
import { SellBackBox, WalletStatus } from "@/components/Wallet";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Statements } from "@/components/Statements";
import { SpotlightPanel } from "@/components/SpotlightPanel";
import { requireInvestor } from "@/lib/auth";
import { readHolder, readSeries, etherscanTx } from "@/lib/chain";
import { diditConfig } from "@/lib/didit";
import { platformDb } from "@/lib/db";
import { balanceOf, ledgerOf, WITHDRAW_STATUS_LABEL, withdrawalsOf } from "@/lib/flows/cash";
import { activeBankAccount, kycOf, syncDiditKyc } from "@/lib/flows/investor";
import { ORDER_STATUS_LABEL, syncOrders } from "@/lib/flows/orders";
import { SELLBACK_STATUS_LABEL } from "@/lib/flows/sellback";
import { date, dt, rp } from "@/lib/format";
import { cancelOrderAction, cancelSellBackAction, mockKycAction, saveBankAction, startKycAction, withdrawAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Investor portfolio · Open Grounds" };

export default async function Portfolio({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; kyc?: string }> }) {
  const sp = await searchParams;
  const me = await requireInvestor();
  if (sp.kyc === "return") await syncDiditKyc(me.userId).catch(() => null);
  const syncErrs = await syncOrders(me.userId).catch(() => []);
  const pf = platformDb();
  const [kyc, bank, balance, ledger, wds] = await Promise.all([kycOf(me.userId), activeBankAccount(me.userId), balanceOf(me.userId), ledgerOf(me.userId, 12), withdrawalsOf(me.userId)]);
  const { data: orders } = await pf.from("orders").select("*, series(symbol, venue_id)").eq("user_id", me.userId).order("created_at", { ascending: false }).limit(15);
  const { data: sbs } = await pf.from("sellback_requests").select("*").eq("user_id", me.userId).order("created_at", { ascending: false }).limit(10);
  const { data: allocated } = await pf.from("orders").select("series_id").eq("user_id", me.userId).eq("status", "ALLOCATED");
  const seriesIds = [...new Set((allocated ?? []).map((o) => o.series_id))];
  const { data: seriesRows } = seriesIds.length ? await pf.from("series").select("*, venues(name)").in("id", seriesIds) : { data: [] as any[] };
  const holdings = me.wallet ? await Promise.all((seriesRows ?? []).map(async (s: any) => {
    const addr = s.contract_address as Address;
    const info = await readSeries(addr);
    const h = await readHolder(addr, info.token, getAddress(me.wallet!));
    return { s, info, h };
  })) : [];
  const kycOk = kyc?.status === "verified";
  const live = diditConfig().configured;
  const bankOk = bank?.status === "verified";
  const canSignOut = true;

  const chartRows = holdings.map((x) => ({
    label: x.s.symbol,
    value: Number(x.h.balance) * Number(x.info.refPriceIdr),
    display: rp(Number(x.h.balance) * Number(x.info.refPriceIdr)),
  })).sort((a, b) => b.value - a.value);

  return (
    <div className="container">
      <AutoRefresh seconds={15} />
      <PageHeader eyebrow="Investor" title="Your portfolio" lead="Track your tokens, available balance, and orders." />
      <Flash ok={sp.ok} err={sp.err} />
      {ledger.some((entry) => String(entry.ref).startsWith("demo-test-balance-")) && <Notice tone="info" title="Demo test balance added">A demo adjustment was added to your ledger. It is simulated and is not a profit distribution.</Notice>}
      {syncErrs.length > 0 && <Notice tone="warn" title="Some orders could not be synced:">{syncErrs[0]}</Notice>}

      <div className="grid c3">
        <Card title="Wallet" subtitle="Created and secured by Privy">
          {me.wallet ? <><span className="mono small">{me.wallet}</span><div className="small muted">No gas required from you. The platform submits transactions.</div></> : <WalletStatus />}
        </Card>
        <Card title="Identity check" subtitle={live ? "Didit verification" : "Sandbox simulation · Didit is not configured"}>
          {kycOk ? <Badge tone="ok">Verified{kyc?.provider === "mock" ? " · mock" : ""}</Badge> : kyc?.status === "rejected" ? <Badge tone="bad">Declined</Badge> : live ? (
            <form action={startKycAction}><button className="btn primary" disabled={!me.wallet}>Start identity check</button><p className="small muted" style={{ marginTop: 6 }}>Didit processes identity documents; the platform receives your status and name.</p></form>
          ) : (
            <form action={mockKycAction} className="stack" style={{ ["--gap" as any]: "8px" }}>
              <label className="field">Full legal name<input className="input" name="name" required minLength={3} defaultValue={me.name} /></label>
              <button className="btn primary" disabled={!me.wallet}>Complete mock check</button>
              <p className="small muted">Simulation only. No identity documents are checked.</p>
            </form>
          )}
        </Card>
        <Card title="Bank account" subtitle="Must be in your own name and match KYC">
          {bank ? <div className="small"><b>{bank.bank}</b> {bank.account_masked}<div className="muted">Account holder · {bank.holder_name}</div>{bank.status === "cooling_off" && <Badge tone="warn">Security hold until {dt(bank.cooling_until)}</Badge>}</div> : null}
          {kycOk ? (
            <details style={{ marginTop: 8 }} open={!bank}><summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>{bank ? "Replace account · 48-hour hold" : "Add bank account"}</summary>
              <form action={saveBankAction} className="stack" style={{ ["--gap" as any]: "8px", marginTop: 8 }}>
                <input className="input" name="bank" placeholder="Bank name" required aria-label="Bank name" />
                <input className="input" name="number" placeholder="Account number" required inputMode="numeric" aria-label="Account number" />
                <input className="input" name="holder" placeholder="Account holder name" required aria-label="Account holder name" />
                <button className="btn">Save account</button>
                <p className="small muted">Name matching is simulated; bank verification is not yet integrated.</p>
              </form>
            </details>
          ) : <p className="small muted">Complete the identity check first.</p>}
        </Card>
      </div>

      <div className="grid c3 mt">
        <Kpi label="Available balance" value={rp(balance)} hint="Your distribution account · simulated" accent />
        <Kpi label="Tokens held" value={holdings.reduce((a, x) => a + Number(x.h.balance), 0).toLocaleString("en-US")} />
        <Kpi label="Accrued distributions" value={rp(holdings.reduce((a, x) => a + Number(x.h.claimable), 0))} hint="Contract calculation; may not yet be credited" />
      </div>

      <div className="section-title mt"><h2>Your tokens</h2><Link className="small" href="/products">Explore venues</Link></div>
      {chartRows.length > 0 && (
        <Card title="Portfolio allocation" subtitle="Token value at current reference prices" className="mb">
          <Bars rows={chartRows} />
        </Card>
      )}
      {holdings.length === 0 ? <Empty>You don’t hold any tokens yet. <Link href="/products" style={{ fontWeight: 700 }}>Explore venues</Link></Empty> : holdings.map(({ s, info, h }) => (
        <SpotlightPanel key={s.id} className="og-portfolio-holding"><div className="card-head"><div><h2><Link href={`/products/${s.id}`}>{s.venues?.name}</Link> · {s.symbol}</h2><p>{info.state} · reference price {rp(Number(info.refPriceIdr))}</p></div></div>
          <div className="grid c2">
            <div>
              <div className="big-amount">{Number(h.balance).toLocaleString("en-US")} <span className="small muted">tokens · {(Number(h.balance) / Number(info.supply) * 100).toFixed(2)}% of supply</span></div>
              <div className="small muted">At current reference price: {rp(Number(h.balance) * Number(info.refPriceIdr))}. No redemption or market price is promised.</div>
              <div className="lots" style={{ marginTop: 10 }}>{h.lots.map((l, i) => {
                const open = l.unlockAt * 1000 <= Date.now();
                return <div className="lot" key={i}><b>{Number(l.amount).toLocaleString("en-US")}</b><span className="small muted">{open ? "eligible for sell-back" : `unlocks ${dt(new Date(l.unlockAt * 1000).toISOString())}`}</span><span className={`lock ${open ? "open" : ""}`}>{open ? "Unlocked" : "Locked"}</span></div>;
              })}</div>
            </div>
            <div>
              <h3>Sell back to treasury</h3>
              {info.state === "Active" ? <SellBackBox seriesId={s.id} unlocked={Number(h.unlocked)} price={Number(info.refPriceIdr) * (10_000 - info.params.sellbackDiscountBps) / 10_000} /> : <p className="small muted">Unavailable while the series is {info.state}.</p>}
            </div>
          </div>
        </SpotlightPanel>
      ))}

      <Card title="How distributions become your balance" className="mt">
        <ol className="small" style={{ paddingLeft: 20, lineHeight: 1.8 }}>
          <li>Customers pay booking fees through the payment gateway. PoS sales are not immediately investor balances.</li>
          <li>At period close, refunds, expenses, tax, and reserves are deducted. The platform and owner approve the profit report.</li>
          <li>Once distribution funds are available, your token-based share is credited. Grounds-held treasury tokens receive their share too.</li>
          <li><b>Withdraw:</b> send funds to your verified bank account · Rp10,000 minimum. <b>Reinvest:</b> sign a new token order using your balance. New tokens have a lock period.</li>
        </ol>
        <p className="small muted">Token reference prices and your distribution balance are separate. Profit does not automatically increase token prices. Rupiah is simulated in this demo.</p>
        <Link href="/products" className="btn sm">Choose a venue to reinvest</Link>
      </Card>
      <div className="grid c2 mt">
        <Card title="Withdraw balance" subtitle="Only to your verified bank account">
          {bankOk && balance >= 10_000 ? (
            <form action={withdrawAction} className="row">
              <input className="input" name="amount" type="number" min={10000} max={balance} defaultValue={balance} aria-label="Withdrawal amount" />
              <button className="btn primary">Request withdrawal</button>
            </form>
          ) : <p className="small muted">{bank?.status === "cooling_off" ? "Withdrawals are paused during the bank-account security hold." : !bank ? "Add a verified bank account first." : "Balance is below the Rp10,000 minimum."}</p>}
          <p className="small muted" style={{ marginTop: 8 }}>You can also use this balance to buy tokens. Reinvestment is never automatic.</p>
          {wds.length > 0 && <table className="table small" style={{ marginTop: 10 }}><tbody>{wds.slice(0, 5).map((w) => <tr key={w.id}><td>{date(w.created_at)}</td><td>{rp(Number(w.amount))}</td><td><Badge tone={w.status === "Settled" ? "ok" : w.status === "Failed" ? "bad" : "info"}>{WITHDRAW_STATUS_LABEL[w.status]}</Badge></td></tr>)}</tbody></table>}
        </Card>
        <Card title="Balance history" subtitle="Append-only ledger; corrections use reversing entries">
          {ledger.length === 0 ? <p className="small muted">No balance activity yet.</p> : <table className="table small"><tbody>{ledger.map((l) => <tr key={l.id}><td>{date(l.created_at)}</td><td>{{ distribution: "Period distribution " + (l.period_no ?? ""), withdrawal: "Withdrawal", withdrawal_reversal: "Failed withdrawal · returned", reinvest: "Reinvestment", sellback: "Sell-back", adjustment: String(l.ref).startsWith("demo-test-balance-") ? "Demo test balance (not a profit distribution)" : "Adjustment" }[l.kind as string]}</td><td style={{ textAlign: "right", color: Number(l.amount) < 0 ? "var(--bad)" : "var(--ok)" }}>{Number(l.amount) < 0 ? "−" : "+"}{rp(Math.abs(Number(l.amount)))}</td></tr>)}</tbody></table>}
        </Card>
      </div>

      <div className="section-title mt"><h2>Orders</h2></div>
      <Card>
        {(orders ?? []).length === 0 ? <p className="small muted">No orders yet.</p> : <table className="table small"><thead><tr><th>Date</th><th>Series</th><th>Tokens</th><th>Amount paid</th><th>Status</th><th /></tr></thead><tbody>{(orders ?? []).map((o: any) => (
          <tr key={o.id}>
            <td>{dt(o.created_at)}</td><td>{o.series?.symbol}</td><td>{Number(o.tokens).toLocaleString("en-US")}</td><td>{rp(Number(o.amount_idr))}{o.funding === "balance" ? " · balance" : ""}</td>
            <td><Badge tone={o.status === "ALLOCATED" ? "ok" : ["FAILED", "CANCELLED", "EXPIRED"].includes(o.status) ? "bad" : "info"}>{ORDER_STATUS_LABEL[o.status]}</Badge>{o.note && <div className="small muted">{o.note}</div>}</td>
            <td>{o.status === "AWAITING_PAYMENT" && o.psp_url && <a className="btn sm primary" href={o.psp_url}>Pay</a>} {["AWAITING_PAYMENT", "AWAITING_SIGNATURE"].includes(o.status) && <form action={cancelOrderAction} style={{ display: "inline" }}><input type="hidden" name="id" value={o.id} /><button className="btn sm ghost">Cancel</button></form>}{o.allocated_tx && <a className="small" href={etherscanTx(o.allocated_tx)} target="_blank" rel="noreferrer">Transaction ↗</a>}</td>
          </tr>))}</tbody></table>}
      </Card>
      {(sbs ?? []).length > 0 && <Card title="Sell-back requests" className="mt"><table className="table small"><tbody>{(sbs ?? []).map((r) => <tr key={r.id}><td>{dt(r.created_at)}</td><td>{Number(r.tokens).toLocaleString("en-US")} tokens</td><td>{rp(Number(r.amount_idr))}</td><td><Badge tone={r.status === "Executed" ? "ok" : r.status === "Queued" ? "info" : "neutral"}>{SELLBACK_STATUS_LABEL[r.status]}</Badge></td><td>{["Queued", "AwaitingSignature"].includes(r.status) && canSignOut && <form action={cancelSellBackAction}><input type="hidden" name="id" value={r.id} /><button className="btn sm ghost">Cancel</button></form>}</td></tr>)}</tbody></table></Card>}
      <div className="mt"><Statements /></div>
    </div>
  );
}
