import Link from "next/link";
import { Notice } from "@venue-rwa/ui";
import { Statements } from "@/components/Statements";
import { listProducts } from "@/lib/flows/series";
import { platformDb } from "@/lib/db";
import { signedUrl } from "@/lib/storage";
import { DEMO_PHOTOS } from "@/lib/demo-photos";
import { ProductCatalog, type CatalogProduct } from "./ProductCatalog";
import styles from "./Products.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jelajahi venue" };

export default async function Products() {
  let failed = false;
  const list = await listProducts().catch(() => { failed = true; return []; });
  const ids = [...new Set(list.map(({ venue }) => venue.id))];
  const { data: photos } = ids.length ? await platformDb().from("documents").select("venue_id,storage_path,original_name").eq("kind", "photo").in("venue_id", ids).order("uploaded_at") : { data: [] };
  const products: CatalogProduct[] = await Promise.all(list.map(async ({ series: s, venue: v }) => {
    const photo = photos?.find((p) => p.venue_id === v.id);
    return {
      id: s.id, name: v.name, city: v.city, province: v.province, sports: v.sports ?? [],
      price: Number(s.ref_price), stake: Number(s.stake_bps) / 100, supply: Number(s.supply), status: s.status,
      courts: v.facilities?.length ?? 0, photo: photo ? await signedUrl(photo.storage_path, 3600).catch(() => null) : null,
      reference: Object.entries(DEMO_PHOTOS).find(([key]) => photo?.original_name === `demo-reference-${key}.jpg`)?.[1],
    };
  }));
  return <div className="container">
    <header className={styles.hero}>
      <div>
        <div className={styles.intro}>Venue olahraga · hak manfaat ekonomi</div>
        <h1>Kenali lapangannya.<br />Pahami bagian Anda.</h1>
        <p className={styles.lead}>Jelajahi venue, periksa dasar harganya, lalu pilih token yang memberi hak atas bagian laba bersih venue tersebut.</p>
        <div className={styles.heroLinks}><a href="#venues" className="btn primary">Jelajahi venue</a><Link href="/cara-kerja">Pahami cara bagi hasil</Link></div>
      </div>
      <aside className={styles.guide} aria-label="Sebelum memilih venue">
        <h2>Sebelum memilih venue</h2>
        <p><b>Periksa harga referensi</b>Bandingkan harga per token dan dasar valuasi yang tersedia di detail venue.</p>
        <p><b>Pahami porsi laba</b>Persentase di kartu adalah porsi untuk seluruh seri. Jatah Anda mengikuti jumlah token.</p>
        <p><b>Kenali risikonya</b>Token tidak dijamin aset venue. Imbal hasil dan likuiditas tidak dijamin.</p>
      </aside>
    </header>
    {failed ? <div className="mt"><Notice tone="warn" title="Katalog belum bisa dimuat">Muat ulang halaman untuk mencoba lagi.</Notice></div> : <ProductCatalog products={products} />}
    <div className="mt"><Statements /></div>
  </div>;
}
