import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@venue-rwa/ui";
import { getMe } from "@/lib/auth";
import { KYB_STATUS_LABEL, latestCase } from "@/lib/flows/kyb";
import { venuesOfOwner } from "@/lib/flows/onboarding";
import { seriesOfVenue } from "@/lib/flows/series";
import { SpotlightPanel } from "@/components/SpotlightPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "My venues · Open Grounds" };

export default async function OwnerHome() {
  const me = await getMe();
  if (!me) return (
    <div className="container">
      <PageHeader eyebrow="For venue owners" title="Your venue. Your terms." lead="Keep operating your venue while Grounds acquires a share of its distributable net profit. You review and sign the acquisition yourself." />
      <SpotlightPanel className="og-owner-entry"><div className="og-owner-entry-copy"><span className="og-kicker">Start with your account</span><h2>Create your owner account</h2><p>Submit your venue and documents from your account, track review, sign the acquisition, and approve monthly profit figures. Grounds handles the acquisition deal in its back office.</p><div className="row"><Link className="btn primary" href="/register">Create owner account</Link><Link className="btn" href="/login?next=/owner">Log in</Link></div></div></SpotlightPanel>
      <p className="small muted mt">Land must be self-owned and unpledged. Applications require at least 12 months of financial history and at least 90% digitally recorded revenue.</p>
    </div>
  );
  if (me.role !== "owner") return <div className="container"><Card>This area is for venue owners.</Card></div>;
  const venues = await venuesOfOwner(me.userId);
  const rows = await Promise.all(venues.map(async (v) => ({ v, kc: await latestCase(v.id), s: await seriesOfVenue(v.id) })));
  return (
    <div className="container">
      <PageHeader eyebrow="Owner portal" title="My venues" lead="Submit venues, track applications, sign acquisitions, and review monthly profit figures."><Link className="btn primary" href="/owner/apply">Submit a venue ↗</Link></PageHeader>
      {rows.length === 0 ? <Empty>No venues yet. Submit your first venue and upload its supporting documents for review.</Empty> : (
        <div className="grid c2">{rows.map(({ v, kc, s }) => (
          <Link key={v.id} href={`/owner/${v.id}`} className="og-owner-venue-link">
            <SpotlightPanel className="og-owner-venue-card"><span className="og-kicker">{v.city}, {v.province}</span><h2>{v.name}</h2><div className="row"><Badge tone={kc?.status === "APPROVED" ? "ok" : kc?.status === "REJECTED" ? "bad" : "info"}>Review · {KYB_STATUS_LABEL[kc?.status ?? "DRAFT"]}</Badge>{s && <Badge tone={s.status === "Active" ? "ok" : "neutral"}>Series · {s.status}</Badge>}</div></SpotlightPanel>
          </Link>))}</div>
      )}
    </div>
  );
}
