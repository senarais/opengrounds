"use client";
import Link from "next/link";
import { useState } from "react";
import { rp } from "@/lib/format";
import styles from "./Products.module.css";

export interface CatalogProduct {
  id: string; name: string; city: string; province: string; sports: string[]; price: number;
  stake: number; supply: number; status: string; courts: number; photo: string | null;
  reference?: { source: string; author: string; license: string; licenseUrl: string };
}
const states: Record<string, string> = { Active: "Purchases open", Draft: "In preparation", Verified: "Verified", Disputed: "Disputed", Overdue: "Payment overdue", Defaulted: "Defaulted", Liquidating: "In liquidation", Closed: "Closed" };
const sportNames: Record<string, string> = { futsal: "Futsal", padel: "Padel", tenis: "Tennis", basket: "Basketball", basketball: "Basketball", badminton: "Badminton", voli: "Volleyball", volleyball: "Volleyball", "mini soccer": "Mini soccer", lainnya: "Other" };
const sportName = (sport: string) => sportNames[sport.toLowerCase()] ?? sport;

function VenueCover({ product }: { product: CatalogProduct }) {
  const [failed, setFailed] = useState(false);
  return <div className={styles.cover}>
    {product.photo && !failed ? <img src={product.photo} alt={product.reference ? `Demo reference image for ${product.sports.map(sportName).join(", ")}; not a real venue` : `Submitted venue photo for ${product.name}`} loading="lazy" onError={() => setFailed(true)} /> : <div className={styles.courtArt} role="img" aria-label="Illustrative court; venue photo unavailable"><div className={styles.courtLines}><span /></div><small>Illustration · no venue photo available</small></div>}
    <span className={`${styles.state} ${product.status === "Active" ? styles.active : ""}`}><i aria-hidden="true" />{states[product.status] ?? product.status}</span>
    {product.photo && !failed && <span className={styles.photoLabel}>{product.reference ? "Demo reference image" : "Submitted venue photo"}</span>}
  </div>;
}

export function ProductCatalog({ products }: { products: CatalogProduct[] }) {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("all");
  const [sort, setSort] = useState("default");
  const [activeOnly, setActiveOnly] = useState(false);
  const sports = [...new Set(products.flatMap((p) => p.sports))].sort();
  const visible = products.filter((p) => (!activeOnly || p.status === "Active") && (sport === "all" || p.sports.includes(sport)) && `${p.name} ${p.city} ${p.province} ${p.sports.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  visible.sort((a, b) => sort === "lowest" ? a.price - b.price : sort === "highest" ? b.price - a.price : Number(b.status === "Active") - Number(a.status === "Active"));
  const reset = () => { setQuery(""); setSport("all"); setSort("default"); setActiveOnly(false); };
  return <section id="venues" className={styles.catalog} aria-label="Venue catalogue">
    <div className={styles.toolbar}>
      <label className={styles.search}><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search venues, cities, or sports" aria-label="Search venues, cities, or sports" /></label>
      <label className={styles.sort}>Sort by<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="default">Purchases open first</option><option value="lowest">Lowest reference price</option><option value="highest">Highest reference price</option></select></label>
    </div>
    <div className={styles.filters}>
      <div className={styles.sports} role="group" aria-label="Filter by sport"><button type="button" aria-pressed={sport === "all"} onClick={() => setSport("all")}>All sports</button>{sports.map((s) => <button type="button" key={s} aria-pressed={sport === s} onClick={() => setSport(s)}>{sportName(s)}</button>)}</div>
      <label className={styles.available}><input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Purchases open only</label>
    </div>
    <p className={styles.results} role="status">{visible.length} {visible.length === 1 ? "venue" : "venues"} shown</p>
    {!visible.length ? <div className={styles.empty}><h2>{products.length ? "No venues match" : "Venues are being prepared"}</h2><p>{products.length ? "Try another search or show all sports." : "Series will appear after review and activation. Purchases open after the owner signs the acquisition."}</p>{products.length > 0 && <button type="button" className="btn" onClick={reset}>Clear filters</button>}</div> : <div className={styles.grid}>
      {visible.map((p) => <article key={p.id} className={styles.product}>
        <Link href={`/products/${p.id}`} className={styles.coverLink} aria-label={`View ${p.name}`}><VenueCover product={p} /></Link>
        <div className={styles.body}>
          <div className={styles.location}>{[p.city, p.province].filter(Boolean).join(", ")}</div>
          <h2><Link href={`/products/${p.id}`}>{p.name}</Link></h2>
          <p className={styles.facilities}>{p.sports.map(sportName).join(" · ")}{p.courts > 0 ? ` · ${p.courts} ${p.courts === 1 ? "court" : "courts"}` : ""}</p>
          <div className={styles.price}><span>Reference price / token</span><strong>{rp(p.price)}</strong></div>
          <dl className={styles.facts}><div><dt>Economic rights in series</dt><dd>{p.stake.toLocaleString("en-US")}%</dd></div><div><dt>Total token supply</dt><dd>{p.supply.toLocaleString("en-US")}</dd></div></dl>
          <p className={styles.explanation}>Rights to a share of distributable net profit. Your share depends on the number of tokens you hold.</p>
          <Link className={styles.details} href={`/products/${p.id}`}>Venue details & figures <span aria-hidden="true">↗</span></Link>
          {p.reference && <p className={styles.credit}>Illustrative image, not a photo of this venue. <a href={p.reference.source} target="_blank" rel="noreferrer">{p.reference.author}</a> · <a href={p.reference.licenseUrl} target="_blank" rel="noreferrer">{p.reference.license}</a>; cropped for display.</p>}
        </div>
      </article>)}
    </div>}
  </section>;
}
