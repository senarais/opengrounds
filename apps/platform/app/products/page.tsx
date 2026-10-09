import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@venue-rwa/ui";
import { Statements } from "@/components/Statements";
import { listProducts } from "@/lib/flows/series";
import { rp } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produk" };

export default async function Products() {
  const list = await listProducts().catch(() => []);
  return (
    <div className="container">
      <PageHeader eyebrow="Produk" title="Venue yang tokennya tersedia" lead="Setiap produk adalah satu seri: hak manfaat ekonomi atas sebagian laba bersih satu venue. Harga referensi berasal dari valuasi berumus yang bisa Anda periksa." />
      {list.length === 0 ? <Empty>Belum ada seri. Seri terbit setelah KYB disetujui dan owner menandatangani akuisisi.</Empty> : (
        <div className="grid c3">
          {list.map(({ series: s, venue: v }) => (
            <Link key={s.id} href={`/products/${s.id}`} style={{ textDecoration: "none" }}>
              <Card>
                <div className="row" style={{ justifyContent: "space-between" }}><b>{v.name}</b><Badge tone={s.status === "Active" ? "ok" : s.status === "Draft" || s.status === "Verified" ? "neutral" : "warn"}>{s.status}</Badge></div>
                <div className="small muted">{v.city}, {v.province} · {(v.sports ?? []).join(", ")}</div>
                <div className="divider" />
                <div className="small">Harga referensi <b>{rp(Number(s.ref_price))}</b> / token</div>
                <div className="small muted">{(s.stake_bps / 100).toFixed(0)}% hak ekonomi · {Number(s.supply).toLocaleString("id-ID")} token</div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <div className="mt"><Statements /></div>
    </div>
  );
}
