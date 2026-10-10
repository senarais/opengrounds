import { Badge, Card, Empty, Flash, PageHeader } from "@venue-rwa/ui";
import { AttestSignButton } from "@/components/Wallet";
import { requireArea } from "@/lib/auth";
import { chain, registrySigners } from "@/lib/chain";
import { platformDb } from "@/lib/db";
import { dt, rp } from "@/lib/format";
import { resolveAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verifier queue · Open Grounds" };

export default async function Verifier({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireArea("verifier");
  const sp = await searchParams;
  const pf = platformDb();
  const signers = await registrySigners().catch(() => null);
  const { data: atts } = await pf.from("attestations").select("*, series(symbol, venues(name))").eq("status", "collecting").in("kind", ["VALUATION_UPDATE", "REVENUE_PERIOD"]).order("created_at");
  const { data: per } = await pf.from("revenue_periods").select("series_id, period_no, owner_deadline, status, distributable, p_inv, evidence").eq("status", "awaiting_owner");
  const periodOf = (a: any) => (per ?? []).find((p) => p.series_id === a.series_id && p.period_no === Number(a.ref_id));
  const valuation = (atts ?? []).filter((a) => a.kind === "VALUATION_UPDATE");
  const silent = (atts ?? []).filter((a) => a.kind === "REVENUE_PERIOD" && periodOf(a) && Date.parse(periodOf(a)!.owner_deadline) < Date.now());
  const waiting = (atts ?? []).filter((a) => a.kind === "REVENUE_PERIOD" && periodOf(a) && Date.parse(periodOf(a)!.owner_deadline) >= Date.now());
  const { data: disputes } = await pf.from("disputes").select("*, series(symbol, venues(name))").eq("status", "open");

  return (
    <div className="container">
      <PageHeader eyebrow="Independent review" title="Verifier queue" lead="Review valuations, sign overdue profit periods when an owner is silent, and resolve disputes with your registered MetaMask wallet." />
      <Flash ok={sp.ok} err={sp.err} />
      <Card title="Registered verifier wallet">{signers ? <span className="mono small">{signers.verifier}</span> : <span className="muted">Registry is not deployed.</span>}<p className="small muted">Signatures from other wallets are rejected.</p></Card>

      <div className="section-title mt"><h2>Valuations awaiting signature</h2></div>
      {valuation.length === 0 ? <Empty>No valuations to review.</Empty> : valuation.map((a) => (
        <Card key={a.id} title={a.series?.venues?.name} subtitle={`New valuation ${rp(a.payload.newValuation)} → reference price ${rp(a.payload.newRef)} · new purchases only`}>
          <p className="small">Basis: {a.payload.reason}</p>
          <AttestSignButton attId={a.id} via="metamask" chainId={chain.id} label="Sign valuation" />
        </Card>
      ))}

      <div className="section-title mt"><h2>Overdue owner signatures</h2></div>
      {silent.length === 0 ? <Empty>No overdue owner signatures. {waiting.length > 0 && `${waiting.length} periods remain within the owner-signing window.`}</Empty> : silent.map((a) => {
        const p = periodOf(a)!;
        return (
          <Card key={a.id} title={`${a.series?.venues?.name} · period ${a.ref_id}`} subtitle={`Owner signature deadline · ${dt(p.owner_deadline)}`}>
            <p className="small">Distributable profit D · {rp(Number(p.distributable))} · investor pool · {rp(Number(p.p_inv))}. Check evidence hash {a.evidence_hash.slice(0, 14)}… before signing in place of the owner.</p>
            <AttestSignButton attId={a.id} via="metamask" chainId={chain.id} label="Sign for silent owner" confirmText="Do you verify these figures and sign in place of the owner, who missed the deadline?" />
          </Card>
        );
      })}

      <div className="section-title mt"><h2>Open disputes</h2></div>
      {(disputes ?? []).length === 0 ? <Empty>No open disputes.</Empty> : disputes!.map((d: any) => (
        <Card key={d.id} title={d.series?.venues?.name} subtitle={`Raised by ${d.raised_by} · ${dt(d.created_at)}`}>
          <p><Badge tone="bad">{d.item_type}</Badge> {d.reason}</p>
          <form action={resolveAction} className="stack" style={{ marginTop: 8 }}>
            <input type="hidden" name="id" value={d.id} />
            <textarea className="input" name="resolution" rows={2} required minLength={10} placeholder="Explain your decision. The period will be recalculated and sent to the owner for signature." />
            <button className="btn primary">Resolve & reopen period</button>
          </form>
        </Card>
      ))}
    </div>
  );
}
