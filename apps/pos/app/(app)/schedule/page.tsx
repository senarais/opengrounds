import Link from "next/link";
import { hhmm, priceOfSession, sessionOf, sessionStartUtc, sessionsFor } from "@venue-rwa/shared";
import { Badge, Card, Empty, Flash, Notice, PageHeader } from "@venue-rwa/ui";
import { requireSession } from "@/lib/session";
import { POS_URL, rp, wibDate } from "@/lib/format";
import { cancel, newBooking, refund, syncPayments } from "../actions";

export const dynamic = "force-dynamic";
const TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = { paid: "ok", completed: "ok", held: "warn", refunded: "bad", cancelled: "neutral" };

export default async function Schedule({ searchParams }: { searchParams: Promise<{ date?: string; product?: string; session?: string; ok?: string; err?: string; pay?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : wibDate();
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86_400_000);
  const [{ data: products }, { data: bookings }] = await Promise.all([
    s.db.from("products").select("*").eq("company_id", s.company.id).eq("active", true).order("created_at"),
    s.db.from("bookings").select("*, payments(pay_token, status)").eq("company_id", s.company.id).gte("slot_start", start.toISOString()).lt("slot_start", end.toISOString()).order("slot_start"),
  ]);
  const prods = products ?? [];
  const nowMs = Date.now();
  const taken = new Map<string, any>();
  for (const b of bookings ?? []) {
    const p = prods.find((x) => x.id === b.product_id);
    if (!p || b.status === "cancelled") continue;
    const ses = sessionOf({ openHour: p.open_hour, closeHour: p.close_hour, sessionMinutes: p.session_minutes }, b.slot_start);
    if (ses) taken.set(`${p.id}:${ses.index}`, b);
  }
  const picked = prods.find((p) => p.id === sp.product);
  const pickedSes = picked ? sessionsFor({ openHour: picked.open_hour, closeHour: picked.close_hour, sessionMinutes: picked.session_minutes }).find((x) => x.index === Number(sp.session)) : undefined;
  const pickedPrice = picked && pickedSes ? priceOfSession({ price: Number(picked.price), peakPrice: picked.peak_price == null ? null : Number(picked.peak_price), peakStartHour: picked.peak_start_hour, peakEndHour: picked.peak_end_hour }, pickedSes.startMinutes) : 0;
  const back = `/schedule?date=${date}`;
  const prev = wibDate(new Date(start.getTime() - 86_400_000)), next = wibDate(new Date(start.getTime() + 86_400_000));
  const pname = (id: string) => prods.find((p) => p.id === id)?.name ?? "–";
  const sesNo = (b: any) => { const p = prods.find((x) => x.id === b.product_id); return p ? sessionOf({ openHour: p.open_hour, closeHour: p.close_hour, sessionMinutes: p.session_minutes }, b.slot_start)?.index : undefined; };

  return (
    <>
      <PageHeader eyebrow="Jadwal" title="Jadwal & booking" lead="Pilih sesi kosong, isi nama pelanggan, lalu tagihan payment gateway terbit otomatis. Pelanggan membayar lewat tautan; settlement masuk dari webhook, bukan dari klik kasir." />
      <Flash ok={sp.ok} err={sp.err} />
      {sp.pay && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="info" title="Tautan bayar pelanggan:">
            <div className="copybox" style={{ marginTop: 8 }}><input readOnly value={`${POS_URL}/pay/${sp.pay}`} aria-label="Tautan bayar" /><a className="btn sm" href={`/pay/${sp.pay}`} target="_blank">Buka</a></div>
          </Notice>
        </div>
      )}

      <Card title="Tanggal" actions={
        <div className="row">
          <Link className="btn sm" href={`/schedule?date=${prev}`}>←</Link>
          <form method="get" className="row" style={{ gap: 6 }}><input className="input" style={{ width: 160 }} type="date" name="date" defaultValue={date} /><button className="btn sm">Buka</button></form>
          <Link className="btn sm" href={`/schedule?date=${next}`}>→</Link>
        </div>} />

      {prods.length === 0 && <div className="mt"><Card><Empty>Belum ada produk aktif. <Link href="/products" style={{ color: "var(--accent)", fontWeight: 700 }}>Tambah produk →</Link></Empty></Card></div>}

      <div className="stack mt" style={{ ["--gap" as any]: "16px" }}>
        {prods.map((p) => {
          const sess = sessionsFor({ openHour: p.open_hour, closeHour: p.close_hour, sessionMinutes: p.session_minutes });
          const priceShape = { price: Number(p.price), peakPrice: p.peak_price == null ? null : Number(p.peak_price), peakStartHour: p.peak_start_hour, peakEndHour: p.peak_end_hour };
          return (
            <Card key={p.id} title={<>{p.name} <Badge plain>{p.category}</Badge></>} subtitle={`${sess.length} sesi × ${p.session_minutes} menit · ${hhmm(p.open_hour * 60)}–${hhmm(p.close_hour * 60)} WIB`}>
              <div className="chips">
                {sess.map((x) => {
                  const b = taken.get(`${p.id}:${x.index}`);
                  const past = sessionStartUtc(date, x.endMinutes).getTime() < nowMs;
                  const price = priceOfSession(priceShape, x.startMinutes);
                  const label = <><b>Sesi {x.index}</b><span>{hhmm(x.startMinutes)}–{hhmm(x.endMinutes)}</span></>;
                  if (b) return <div key={x.index} className={`chip ${b.status} ${past ? "past" : ""}`} title={b.customer_label}>{label}<em>{b.status === "held" ? "Menunggu bayar" : b.customer_label ?? ""}</em></div>;
                  const isPicked = picked?.id === p.id && pickedSes?.index === x.index;
                  return <Link key={x.index} className={`chip free ${past ? "past" : ""} ${isPicked ? "picked" : ""}`} href={`/schedule?date=${date}&product=${p.id}&session=${x.index}#baru`}>{label}<em>{rp(price)}</em></Link>;
                })}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt" id="baru">
        <Card tone={picked ? "accent" : undefined} title="Booking baru" subtitle={picked && pickedSes ? undefined : "Pilih sesi kosong di atas."}>
          {picked && pickedSes ? (
            <form action={newBooking} className="stack" style={{ ["--gap" as any]: "12px" }}>
              <input type="hidden" name="back" value={back} /><input type="hidden" name="date" value={date} /><input type="hidden" name="product" value={picked.id} /><input type="hidden" name="session" value={pickedSes.index} />
              <table className="kv"><tbody>
                <tr><td>Produk</td><td>{picked.name}</td></tr>
                <tr><td>Sesi</td><td>Sesi {pickedSes.index} · {hhmm(pickedSes.startMinutes)}–{hhmm(pickedSes.endMinutes)} · {date}</td></tr>
                <tr><td>Total tagihan</td><td><b>{rp(pickedPrice)}</b></td></tr>
              </tbody></table>
              <label className="field">Nama pelanggan<input className="input" name="customer" placeholder="mis. Budi" required /></label>
              <label className="field">Metode pembayaran
                <select className="select" name="method" defaultValue="gateway">
                  <option value="gateway">Link bayar (QRIS/VA/e-wallet via gateway): terverifikasi</option>
                  <option value="cash">Tunai (dicatat manual): tidak terverifikasi</option>
                  <option value="qris_sendiri">QRIS statis milik sendiri (dicatat manual): tidak terverifikasi</option>
                </select></label>
              <p className="small muted">Pembayaran di luar gateway tercatat jujur di ledger tetapi tidak dihitung sebagai omzet terverifikasi dan menurunkan rasio cakupan yang dinilai platform.</p>
              <div className="row"><button className="btn primary">Buat booking &amp; tagihan</button><span className="small muted">Hold 10 menit. Nama hanya untuk tampilan; yang dicatat di ledger adalah hash.</span></div>
            </form>
          ) : <Empty>Belum ada sesi yang dipilih.</Empty>}
        </Card>
      </div>

      <div className="mt">
        <Card title={`Booking tanggal ${date}`} actions={(bookings ?? []).some((b: any) => b.status === "held") ? <form action={syncPayments}><input type="hidden" name="back" value={back} /><button className="btn sm">Sinkronkan pembayaran</button></form> : undefined}>
          {(bookings ?? []).length === 0 ? <Empty>Belum ada booking pada tanggal ini.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Sesi</th><th>Produk</th><th>Pelanggan</th><th className="r">Nominal</th><th>Status</th><th>Pembayaran</th><th /></tr></thead>
              <tbody>{(bookings ?? []).map((b: any) => {
                const pay = Array.isArray(b.payments) ? b.payments[0] : b.payments;
                return (
                  <tr key={b.id}>
                    <td>{sesNo(b) ?? "–"}</td><td>{pname(b.product_id)}</td><td>{b.customer_label}</td><td className="r">{rp(b.amount)}</td>
                    <td><Badge tone={TONE[b.status] ?? "neutral"}>{b.status}</Badge></td>
                    <td>{pay?.pay_token && b.status === "held" ? <Link className="btn sm" href={`/pay/${pay.pay_token}`} target="_blank">Tautan bayar ↗</Link> : b.payment_method !== "gateway" ? <Badge tone="warn">{b.payment_method === "cash" ? "tunai" : "QRIS sendiri"}</Badge> : <span className="muted small">{pay?.status ?? "–"}</span>}</td>
                    <td className="r">
                      {b.status === "held" && <form action={cancel} className="inline"><input type="hidden" name="back" value={back} /><input type="hidden" name="id" value={b.id} /><button className="btn sm">Batal</button></form>}
                      {(b.status === "paid" || b.status === "completed") && <form action={refund} className="inline"><input type="hidden" name="back" value={back} /><input type="hidden" name="id" value={b.id} /><button className="btn sm danger">Refund</button></form>}
                    </td>
                  </tr>);
              })}</tbody>
            </table></div>
          )}
        </Card>
      </div>
    </>
  );
}
