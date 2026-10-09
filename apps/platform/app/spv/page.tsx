import Link from "next/link";
import { Badge, Card, Empty, Flash, KV, Notice, PageHeader } from "@venue-rwa/ui";
import { requireArea } from "@/lib/auth";
import { readSeries } from "@/lib/chain";
import { platformDb } from "@/lib/db";
import { cashBalance } from "@/lib/flow";
import { KYB_STATUS_LABEL } from "@/lib/flows/kyb";
import { treasuryAddress } from "@/lib/operator";
import { rp } from "@/lib/format";
import { fundAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grounds (SPV)" };

export default async function Spv({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireArea("spv");
  const sp = await searchParams;
  const { data: series } = await platformDb().from("series").select("*, venues(name, city)").not("contract_address", "is", null).order("created_at", { ascending: false });
  const { data: pipeline } = await platformDb().from("venues").select("id, name, city, submitted_by, offered_stake_bps, created_at, kyb_cases(status, created_at), series(status)").order("created_at", { ascending: false });
  let treasury = "belum diatur";
  try { treasury = treasuryAddress(); } catch { /* OPERATOR_PRIVATE_KEY belum ada */ }
  return (
    <div className="container">
      <PageHeader eyebrow="Grounds (SPV)" title="Pembeli hak dan penerbit token" lead="SPV membeli X% hak manfaat ekonomi dari owner, membayarnya di depan, memegang treasury token yang belum terjual, dan mengelola cadangan buyback. Dana SPV tidak dicampur dengan kas platform."><Link className="btn primary" href="/spv/apply">+ Ajukan venue baru</Link></PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      <Notice tone="warn" title="Jujur untuk demo:">Akun SPV dibuat dan dipegang tim kami; kontrak tetap memakai 3 slot tanda tangan. Di production SPV harus entitas dengan pengurus, rekening, dan kendali terpisah dari platform. Semua dana di sini disimulasikan.</Notice>

      <Card title="Wallet treasury Grounds" subtitle="Akun SPV tidak punya wallet sendiri: treasury dan penandatanganan dijalankan backend (hot wallet testnet)" className="mt">
        <span className="mono small">{treasury}</span>
      </Card>
      <Card title="Pipeline venue" subtitle="Semua venue yang masuk, dari pengajuan sampai seri aktif" className="mt">
        {(pipeline ?? []).length === 0 ? <p className="small muted">Belum ada pengajuan. Gunakan "+ Ajukan venue baru".</p> : <table className="table small"><thead><tr><th>Venue</th><th>X ditawarkan</th><th>KYB</th><th>Seri</th><th>Diajukan oleh</th></tr></thead><tbody>{pipeline!.map((v: any) => { const kc = [...(v.kyb_cases ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0]; const sr = v.series?.[0]; return <tr key={v.id}><td><b>{v.name}</b><div className="muted">{v.city}</div></td><td>{(v.offered_stake_bps / 100).toFixed(0)}%</td><td><Badge tone={kc?.status === "APPROVED" ? "ok" : kc?.status === "REJECTED" ? "bad" : "info"}>{KYB_STATUS_LABEL[kc?.status ?? "DRAFT"]}</Badge></td><td>{sr ? <Badge tone={sr.status === "Active" ? "ok" : "neutral"}>{sr.status}</Badge> : <span className="muted">belum</span>}</td><td className="muted">{v.submitted_by ?? "owner"}</td></tr>; })}</tbody></table>}
        <p className="small muted" style={{ marginTop: 8 }}>Pengajuan SPV sudah mencakup persetujuan pembelian di aplikasi. Setelah operator dan reviewer menyetujui, kontrak disiapkan otomatis dan owner diminta menandatangani akuisisi.</p>
      </Card>
      <div className="section-title mt"><h2>Seri Grounds</h2></div>
      {(series ?? []).length === 0 ? <Empty>Belum ada seri.</Empty> : await Promise.all((series ?? []).map(async (s: any) => {
        const info = await readSeries(s.contract_address);
        const [capital, buyback, escrow] = await Promise.all([cashBalance(s.id, "spv_capital"), cashBalance(s.id, "buyback_reserve"), cashBalance(s.id, "escrow")]);
        return (
          <Card key={s.id} title={s.venues?.name} className="mt">
            <div className="row"><Badge tone={info.state === "Active" ? "ok" : "warn"}>{info.state}</Badge>{info.state === "Verified" && <span className="small muted">Menunggu tanda tangan owner</span>}</div>
            <KV rows={[["Hak ekonomi yang diajukan", `${s.stake_bps / 100}% laba bersih yang bisa dibagikan`], ["Valuasi", rp(Number(s.valuation_idr))], ["Nilai akuisisi owner (simulasi)", rp(Math.floor(Number(s.valuation_idr) * s.stake_bps / 10_000))], ["Harga referensi per token", rp(Number(s.ref_price))], ["Treasury (belum terjual)", `${Number(info.treasuryBalance).toLocaleString("id-ID")} token`], ["Beredar", `${Number(info.circulating).toLocaleString("id-ID")} token`], ["Modal SPV (simulasi)", rp(capital)], ["Cadangan buyback", rp(buyback)], ["Escrow pembelian", rp(escrow)]]} />
            {info.state === "Active" && (
              <form action={fundAction} className="row" style={{ marginTop: 10, alignItems: "end" }}>
                <input type="hidden" name="seriesId" value={s.id} />
                <label className="field">Isi cadangan buyback dari modal SPV (Rp)<input className="input" name="amount" type="number" min={1} required /></label>
                <button className="btn">Isi cadangan</button>
              </form>
            )}
          </Card>
        );
      }))}
    </div>
  );
}
