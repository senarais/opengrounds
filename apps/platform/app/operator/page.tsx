import { Badge, Card, Empty, Flash, PageHeader } from "@venue-rwa/ui";
import { requireArea } from "@/lib/auth";
import { operatorAddress, platformAttestorAddress } from "@/lib/operator";
import { etherscan, readSeries, registrySigners, REGISTRY } from "@/lib/chain";
import { platformDb } from "@/lib/db";
import { cashBalance } from "@/lib/flow";
import { runCheats } from "@/lib/flows/admin";
import { periodsOf, PERIOD_STATUS_LABEL } from "@/lib/flows/periods";
import { dt, rp } from "@/lib/format";
import { closePeriodAction, deadlinesAction, expenseReviewAction, forceAction, freezeAction, postPeriodAction, topupAction, valuationAction, windowAction, withdrawalAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operations · Open Grounds" };
const ACCOUNTS = [["spv_capital", "Grounds capital"], ["escrow", "Purchase escrow"], ["spv_pocket", "Grounds pocket"], ["distribution", "Investor distributions"], ["buyback_reserve", "Buyback reserve"], ["owner", "Owner"], ["spv_ops", "Grounds operations"], ["platform_ops", "Platform operations"]] as const;

export default async function Operator({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; cheat?: string }> }) {
  await requireArea("operator");
  const sp = await searchParams;
  const pf = platformDb();
  const { data: series } = await pf.from("series").select("*, venues(name)").not("contract_address", "is", null).order("created_at", { ascending: false });
  const { data: pendingExp } = await pf.from("expense_items").select("*, series(venues(name))").eq("status", "pending");
  const { data: wds } = await pf.from("withdrawals").select("*").in("status", ["Requested", "Screened", "Sent", "Failed"]).order("created_at", { ascending: false }).limit(10);
  let signers: Awaited<ReturnType<typeof registrySigners>> | null = null;
  try { signers = await registrySigners(); } catch { /* registry is not deployed */ }
  const cheats = sp.cheat && series?.find((s) => s.id === sp.cheat) ? await runCheats(sp.cheat).catch((e) => { console.error(e); return null; }) : null;

  return (
    <div className="container">
      <PageHeader eyebrow="Operations" title="Series control room" lead="Close periods, manage buybacks, handle compliance, and track investor withdrawals." />
      <Flash ok={sp.ok} err={sp.err} />
      <Card title="Backend signers" subtitle="Sepolia hot wallet · production key management is a roadmap item">
        <div className="small" style={{ lineHeight: 1.8 }}>
          <div>Series controller / admin: <span className="mono">{(() => { try { return operatorAddress(); } catch { return "not configured"; } })()}</span></div>
          <div>Platform signer · Grounds via Open Grounds: <span className="mono">{(() => { try { return platformAttestorAddress(); } catch { return "not configured"; } })()}</span> · Verifier: <span className="mono">{signers?.verifier ?? "-"}</span></div>
          <div>Registry: {signers ? <a className="mono" href={etherscan(REGISTRY.address)} target="_blank" rel="noreferrer">{REGISTRY.address}</a> : "not deployed"}</div>
          <p className="muted" style={{ margin: "6px 0 0" }}>Demo disclosure: our team controls both Operator and SPV. If platform and verifier keys share control, 2-of-3 demonstrates mechanics only.</p>
        </div>
      </Card>

      {(pendingExp ?? []).length > 0 && <Card title="Expenses awaiting review" className="mt"><table className="table small"><tbody>{pendingExp!.map((e: any) => <tr key={e.id}><td>{e.series?.venues?.name}</td><td>{e.category}</td><td>{rp(Number(e.amount))}</td><td>{e.note}</td><td><form action={expenseReviewAction} className="row"><input type="hidden" name="id" value={e.id} /><input className="input sm" name="note" placeholder="Review note" /><button className="btn sm primary" name="approve" value="1">Approve</button><button className="btn sm" name="approve" value="0">Decline</button></form></td></tr>)}</tbody></table></Card>}

      {(series ?? []).length === 0 ? <div className="mt"><Empty>No series yet. A series is prepared after KYB approval.</Empty></div> : await Promise.all(series!.map(async (s: any) => {
        const info = await readSeries(s.contract_address);
        const periods = await periodsOf(s.id);
        const bal = await Promise.all(ACCOUNTS.map(async ([a]) => cashBalance(s.id, a)));
        const { data: atts } = await pf.from("attestations").select("kind, ref_id, status, signatures").eq("series_id", s.id).eq("status", "collecting");
        const { count: queue } = await pf.from("sellback_requests").select("*", { count: "exact", head: true }).eq("series_id", s.id).eq("status", "Queued");
        return (
          <Card key={s.id} className="mt" title={<>{s.venues?.name} · {s.symbol}</>} subtitle={<span className="mono small">{s.contract_address}</span>}>
            <div className="row"><Badge tone={info.state === "Active" ? "ok" : info.state === "Verified" ? "info" : "bad"}>{info.state}</Badge><span className="small muted">{Number(info.circulating).toLocaleString("en-US")}/{Number(info.supply).toLocaleString("en-US")} circulating · {info.holderCount.toString()} holders · period {info.lastPeriodId.toString()} · {info.openDisputes.toString()} open disputes</span></div>
            {(atts ?? []).length > 0 && <p className="small" style={{ marginTop: 6 }}>Awaiting signatures: {atts!.map((a) => `${a.kind} (${(a.signatures ?? []).map((x: any) => x.slot).join("+") || "-"})`).join(" · ")}</p>}
            {info.state === "Verified" && <p className="small muted" style={{ marginTop: 6 }}>{s.spv_note?.startsWith("SPV approved the acquisition deal") ? "Awaiting the owner’s acquisition signature." : "Awaiting Grounds’ back-office deal approval."}</p>}
            <div className="chips" style={{ marginTop: 10 }}>{ACCOUNTS.map(([a, l], i) => <div className="chip" key={a}><b>{l}</b><span>{rp(bal[i]!)}</span></div>)}</div>
            <p className="small muted">All balances above are simulated.</p>

            {info.state !== "Verified" && (
              <div className="row" style={{ marginTop: 12 }}>
                <form action={closePeriodAction}><input type="hidden" name="seriesId" value={s.id} /><button className="btn primary">Close period & request approval</button></form>
                <form action={deadlinesAction}><input type="hidden" name="seriesId" value={s.id} /><button className="btn">Check overdue/default deadlines</button></form>
                <form action={windowAction}><input type="hidden" name="seriesId" value={s.id} /><button className="btn">Run sell-back window · {queue ?? 0} queued</button></form>
                <a className="btn ghost" href={`/operator?cheat=${s.id}`}>Run rejected-action demo</a>
              </div>
            )}

            {periods.length > 0 && <table className="table small" style={{ marginTop: 12 }}><thead><tr><th>Period</th><th>D</th><th>Investor pool</th><th>Collected</th><th>True-up</th><th>Status</th><th /></tr></thead><tbody>{periods.map((p) => (
              <tr key={p.id}><td>{p.period_no}<div className="muted">{dt(p.period_end)}</div></td><td>{rp(Number(p.distributable))}</td><td>{rp(Number(p.p_inv))}</td><td>{rp(Number(p.pocket_collected))}</td><td>{Number(p.true_up) >= 0 ? "+" : "−"}{rp(Math.abs(Number(p.true_up)))}</td><td><Badge tone={p.status === "paid" ? "ok" : "warn"}>{PERIOD_STATUS_LABEL[p.status]}</Badge></td>
                <td>{p.status === "awaiting_topup" && <form action={topupAction}><input type="hidden" name="seriesId" value={s.id} /><input type="hidden" name="periodNo" value={p.period_no} /><button className="btn sm">Check payment</button></form>}{p.status === "posted" && <form action={postPeriodAction}><input type="hidden" name="seriesId" value={s.id} /><input type="hidden" name="periodNo" value={p.period_no} /><button className="btn sm">Post again</button></form>}</td></tr>))}</tbody></table>}

            {info.state !== "Verified" && (
              <div className="grid c3 mt">
                <div className="stack"><b className="small">Buyback reserve</b><p className="small muted">Grounds funds this reserve from SPV capital on the SPV page.</p></div>
                <form action={valuationAction} className="stack"><input type="hidden" name="seriesId" value={s.id} /><b className="small">Propose revaluation · verifier approval required</b><input className="input" name="valuation" type="number" placeholder="New valuation · Rp" required /><input className="input" name="reason" placeholder="Valuation basis" required /><button className="btn sm">Propose</button></form>
                <div className="stack"><b className="small">Compliance</b>
                  <form action={freezeAction} className="stack"><input type="hidden" name="seriesId" value={s.id} /><input className="input" name="wallet" placeholder="Wallet · 0x…" required /><input className="input" name="reason" placeholder="Reason" required /><div className="row"><button className="btn sm" name="frozen" value="1">Freeze wallet</button><button className="btn sm ghost" name="frozen" value="0">Unfreeze</button></div></form>
                  <details><summary className="small" style={{ cursor: "pointer" }}>Forced transfer</summary><form action={forceAction} className="stack" style={{ marginTop: 6 }}><input type="hidden" name="seriesId" value={s.id} /><input className="input" name="from" placeholder="From wallet · 0x…" required /><input className="input" name="to" placeholder="To verified wallet · 0x…" required /><input className="input" name="tokens" type="number" placeholder="Token amount" required /><input className="input" name="reason" placeholder="Legal basis / reason" required /><button className="btn sm">Submit transfer</button></form></details>
                </div>
              </div>
            )}
            {cheats && sp.cheat === s.id && (
              <div className="stack" style={{ marginTop: 14 }}>
                <h3>Rejected actions · contract enforcement</h3>
                <p className="small muted">Backend controller/platform attempts are simulated locally and are not sent to Sepolia.</p>
                {cheats.map((c) => (
                  <div className="cheat" key={c.id}><span className={`verdict ${c.result.ok ? "passed" : "blocked"}`}>{c.result.ok ? "UNEXPECTED PASS" : "REJECTED"}</span><b>{c.title}</b><span className="small muted">{c.how}</span>{!c.result.ok && <code>{c.result.error}</code>}</div>
                ))}
              </div>
            )}
          </Card>
        );
      }))}

      {(wds ?? []).length > 0 && <Card title="Investor withdrawals · sandbox" className="mt"><table className="table small"><tbody>{wds!.map((w) => <tr key={w.id}><td>{dt(w.created_at)}</td><td>{rp(Number(w.amount))}</td><td><Badge tone={w.status === "Settled" ? "ok" : w.status === "Failed" ? "bad" : "info"}>{w.status}</Badge></td><td>{w.status !== "Failed" && <form action={withdrawalAction} className="row"><input type="hidden" name="id" value={w.id} />{w.status !== "Settled" && <button className="btn sm">Advance</button>}<input className="input sm" name="reason" placeholder="Failure reason" /><button className="btn sm ghost" name="fail" value="1">Mark failed</button></form>}</td></tr>)}</tbody></table></Card>}
    </div>
  );
}
