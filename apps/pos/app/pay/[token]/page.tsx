import { hhmm, sessionOf } from "@venue-rwa/shared";
import { Badge, Logo, Notice } from "@venue-rwa/ui";
import { admin } from "@/lib/supabase";
import { rp } from "@/lib/format";
import { syncPayment } from "@/lib/pos";
import { simulatePay, syncPay } from "./actions";

export const dynamic = "force-dynamic";

/** Halaman bayar untuk pelanggan (tanpa login). Di produksi ini digantikan halaman QRIS/VA dari payment gateway. */
export default async function PayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  // pelanggan kembali dari halaman bayar PSP: tarik status terbaru (webhook mungkin belum menjangkau server)
  try { await syncPayment(admin(), token); } catch { /* status ditampilkan apa adanya */ }
  const { data: pay } = await admin().from("payments").select("*, bookings(*, products(*)), companies:company_id(name, synthetic)").eq("pay_token", token).maybeSingle();
  if (!pay) return <Shell><Notice tone="bad">Tautan pembayaran tidak valid.</Notice></Shell>;
  const b: any = pay.bookings, p: any = b.products, c: any = pay.companies;
  const ses = sessionOf({ openHour: p.open_hour, closeHour: p.close_hour, sessionMinutes: p.session_minutes }, b.slot_start);
  const wib = new Date(new Date(b.slot_start).getTime() + 7 * 3_600_000);
  const date = wib.toISOString().slice(0, 10);
  const expired = pay.status === "pending" && pay.expires_at && new Date(pay.expires_at) < new Date();
  const paid = pay.status === "settled" || pay.status === "refunded";

  return (
    <Shell>
      <div className="card checkout">
        <div className="row between"><span className="eyebrow">Tagihan</span>{paid ? <Badge tone="ok">Lunas</Badge> : expired || pay.status === "expired" ? <Badge tone="bad">Kedaluwarsa</Badge> : pay.status === "failed" ? <Badge>Dibatalkan</Badge> : <Badge tone="warn">Menunggu pembayaran</Badge>}</div>
        <h1 style={{ fontSize: 22, margin: "10px 0 2px" }}>{c.name}</h1>
        <p className="muted small">{p.name}{ses ? ` · Sesi ${ses.index}` : ""}</p>
        <table className="kv" style={{ marginTop: 14 }}><tbody>
          <tr><td>Tanggal</td><td>{date}</td></tr>
          {ses && <tr><td>Waktu</td><td>{hhmm(ses.startMinutes)}–{hhmm(ses.endMinutes)} WIB</td></tr>}
          <tr><td>Atas nama</td><td>{b.customer_label}</td></tr>
        </tbody></table>
        <div className="divider" />
        <div className="muted small">Total</div>
        <div className="big-amount">{rp(pay.gross)}</div>
        {sp.err && <div style={{ marginTop: 14 }}><Notice tone="bad">{sp.err}</Notice></div>}
        {paid ? <div style={{ marginTop: 16 }}><Notice tone="ok" title="Pembayaran diterima.">Sesi Anda terkonfirmasi. Sampai jumpa di lapangan!</Notice></div>
          : pay.status === "pending" && !expired ? (
            pay.provider === "xendit" ? (
              <div style={{ marginTop: 18 }} className="stack">
                <a className="btn primary lg" style={{ width: "100%" }} href={pay.checkout_url} target="_blank" rel="noreferrer">Bayar {rp(pay.gross)} · QRIS / VA / e-wallet</a>
                <form action={syncPay}><input type="hidden" name="token" value={token} /><button className="btn" style={{ width: "100%" }}>Saya sudah membayar</button></form>
                <p className="small muted">Pembayaran diproses Xendit{String(pay.psp_ref).length > 0 ? ` (tagihan ${String(pay.psp_ref).slice(0, 8)}…)` : ""}. Tagihan berlaku sampai {new Date(pay.expires_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB.</p>
              </div>
            ) : (
              <form action={simulatePay} style={{ marginTop: 18 }}>
                <input type="hidden" name="token" value={token} />
                <button className="btn primary lg" style={{ width: "100%" }}>Bayar {rp(pay.gross)}</button>
                <p className="small muted" style={{ marginTop: 10 }}>Halaman pembayaran <b>SIMULASI</b> sebagai pengganti QRIS/VA. Tidak ada uang riil yang berpindah. Tagihan berlaku sampai {new Date(pay.expires_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })} WIB.</p>
              </form>
            )
          ) : <div style={{ marginTop: 16 }}><Notice tone="warn">Tagihan ini tidak bisa dibayar lagi. Hubungi {c.name} untuk membuat booking baru.</Notice></div>}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: "100vh", padding: "32px 16px" }}><div style={{ maxWidth: 460, margin: "0 auto 22px" }}><Logo name="PoS" sub="Pembayaran" href="#" /></div>{children}</div>;
}
