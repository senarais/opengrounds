import Link from "next/link";
import { Badge, Empty, PageHeader } from "@venue-rwa/ui";
import { Statements } from "@/components/Statements";
import { SpotlightPanel } from "@/components/SpotlightPanel";
import { listProducts } from "@/lib/flows/series";
import { rp } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Venue marketplace · Open Grounds" };

const sportName: Record<string, string> = { futsal: "Futsal", padel: "Padel", tenis: "Tennis", basket: "Basketball", badminton: "Badminton", voli: "Volleyball", "mini soccer": "Mini soccer", lainnya: "Other" };

export default async function Products() {
  const list = await listProducts().catch(() => []);
  return (
    <div className="container">
      <PageHeader eyebrow="Marketplace" title="Venues in play." lead="Each series represents economic rights to a share of one venue’s distributable net profit. Review the figures, terms, and risks before taking part." />
      {list.length === 0 ? <Empty>No venue series are available yet. Listings appear after review, owner approval, and activation.</Empty> : (
        <div className="grid c3">
          {list.map(({ series: s, venue: v }) => (
            <Link key={s.id} className="og-market-link" href={`/products/${s.id}`}>
              <SpotlightPanel className="og-market-card"><div className="og-market-meta"><span>{(v.sports ?? []).map((sport: string) => sportName[sport.toLowerCase()] ?? sport).join(" · ")}</span><Badge tone={s.status === "Active" ? "ok" : s.status === "Draft" || s.status === "Verified" ? "neutral" : "warn"}>{s.status}</Badge></div><h2>{v.name}</h2><p className="og-market-place">{v.city}, {v.province}</p><div className="og-market-price"><span>Reference price / token</span><strong>{rp(Number(s.ref_price))}</strong></div><div className="og-market-foot"><span>{(s.stake_bps / 100).toFixed(0)}% economic rights</span><span>{Number(s.supply).toLocaleString("en-US")} tokens</span></div></SpotlightPanel>
            </Link>
          ))}
        </div>
      )}
      <div className="mt"><Statements /></div>
    </div>
  );
}
