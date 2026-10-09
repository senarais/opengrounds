import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@venue-rwa/ui";
import { getMe } from "@/lib/auth";
import { KYB_STATUS_LABEL, latestCase } from "@/lib/flows/kyb";
import { venuesOfOwner } from "@/lib/flows/onboarding";
import { seriesOfVenue } from "@/lib/flows/series";

export const dynamic = "force-dynamic";
export const metadata = { title: "Venue saya" };

export default async function OwnerHome() {
  const me = await getMe();
  if (!me) return (
    <div className="container">
      <PageHeader eyebrow="Untuk owner" title="Dapatkan modal tanpa melepas venue" lead="Jual sebagian hak atas laba bersih venue Anda ke Grounds, terima dana di depan, dan tetap kelola venue sendiri. Syarat utama: tanah milik sendiri, riwayat keuangan 6–12 bulan, dan pembayaran digital lewat gateway. Pengajuan dilakukan Grounds (SPV) bersama Anda; akun ini untuk memantau dan menandatangani." />
      <Card><div className="cta"><Link className="btn primary lg" href="/register">Daftar akun owner</Link><Link className="btn lg" href="/login?next=/owner">Masuk</Link></div></Card>
      <p className="small muted mt">Biaya modal efektif kira-kira setara imbal hasil tersirat valuasi (contoh 9% per tahun bila pendapatan konstan). Bandingkan dengan kredit bank atau KUR sebelum memutuskan; perbandingan itu belum kami riset.</p>
    </div>
  );
  if (me.role !== "owner") return <div className="container"><Card>Halaman ini untuk owner venue.</Card></div>;
  const venues = await venuesOfOwner(me.userId);
  const rows = await Promise.all(venues.map(async (v) => ({ v, kc: await latestCase(v.id), s: await seriesOfVenue(v.id) })));
  return (
    <div className="container">
      <PageHeader eyebrow="Owner" title="Venue saya" lead="Grounds (SPV) yang mengajukan venue Anda. Di sini Anda memantau verifikasi, menandatangani akuisisi dan angka laba bulanan, serta mengelola biaya." />
      {rows.length === 0 ? <Empty>Belum ada venue atas akun ini. Grounds (SPV) akan mengajukan venue Anda memakai email akun ini; setelah itu venue tampil di sini.</Empty> : (
        <div className="grid c2">{rows.map(({ v, kc, s }) => (
          <Link key={v.id} href={`/owner/${v.id}`} style={{ textDecoration: "none" }}>
            <Card title={v.name} subtitle={`${v.city}, ${v.province}`}>
              <div className="row"><Badge tone={kc?.status === "APPROVED" ? "ok" : kc?.status === "REJECTED" ? "bad" : "info"}>KYB: {KYB_STATUS_LABEL[kc?.status ?? "DRAFT"]}</Badge>{s && <Badge tone={s.status === "Active" ? "ok" : "neutral"}>Seri {s.status}</Badge>}</div>
            </Card>
          </Link>))}</div>
      )}
    </div>
  );
}
