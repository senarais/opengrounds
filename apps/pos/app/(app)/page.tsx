import Link from "next/link";
import { createSupabasePosSource, monthlyEligible, occupancy } from "@venue-rwa/connectors";
import { sessionsFor } from "@venue-rwa/shared";
import { Badge, Card, Kpi, PageHeader, Progress } from "@venue-rwa/ui";
import { requireSession } from "@/lib/session";
import { dt, pct, rp, wibDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const s = await requireSession();
  const db = s.db;
  const cid = s.company.id;
  const now = new Date();
  const today = wibDate();
  const start = new Date(`${today}T00:00:00+07:00`);
  const src = createSupabasePosSource(db);

  const [entries, settled, { data: products }, { data: todays }, occ30, { data: recent }] = await Promise.all([
    src.listEntries(cid, new Date(now.getTime() - 35 * 86_400_000), new Date(now.getTime() + 60_000)),
    src.listSettledPayments(cid, new Date(now.getTime() - 40 * 86_400_000), new Date(now.getTime() + 86_400_000)),
    db.from("products").select("*").eq("company_id", cid).eq("active", true).order("created_at"),
    db.from("bookings").select("product_id, status").eq("company_id", cid).gte("slot_start", start.toISOString()).lt("slot_start", new Date(start.getTime() + 86_400_000).toISOString()),
    occupancy(db, cid, now, 30),
    db.from("bookings").select("*, products(name)").eq("company_id", cid).order("created_at", { ascending: false }).limit(6),
  ]);
  const salesToday = entries.filter((e) => e.type === "sale" && new Date(e.createdAt) >= start).reduce((a, e) => a + e.amount, 0);
  const sales30 = entries.filter((e) => e.type === "sale" && now.getTime() - new Date(e.createdAt).getTime() < 30 * 86_400_000).reduce((a, e) => a + e.amount, 0);
  const eligible30 = monthlyEligible(entries, new Set(settled.map((x) => x.bookingId)), now, 1)[0] ?? 0;
  const active = (todays ?? []).filter((b) => b.status !== "cancelled");
  const perProduct = (products ?? []).map((p) => {
    const total = sessionsFor({ openHour: p.open_hour, closeHour: p.close_hour, sessionMinutes: p.session_minutes }).length;
    return { p, total, booked: active.filter((b) => b.product_id === p.id).length };
  });
  const totalSlots = perProduct.reduce((a, x) => a + x.total, 0);

  return (
    <>
      <PageHeader eyebrow={s.company.synthetic ? "Perusahaan · data sintetis" : "Perusahaan"} title={s.company.name} lead="Ringkasan operasional hari ini. Pendapatan dicatat di ledger append-only; pembayaran hanya sah bila ada settlement dari payment gateway.">
        <Link className="btn primary" href="/schedule#baru">+ Booking baru</Link>
      </PageHeader>

      <div className="grid c4">
        <Kpi label="Penjualan hari ini" value={rp(salesToday)} hint={`${active.length} sesi terpesan dari ${totalSlots}`} accent />
        <Kpi label="Penjualan 30 hari" value={rp(sales30)} hint={`Okupansi ${pct(occ30)}`} />
        <Kpi label="Eligible Revenue 30 hari" value={rp(eligible30)} hint="settle − refund − pajak − fee" />
        <Kpi label="Produk aktif" value={products?.length ?? 0} hint="lapangan / fasilitas" />
      </div>

      <div className="grid c2 mt">
        <Card title="Okupansi hari ini" subtitle={`${today} · jam WIB`} actions={<Link className="btn sm" href="/schedule">Kelola jadwal</Link>}>
          <div className="stack" style={{ ["--gap" as any]: "14px" }}>
            {perProduct.map(({ p, total, booked }) => (
              <div key={p.id}>
                <div className="row between small"><b>{p.name}</b><span className="muted">{booked}/{total} sesi</span></div>
                <div style={{ marginTop: 5 }}><Progress slim value={booked} max={total} /></div>
              </div>
            ))}
            {perProduct.length === 0 && <p className="muted">Belum ada produk. <Link href="/products" style={{ color: "var(--accent)", fontWeight: 700 }}>Tambah produk →</Link></p>}
          </div>
        </Card>
        <Card title="Aktivitas terbaru">
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Produk</th><th>Slot</th><th className="r">Nominal</th><th>Status</th></tr></thead>
            <tbody>{recent?.map((b: any) => (
              <tr key={b.id}>
                <td>{b.products?.name}<div className="small muted">{b.customer_label}</div></td><td className="small">{dt(b.slot_start)}</td><td className="r">{rp(b.amount)}</td>
                <td><Badge tone={b.status === "paid" || b.status === "completed" ? "ok" : b.status === "held" ? "warn" : b.status === "refunded" ? "bad" : "neutral"}>{b.status}</Badge></td>
              </tr>))}
            </tbody>
          </table></div>
        </Card>
      </div>
    </>
  );
}
