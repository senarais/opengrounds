import { notFound } from "next/navigation";
import { Badge, Card, Flash, KV, Notice, PageHeader } from "@venue-rwa/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { AttestSignButton, WalletStatus } from "@/components/Wallet";
import { requireOwner } from "@/lib/auth";
import { chain, etherscanTx, readSeries } from "@/lib/chain";
import { platformDb } from "@/lib/db";
import { cashBalance } from "@/lib/flow";
import { KYB_STATUS_LABEL, latestCase } from "@/lib/flows/kyb";
import { ownerOfVenue } from "@/lib/flows/onboarding";
import { checkDeadlines, ingestSplits, PERIOD_STATUS_LABEL, periodsOf, draftWaterfall } from "@/lib/flows/periods";
import { seriesOfVenue } from "@/lib/flows/series";
import { dt, rp } from "@/lib/format";
import { disputeAction, expenseAction, removeExpenseAction, resubmitAction, topupSyncAction } from "./actions";

export const dynamic = "force-dynamic";
const POS_URL = process.env.POS_URL ?? "http://localhost:3001";
export const metadata = { title: "Venue details · Owner portal" };
const CATEGORIES = [["opex", "Operating expenses"], ["operator_fee", "Operator fee"], ["reserve", "Venue reserve"]];

export default async function OwnerVenue({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await requireOwner(`/owner/${id}`);
  if ((await ownerOfVenue(id).catch(() => null)) !== me.userId) notFound();
  const pf = platformDb();
  const { data: v } = await pf.from("venues").select("*").eq("id", id).single();
  const kc = await latestCase(id);
  const s = await seriesOfVenue(id);
  let info = null as Awaited<ReturnType<typeof readSeries>> | null;
  let periods: any[] = [], atts: any[] = [], items: any[] = [], draft = null as Awaited<ReturnType<typeof draftWaterfall>> | null, pocket = 0, ownerCash = 0;
  if (s?.contract_address) {
    await checkDeadlines(s.id).catch(() => null);
    await ingestSplits(s.id).catch(() => null);
    info = await readSeries(s.contract_address);
    periods = await periodsOf(s.id);
    ({ data: atts } = (await pf.from("attestations").select("*").eq("series_id", s.id).in("status", ["collecting"]).order("created_at")) as any);
    if (s.status === "Active" || info.state !== "Verified") {
      const last = periods[0];
      draft = await draftWaterfall(s.id, new Date(last?.period_end ?? s.created_at), new Date()).catch(() => null);
      items = draft?.items ?? [];
    }
    pocket = await cashBalance(s.id, "spv_pocket"); ownerCash = await cashBalance(s.id, "owner");
  }
  const acq = (atts ?? []).find((a) => a.kind === "ACQUISITION_CLOSED");
  const acqSigned = acq && (acq.signatures ?? []).some((x: any) => x.slot === "COUNTERPARTY");

  return (
    <div className="container">
      <AutoRefresh seconds={20} />
      <PageHeader eyebrow="Owner portal" title={v.name} lead={`${v.city}, ${v.province}`}>{v.pos_company_id && <a className="btn dark" href={POS_URL} target="_blank" rel="noreferrer">Open PoS ↗</a>}</PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      {!me.wallet && <Notice tone="warn" title="Your wallet is being prepared.">Use it to sign the acquisition and monthly profit figures. The platform covers transaction gas. <WalletStatus /></Notice>}

      <Card title="KYB review" subtitle="Automated checks followed by independent human review" className="mt">
        <div className="row"><Badge tone={kc?.status === "APPROVED" ? "ok" : kc?.status === "REJECTED" ? "bad" : kc?.status === "NEEDS_INFO" ? "warn" : "info"}>{KYB_STATUS_LABEL[kc?.status ?? "DRAFT"]}</Badge></div>
        {kc?.decision_note && <p className="small" style={{ marginTop: 8 }}><b>Reviewer note:</b> {kc.decision_note}</p>}
        {kc?.status === "NEEDS_INFO" && <form action={resubmitAction}><input type="hidden" name="venueId" value={id} /><button className="btn" style={{ marginTop: 8 }}>Resubmit for review</button></form>}
        {kc?.status === "REJECTED" && <p className="small muted">Submit a new application after addressing the reviewer’s notes.</p>}
      </Card>

      {s && !acq && s.status === "Verified" && <div className="mt"><Notice tone="info" title="Review approved">The platform is preparing the acquisition signature. Review the rights transfer and simulated payment details, then sign with your wallet.</Notice></div>}
      {acq && (
        <Card title="Acquisition signature" subtitle="ACQUISITION_CLOSED · platform + owner" tone="accent" className="mt">
          <p className="small">By signing, you confirm that <b>{(s!.stake_bps / 100).toLocaleString("en-US")}%</b> of this venue’s distributable net profit rights transfer to Grounds and that you received <b>{rp(Math.floor(Number(s!.valuation_idr) * s!.stake_bps / 10_000))}</b> (<b>simulated</b>; no money moves). Once both signatures are complete, {Number(s!.supply).toLocaleString("en-US")} tokens are minted to the Grounds treasury.</p>
          <KV rows={[["Valuation (V)", rp(Number(s!.valuation_idr))], ["Reference price", rp(Number(s!.ref_price))], ["Grounds · platform", (acq.signatures ?? []).some((x: any) => x.slot === "PLATFORM") ? <Badge tone="ok">Signed</Badge> : "Awaiting"], ["Owner", acqSigned ? <Badge tone="ok">Signed</Badge> : "Awaiting"]]} />
          {!acqSigned && <div style={{ marginTop: 10 }}><AttestSignButton attId={acq.id} via="privy" chainId={chain.id} label="Review & sign acquisition" confirmText={`You confirm that ${(s!.stake_bps / 100).toLocaleString("en-US")}% of ${v.name}’s distributable net profit rights transfer to Grounds, and that you received ${rp(Math.floor(Number(s!.valuation_idr) * s!.stake_bps / 10_000))}. This is a testnet simulation; no real money moves.`} /></div>}
        </Card>
      )}

      {s && info && (
        <>
          <div className="grid c3 mt">
            <Card title="Series"><Badge tone={info.state === "Active" ? "ok" : "warn"}>{info.state}</Badge><div className="small muted" style={{ marginTop: 6 }}>{Number(info.supply).toLocaleString("en-US")} tokens · {Number(info.circulating).toLocaleString("en-US")} circulating</div></Card>
            <Card title="SPV pocket · current period" subtitle="Daily split from booking payments · sandbox"><div className="big-amount">{rp(pocket)}</div><div className="small muted">{s.split_bps / 100}% of each booking payment; reconciled at period close.</div></Card>
            <Card title="Owner receipts · simulated"><div className="big-amount">{rp(ownerCash)}</div><div className="small muted">Acquisition funds + daily split − platform fee ± true-up</div></Card>
          </div>

          {info.state !== "Verified" && (
            <Card title="Current-period expenses" subtitle="Only approved expenses enter the monthly waterfall." className="mt">
              <form action={expenseAction} className="grid c3" style={{ alignItems: "end" }}>
                <input type="hidden" name="venueId" value={id} /><input type="hidden" name="seriesId" value={s.id} />
                <label className="field">Category<select className="input" name="category">{CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="field">Amount · Rp<input className="input" name="amount" type="number" min={1} required /></label>
                <label className="field">Note or receipt reference<input className="input" name="note" /></label>
                <button className="btn primary">Add expense</button>
              </form>
              {items.length > 0 && <table className="table small" style={{ marginTop: 10 }}><tbody>{items.map((i) => <tr key={i.id}><td>{i.category}</td><td>{rp(Number(i.amount))}</td><td>{i.note}</td><td><Badge tone={i.status === "approved" ? "ok" : i.status === "rejected" ? "bad" : "warn"}>{i.status === "pending" ? "Pending review" : i.status === "approved" ? "Approved" : "Declined"}</Badge></td><td>{i.status === "pending" && <form action={removeExpenseAction}><input type="hidden" name="venueId" value={id} /><input type="hidden" name="id" value={i.id} /><button className="btn sm ghost">Remove</button></form>}</td></tr>)}</tbody></table>}
              {draft && <p className="small muted" style={{ marginTop: 8 }}>Current estimate · period {draft.periodNo}: gross {rp(draft.w.gross)}, expenses {rp(draft.w.opex)} including gateway fees, tax {rp(draft.w.tax)}.</p>}
            </Card>
          )}

          <div className="section-title mt"><h2>Monthly periods</h2></div>
          {periods.length === 0 ? <Card><p className="muted small">No period has been closed yet.</p></Card> : periods.map((p) => {
            const att = (atts ?? []).find((a) => a.kind === "REVENUE_PERIOD" && Number(a.ref_id) === p.period_no);
            const signed = att && (att.signatures ?? []).some((x: any) => x.slot === "COUNTERPARTY");
            return (
              <Card key={p.id} title={`Period ${p.period_no}`} subtitle={`${dt(p.period_start)} → ${dt(p.period_end)}`} className="mt">
                <div className="row" style={{ marginBottom: 8 }}><Badge tone={p.status === "paid" ? "ok" : p.status === "disputed" ? "bad" : "warn"}>{PERIOD_STATUS_LABEL[p.status]}</Badge></div>
                <div className="grid c2">
                  <div className="wf">
                    <div className="wf-row"><span>Gross revenue · PoS gateway</span><b>{rp(Number(p.gross))}</b></div>
                    {[["Refunds", p.refunds], ["Operating expenses + gateway fees", p.opex], ["Tax", p.tax], ["Operator fee", p.operator_fee], ["Venue reserve", p.reserve], ["Platform fee", p.platform_fee]].map(([l, n]) => <div className="wf-row minus" key={l as string}><span>− {l}</span><span>{rp(Number(n))}</span></div>)}
                    <div className="wf-row total"><span>D · distributable profit</span><span>{rp(Number(p.distributable))}</span></div>
                    <div className="wf-row share"><span>SPV share · X = {(s.stake_bps / 100).toFixed(0)}%</span><span>{rp(Number(p.p_spv))}</span></div>
                  </div>
                  <div>
                    <KV rows={[["SPV pocket collected", rp(Number(p.pocket_collected))], ["True-up", Number(p.true_up) >= 0 ? `surplus ${rp(Number(p.true_up))} returned to you` : `shortfall ${rp(-Number(p.true_up))} due from you`], ["Your profit share", rp(Number(p.distributable) - Number(p.p_spv) + Number(p.operator_fee))]]} />
                    {p.status === "awaiting_owner" && att && !signed && <div className="stack" style={{ marginTop: 10 }}>
                      <p className="small muted">Sign by {dt(p.owner_deadline)}. An independent verifier may sign after this deadline.</p>
                      <AttestSignButton attId={att.id} via="privy" chainId={chain.id} label="Approve figures & sign" confirmText="Do you approve this period’s profit figures?" />
                      <details><summary className="small" style={{ cursor: "pointer" }}>Figures look wrong? Dispute</summary>
                        <form action={disputeAction} className="stack" style={{ marginTop: 8 }}><input type="hidden" name="venueId" value={id} /><input type="hidden" name="seriesId" value={s.id} /><input type="hidden" name="periodNo" value={p.period_no} /><textarea className="input" name="reason" rows={2} required minLength={10} placeholder="Which figure is incorrect, and why?" /><button className="btn sm">Submit dispute</button></form></details>
                    </div>}
                    {p.status === "awaiting_topup" && <div className="stack" style={{ marginTop: 10 }}><Notice tone="warn" title="True-up payment due">Pay through the payment gateway{p.topup_url?.startsWith("/sandbox") ? " · sandbox" : ""}. Investor balances are credited after settlement. An unpaid shortfall can put the series into Overdue.</Notice><div className="row"><a className="btn primary" href={p.topup_url}>Pay {rp(-Number(p.true_up))}</a><form action={topupSyncAction}><input type="hidden" name="venueId" value={id} /><input type="hidden" name="seriesId" value={s.id} /><input type="hidden" name="periodNo" value={p.period_no} /><button className="btn">I have paid</button></form></div></div>}
                    {p.posted_tx && <a className="small" href={etherscanTx(p.posted_tx)} target="_blank" rel="noreferrer">View transaction ↗</a>}
                  </div>
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
