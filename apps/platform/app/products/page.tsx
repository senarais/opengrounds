import Link from "next/link";
import { Notice } from "@venue-rwa/ui";
import { Statements } from "@/components/Statements";
import { DEMO_PHOTOS } from "@/lib/demo-photos";
import { platformDb } from "@/lib/db";
import { listProducts } from "@/lib/flows/series";
import { signedUrl } from "@/lib/storage";
import { ProductCatalog, type CatalogProduct } from "./ProductCatalog";
import styles from "./Products.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Venue marketplace · Open Grounds" };

export default async function Products() {
  let failed = false;
  const list = await listProducts().catch(() => { failed = true; return []; });
  const ids = [...new Set(list.map(({ venue }) => venue.id))];
  const { data: photos } = ids.length
    ? await platformDb().from("documents").select("venue_id,storage_path,original_name").eq("kind", "photo").in("venue_id", ids).order("uploaded_at")
    : { data: [] };
  const products: CatalogProduct[] = await Promise.all(list.map(async ({ series: s, venue: v }) => {
    const photo = photos?.find((p) => p.venue_id === v.id);
    return {
      id: s.id,
      name: v.name,
      city: v.city,
      province: v.province,
      sports: v.sports ?? [],
      price: Number(s.ref_price),
      stake: Number(s.stake_bps) / 100,
      supply: Number(s.supply),
      status: s.status,
      courts: v.facilities?.length ?? 0,
      photo: photo ? await signedUrl(photo.storage_path, 3600).catch(() => null) : null,
      reference: Object.entries(DEMO_PHOTOS).find(([key]) => photo?.original_name === `demo-reference-${key}.jpg`)?.[1],
    };
  }));

  return (
    <div className="container">
      <header className={styles.hero}>
        <div>
          <div className={styles.intro}>Sports venues · economic rights</div>
          <h1>Know the venue.<br />Understand your share.</h1>
          <p className={styles.lead}>Explore venues, review their reference-price basis, and understand the share of distributable net profit represented by each token.</p>
          <div className={styles.heroLinks}><a href="#venues" className="btn primary">Explore venues</a><Link href="/cara-kerja">How profit sharing works</Link></div>
        </div>
        <aside className={styles.guide} aria-label="Before you choose a venue">
          <h2>Before you choose a venue</h2>
          <p><b>Review the reference price</b>Compare the price per token with the valuation details on each venue page.</p>
          <p><b>Understand the profit share</b>The percentage on each card applies to the entire series. Your share depends on your token balance.</p>
          <p><b>Consider the risks</b>Tokens are not backed by venue assets. Returns and liquidity are not guaranteed.</p>
        </aside>
      </header>
      {failed
        ? <div className="mt"><Notice tone="warn" title="The venue catalogue is unavailable">Reload the page to try again.</Notice></div>
        : <ProductCatalog products={products} />}
      <div className="mt"><Statements /></div>
    </div>
  );
}
