import Link from "next/link";
import { Badge, Card, MascotSay } from "@venue-rwa/ui";
import { Statements } from "@/components/Statements";
import { listProducts } from "@/lib/flows/series";
import { rp } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const products = await listProducts().catch(() => []);
  const live = products.filter((p) => p.series.status !== "Draft" && p.series.status !== "Verified");
  return (
    <div className="container">
      <section className="hero">
        <div>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Pendanaan venue olahraga</div>
          <h1>Ikut memiliki bagian laba venue olahraga, tanpa membeli venuenya.</h1>
          <p className="lead">
            Owner memilih sendiri berapa persen (X) hak manfaat ekonomi atas laba bersih venuenya yang dijual. Grounds (SPV) membelinya, membayar owner di depan,
            lalu memecahnya menjadi token. Investor membeli token dengan rupiah dan menerima jatah bulanan sesuai jumlah token.
          </p>
          <div className="cta">
            <Link className="btn primary lg" href="/products">Lihat produk</Link>
            <Link className="btn lg" href="/owner">Untuk owner venue</Link>
          </div>
          <div style={{ marginTop: 22 }}><MascotSay>Yang dijual hak atas sebagian laba bersih, bukan tanah dan bukan saham. Owner tetap pemilik dan pengelola venue.</MascotSay></div>
        </div>
        <Card title="Tiga pihak, satu wasit" subtitle="Chain menegakkan aturan; rupiah tetap di luar chain">
          <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li><b>Owner venue</b> menjual X% hak ekonomi, menerima dana di depan (simulasi), tetap mengelola venue lewat PoS kami.</li>
            <li><b>Grounds (SPV)</b> memegang hak itu, mencetak token sekali ke treasury, dan menjualnya berkelanjutan.</li>
            <li><b>Investor</b> menandatangani pesanannya sendiri, membayar lewat payment gateway, lalu menerima jatah bulanan ke saldo.</li>
          </ol>
          <div className="divider" />
          <p className="small muted">Token hanya terbit setelah platform dan owner sama-sama menandatangani verifikasi aset. Angka laba bulanan butuh tanda tangan owner (atau verifier independen bila owner diam). Platform tidak bisa melakukannya sendirian.</p>
        </Card>
      </section>

      <div className="section-title"><h2>Produk aktif</h2><Link className="small" href="/products">Semua produk</Link></div>
      {live.length === 0 ? (
        <Card><p className="muted">Belum ada seri aktif. Seri terbit setelah KYB disetujui dan owner menandatangani akuisisi.</p></Card>
      ) : (
        <div className="grid c3">
          {live.slice(0, 3).map(({ series: s, venue: v }) => (
            <Link key={s.id} href={`/products/${s.id}`} className="card" style={{ textDecoration: "none" }}>
              <div className="row" style={{ justifyContent: "space-between" }}><b>{v.name}</b><Badge tone={s.status === "Active" ? "ok" : "warn"}>{s.status}</Badge></div>
              <div className="small muted">{v.city} · {(v.sports ?? []).join(", ")}</div>
              <div className="small" style={{ marginTop: 8 }}>Harga referensi <b>{rp(Number(s.ref_price))}</b> per token · {(s.stake_bps / 100).toFixed(0)}% hak ekonomi · {Number(s.supply).toLocaleString("id-ID")} token</div>
            </Link>
          ))}
        </div>
      )}
      <div className="mt"><Statements /></div>
    </div>
  );
}
