import Link from "next/link";
import { Notice } from "@venue-rwa/ui";

/** Pernyataan wajib PRD v4.1 §7.8. Tampil di halaman produk, portofolio, dan alur beli. */
export function Statements({ compact }: { compact?: boolean }) {
  const items = [
    "Testnet/simulasi. Tidak ada uang sungguhan.",
    "Imbal hasil tidak dijamin. Distribusi bergantung pada kinerja venue.",
    "Likuiditas tidak dijamin. Jual balik bergantung pada kapasitas dan keputusan Grounds.",
    <>Harga referensi ditentukan berdasarkan valuasi yang dihitung dengan <Link href="/cara-kerja#rumus">rumus berikut</Link>.</>,
    "Token ini tidak dijamin oleh aset venue. Aset hanya patokan harga.",
    "Open Grounds belum memiliki izin atau persetujuan regulator untuk menawarkan produk ini.",
  ];
  if (compact) return <p className="small muted">{items.map((t, i) => <span key={i}>{t} </span>)}</p>;
  return (
    <Notice tone="warn" title="Sebelum membeli:">
      <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </Notice>
  );
}

/** Label angka asumsi: setiap parameter buatan tim wajib ditandai. */
export const Asumsi = () => <span className="badge warn plain" title="Angka asumsi tim untuk demo, belum dikalibrasi dengan data nyata" style={{ marginLeft: 6, fontSize: 11 }}>Asumsi</span>;
