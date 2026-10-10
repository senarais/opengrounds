import { Badge, Card, Empty, Flash, KV, Notice, PageHeader } from "@venue-rwa/ui";
import { requireArea } from "@/lib/auth";
import { readSeries } from "@/lib/chain";
import { platformDb } from "@/lib/db";
import { cashBalance } from "@/lib/flow";
import { KYB_STATUS_LABEL } from "@/lib/flows/kyb";
import { treasuryAddress } from "@/lib/operator";
import { rp } from "@/lib/format";
import { fundAction, approveDealAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grounds · SPV operations" };

export default async function Spv({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireArea("spv");
  const sp = await searchParams;
  const { data: series } = await platformDb().from("series").select("*, venues(name, city)").not("contract_address", "is", null).order("created_at", { ascending: false });
  const { data: pipeline } = await platformDb().from("venues").select("id, name, city, submitted_by, offered_stake_bps, created_at, kyb_cases(status, created_at), series(status)").order("created_at", { ascending: false });
  let treasury = "not configured";
  try { treasury = treasuryAddress(); } catch { /* OPERATOR_PRIVATE_KEY is not configured */ }
  return (
    <div className="container">
      <PageHeader eyebrow="Grounds · SPV" title="Acquisition & treasury" lead="Acquire a share of venue profit rights, manage treasury supply, and fund buyback reserves." />
      <Flash ok={sp.ok} err={sp.err} />
      <Notice tone="warn" title="Demo disclosure">The SPV account is controlled by our team. Production requires a legally and operationally separate SPV. Funds are simulated.</Notice>

      <Card title="Grounds treasury wallet" subtitle="Backend-controlled testnet hot wallet · the SPV account has no separate wallet" className="mt">
        <span className="mono small">{treasury}</span>
      </Card>
      <Card title="Venue pipeline" subtitle="Track each application through KYB and series activation" className="mt">
        {(pipeline ?? []).length === 0 ? <p className="small muted">No owner applications yet. Venue owners submit their venues and documents from the owner portal.</p> : <table className="table small"><thead><tr><th>Venue</th><th>Rights offered</th><th>KYB review</th><th>Series</th><th>Submitted by</th></tr></thead><tbody>{pipeline!.map((v: any) => { const kc = [...(v.kyb_cases ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0]; const sr = v.series?.[0]; return <tr key={v.id}><td><b>{v.name}</b><div className="muted">{v.city}</div></td><td>{(v.offered_stake_bps / 100).toFixed(0)}%</td><td><Badge tone={kc?.status === "APPROVED" ? "ok" : kc?.status === "REJECTED" ? "bad" : "info"}>{KYB_STATUS_LABEL[kc?.status ?? "DRAFT"]}</Badge></td><td>{sr ? <Badge tone={sr.status === "Active" ? "ok" : "neutral"}>{sr.status}</Badge> : <span className="muted">Not created</span>}</td><td className="muted">{v.submitted_by ?? "Owner"}</td></tr>; })}</tbody></table>}
        <p className="small muted" style={{ marginTop: 8 }}>Owners submit venue evidence. After Operator and Reviewer approve KYB, Grounds reviews and approves the acquisition deal here; the owner then signs the rights transfer.</p>
      </Card>
      <div className="section-title mt"><h2>Grounds series</h2></div>
      {(series ?? []).length === 0 ? <Empty>No series yet.</Empty> : await Promise.all((series ?? []).map(async (s: any) => {
        const info = await readSeries(s.contract_address);
        const [capital, buyback, escrow] = await Promise.all([cashBalance(s.id, "spv_capital"), cashBalance(s.id, "buyback_reserve"), cashBalance(s.id, "escrow")]);
        return (
          <Card key={s.id} title={s.venues?.name} className="mt">
            <div className="row"><Badge tone={info.state === "Active" ? "ok" : "warn"}>{info.state}</Badge>{info.state === "Verified" && <span className="small muted">{s.spv_note?.startsWith("SPV approved the acquisition deal") ? "Awaiting owner signature" : "Awaiting SPV deal approval"}</span>}</div>
            <KV rows={[["Economic rights acquired", `${s.stake_bps / 100}% of distributable net profit`], ["Valuation", rp(Number(s.valuation_idr))], ["Owner acquisition · simulated", rp(Math.floor(Number(s.valuation_idr) * s.stake_bps / 10_000))], ["Reference price / token", rp(Number(s.ref_price))], ["Treasury · unsold", `${Number(info.treasuryBalance).toLocaleString("en-US")} tokens`], ["Circulating", `${Number(info.circulating).toLocaleString("en-US")} tokens`], ["SPV capital · simulated", rp(capital)], ["Buyback reserve", rp(buyback)], ["Purchase escrow", rp(escrow)]]} />
            {info.state === "Verified" && <form action={approveDealAction} className="row" style={{ marginTop: 10 }}>
              <input type="hidden" name="seriesId" value={s.id} />
              <button className="btn primary">{s.spv_note?.startsWith("SPV approved the acquisition deal") ? "Prepare owner signature" : "Approve acquisition deal"}</button>
              <span className="small muted">Approves the displayed rights, valuation and upfront payment. Owner signature is still required.</span>
            </form>}
            {info.state === "Active" && (
              <form action={fundAction} className="row" style={{ marginTop: 10, alignItems: "end" }}>
                <input type="hidden" name="seriesId" value={s.id} />
                <label className="field">Fund buyback reserve from SPV capital · Rp<input className="input" name="amount" type="number" min={1} required /></label>
                <button className="btn">Fund reserve</button>
              </form>
            )}
          </Card>
        );
      }))}
    </div>
  );
}
