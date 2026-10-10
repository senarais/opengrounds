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
const states: Record<string, string> = { Active: "Pembelian dibuka", Draft: "Dalam persiapan", Verified: "Menunggu pengesahan", Disputed: "Dalam peninjauan", Overdue: "Pembayaran tertunda", Defaulted: "Gagal bayar", Liquidating: "Dalam likuidasi", Closed: "Ditutup" };

function VenueCover({ product }: { product: CatalogProduct }) {
  const [failed, setFailed] = useState(false);
  return <div className={styles.cover}>
    {product.photo && !failed ? <img src={product.photo} alt={product.reference ? `Foto referensi ${product.sports.join(", ")} untuk demo, bukan venue asli` : `Foto pengajuan ${product.name}`} loading="lazy" onError={() => setFailed(true)} /> : <div className={styles.courtArt} aria-label="Ilustrasi lapangan; foto venue belum tersedia"><div className={styles.courtLines}><span /></div><small>Ilustrasi · foto belum tersedia</small></div>}
    <span className={`${styles.state} ${product.status === "Active" ? styles.active : ""}`}><i aria-hidden="true" />{states[product.status] ?? product.status}</span>
    {product.photo && !failed && <span className={styles.photoLabel}>{product.reference ? "Foto referensi demo" : "Foto pengajuan"}</span>}
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
  return <section id="venues" className={styles.catalog} aria-label="Katalog venue">
    <div className={styles.toolbar}>
      <label className={styles.search}><span aria-hidden="true">⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari venue, kota, atau olahraga" aria-label="Cari venue, kota, atau olahraga" /></label>
      <label className={styles.sort}>Urutkan<select value={sort} onChange={(e) => setSort(e.target.value)}><option value="default">Pembelian dibuka dulu</option><option value="lowest">Harga terendah</option><option value="highest">Harga tertinggi</option></select></label>
    </div>
    <div className={styles.filters}>
      <div className={styles.sports} aria-label="Filter olahraga"><button type="button" aria-pressed={sport === "all"} onClick={() => setSport("all")}>Semua olahraga</button>{sports.map((s) => <button type="button" key={s} aria-pressed={sport === s} onClick={() => setSport(s)}>{s}</button>)}</div>
      <label className={styles.available}><input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> Pembelian dibuka saja</label>
    </div>
    <p className={styles.results} role="status">{visible.length} venue ditampilkan</p>
    {!visible.length ? <div className={styles.empty}><h2>{products.length ? "Belum ada yang cocok" : "Venue sedang dipersiapkan"}</h2><p>{products.length ? "Coba nama lain atau tampilkan semua olahraga." : "Seri tampil setelah kontraknya disiapkan. Pembelian dibuka setelah pengesahan owner selesai."}</p>{products.length > 0 && <button type="button" className="btn" onClick={reset}>Hapus filter</button>}</div> : <div className={styles.grid}>
      {visible.map((p) => <article key={p.id} className={styles.product}>
        <Link href={`/products/${p.id}`} className={styles.coverLink} aria-label={`Lihat ${p.name}`}><VenueCover product={p} /></Link>
        <div className={styles.body}>
          <div className={styles.location}>{[p.city, p.province].filter(Boolean).join(", ")}</div>
          <h2><Link href={`/products/${p.id}`}>{p.name}</Link></h2>
          <p className={styles.facilities}>{p.sports.join(" · ")}{p.courts > 0 ? ` · ${p.courts} lapangan` : ""}</p>
          <div className={styles.price}><span>Harga referensi / token</span><strong>{rp(p.price)}</strong></div>
          <dl className={styles.facts}><div><dt>Porsi laba untuk seri</dt><dd>{p.stake.toLocaleString("id-ID")}%</dd></div><div><dt>Total pasokan token</dt><dd>{p.supply.toLocaleString("id-ID")}</dd></div></dl>
          <p className={styles.explanation}>Hak atas bagian laba bersih yang bisa dibagikan. Jatah Anda mengikuti jumlah token yang dimiliki.</p>
          <Link className={styles.details} href={`/products/${p.id}`}>Lihat venue & perhitungan <span aria-hidden="true">↗</span></Link>
          {p.reference && <p className={styles.credit}>Ilustrasi, bukan foto venue ini. <a href={p.reference.source} target="_blank" rel="noreferrer">{p.reference.author}</a> · <a href={p.reference.licenseUrl} target="_blank" rel="noreferrer">{p.reference.license}</a>; tampilan dipotong.</p>}
        </div>
      </article>)}
    </div>}
  </section>;
}
