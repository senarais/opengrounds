import { Badge, Card, Empty, Flash, PageHeader } from "@venue-rwa/ui";
import { AttestSignButton } from "@/components/Wallet";
import { requireArea } from "@/lib/auth";
import { chain, registrySigners } from "@/lib/chain";
import { platformDb } from "@/lib/db";
import { dt, rp } from "@/lib/format";
import { resolveAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verifier" };

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
      <PageHeader eyebrow="Pihak independen" title="Verifier" lead="Slot VERIFIER: menandatangani revaluasi, menggantikan owner yang diam melewati tenggat, dan menengahi sengketa. Tanda tangan memakai wallet verifier terdaftar (MetaMask), tanpa gas." />
      <Flash ok={sp.ok} err={sp.err} />
      <Card title="Wallet verifier terdaftar di registry">{signers ? <span className="mono small">{signers.verifier}</span> : <span className="muted">Registry belum dideploy.</span>}<p className="small muted">Tanda tangan dari wallet lain ditolak server dan kontrak.</p></Card>

      <div className="section-title mt"><h2>Revaluasi menunggu tanda tangan</h2></div>
      {valuation.length === 0 ? <Empty>Tidak ada.</Empty> : valuation.map((a) => (
        <Card key={a.id} title={a.series?.venues?.name} subtitle={`Valuasi baru ${rp(a.payload.newValuation)} → harga referensi ${rp(a.payload.newRef)} (hanya untuk transaksi baru)`}>
          <p className="small">Dasar: {a.payload.reason}</p>
          <AttestSignButton attId={a.id} via="metamask" chainId={chain.id} label="Tanda tangani revaluasi" />
        </Card>
      ))}

      <div className="section-title mt"><h2>Owner diam melewati tenggat</h2></div>
      {silent.length === 0 ? <Empty>Tidak ada. {waiting.length > 0 && `${waiting.length} periode masih dalam jendela tanda tangan owner.`}</Empty> : silent.map((a) => {
        const p = periodOf(a)!;
        return (
          <Card key={a.id} title={`${a.series?.venues?.name} · periode ${a.ref_id}`} subtitle={`Owner tidak menandatangani sampai ${dt(p.owner_deadline)}`}>
            <p className="small">D {rp(Number(p.distributable))} · jatah investor {rp(Number(p.p_inv))}. Periksa bukti (hash {a.evidence_hash.slice(0, 14)}…) sebelum menandatangani menggantikan owner.</p>
            <AttestSignButton attId={a.id} via="metamask" chainId={chain.id} label="Tanda tangani menggantikan owner" confirmText="Anda memverifikasi angka ini dan menandatangani menggantikan owner yang diam?" />
          </Card>
        );
      })}

      <div className="section-title mt"><h2>Sengketa terbuka</h2></div>
      {(disputes ?? []).length === 0 ? <Empty>Tidak ada.</Empty> : disputes!.map((d: any) => (
        <Card key={d.id} title={d.series?.venues?.name} subtitle={`Diajukan oleh ${d.raised_by} · ${dt(d.created_at)}`}>
          <p><Badge tone="bad">{d.item_type}</Badge> {d.reason}</p>
          <form action={resolveAction} className="stack" style={{ marginTop: 8 }}>
            <input type="hidden" name="id" value={d.id} />
            <textarea className="input" name="resolution" rows={2} required minLength={10} placeholder="Dasar keputusan. Periode akan dihitung ulang dan owner menandatangani lagi." />
            <button className="btn primary">Selesaikan & buka ulang periode</button>
          </form>
        </Card>
      ))}
    </div>
  );
}
