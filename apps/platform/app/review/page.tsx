import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@venue-rwa/ui";
import { requireArea } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { KYB_STATUS_LABEL } from "@/lib/flows/kyb";
import { dt } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review KYB" };

export default async function ReviewQueue() {
  await requireArea("review");
  const { data } = await platformDb().from("kyb_cases").select("*, venues(name, city)").order("updated_at", { ascending: false });
  const open = (data ?? []).filter((c) => !["APPROVED", "REJECTED"].includes(c.status));
  const done = (data ?? []).filter((c) => ["APPROVED", "REJECTED"].includes(c.status));
  const row = (c: any) => (
    <tr key={c.id}><td><Link href={`/review/${c.id}`} style={{ fontWeight: 700 }}>{c.venues?.name}</Link><div className="small muted">{c.venues?.city}</div></td>
      <td><Badge tone={c.status === "APPROVED" ? "ok" : c.status === "REJECTED" ? "bad" : "info"}>{KYB_STATUS_LABEL[c.status]}</Badge></td>
      <td className="small">{c.risk_summary ? `${c.risk_summary.counts.critical} critical · ${c.risk_summary.counts.high} high · ${c.risk_summary.counts.medium} medium` : "belum diperiksa"}</td><td className="small">{dt(c.updated_at)}</td></tr>
  );
  return (
    <div className="container">
      <PageHeader eyebrow="Back-office" title="Review KYB" lead="AI hanya memberi temuan. Keputusan akhir selalu manusia." />
      <Card title="Perlu ditinjau">{open.length === 0 ? <Empty>Tidak ada antrean.</Empty> : <table className="table"><thead><tr><th>Venue</th><th>Status</th><th>Temuan</th><th>Diperbarui</th></tr></thead><tbody>{open.map(row)}</tbody></table>}</Card>
      {done.length > 0 && <Card title="Sudah diputus" className="mt"><table className="table"><tbody>{done.map(row)}</tbody></table></Card>}
    </div>
  );
}
