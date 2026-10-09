import { randomBytes, randomUUID } from "node:crypto";
import type { Hex } from "viem";
import {
  DEMO_SALT as SALT,
  FEE_BPS,
  ZERO_HASH,
  customerRef,
  ledgerEntryHash,
  priceOfSession,
  sessionOf,
  sessionStartUtc,
  sessionsFor,
  type AppClient,
  type LedgerEntryType,
} from "@venue-rwa/shared";
import { psp } from "./psp";

export const HOLD_MINUTES = 10;
const rp = (n: number) => "Rp" + n.toLocaleString("id-ID");

export interface NewEntry {
  type: LedgerEntryType;
  amount: number;
  bookingId: string | null;
  createdAt?: string;
}

/** Tambah entri ke ledger append-only milik SATU company: hash menyambung ke entri terakhir company itu. */
export async function appendEntries(db: AppClient, companyId: string, entries: NewEntry[]) {
  const { data: last } = await db.from("ledger_entries").select("hash").eq("company_id", companyId).order("seq", { ascending: false }).limit(1).maybeSingle();
  let prev = (last?.hash as Hex | undefined) ?? ZERO_HASH;
  const rows = entries.map((e) => {
    const base = { id: `le_${randomUUID()}`, companyId, type: e.type, amount: e.amount, bookingId: e.bookingId, createdAt: e.createdAt ?? new Date().toISOString() };
    const hash = ledgerEntryHash(prev, base);
    const row = { id: base.id, company_id: companyId, type: e.type, amount: e.amount, booking_id: e.bookingId, created_at: base.createdAt, prev_hash: prev, hash };
    prev = hash;
    return row;
  });
  const { error } = await db.from("ledger_entries").insert(rows);
  if (error) throw new Error(`ledger: ${error.message}`);
  return rows;
}

const productShape = (p: any) => ({ openHour: p.open_hour, closeHour: p.close_hour, sessionMinutes: p.session_minutes });
const priceShape = (p: any) => ({ price: Number(p.price), peakPrice: p.peak_price == null ? null : Number(p.peak_price), peakStartHour: p.peak_start_hour, peakEndHour: p.peak_end_hour });

/** Validasi produk/sesi dan hitung slot + harga. Dipakai booking via gateway maupun pencatatan di luar jalur. */
async function prepare(db: AppClient, companyId: string, input: { productId: string; date: string; sessionIndex: number }) {
  const { data: product } = await db.from("products").select("*").eq("id", input.productId).eq("company_id", companyId).maybeSingle();
  if (!product) throw new Error("Produk tidak ditemukan di perusahaan ini");
  if (!product.active) throw new Error("Produk sedang tidak aktif");
  const session = sessionsFor(productShape(product)).find((s) => s.index === input.sessionIndex);
  if (!session) throw new Error("Sesi tidak ada pada produk ini");
  const start = sessionStartUtc(input.date, session.startMinutes);
  const end = new Date(start.getTime() + product.session_minutes * 60_000);
  const amount = priceOfSession(priceShape(product), session.startMinutes);
  return { product, session, start, end, amount };
}

/**
 * Buat booking (hold 10 menit) dan OTOMATIS membuat tagihan payment gateway dengan total harga sesi.
 * Customer membayar lewat tautan /pay/<token>.
 */
export async function createBooking(db: AppClient, companyId: string, input: { productId: string; date: string; sessionIndex: number; customerLabel: string; createdBy?: string }) {
  const { product, session, start, end, amount } = await prepare(db, companyId, input);
  const expires = new Date(Date.now() + HOLD_MINUTES * 60_000);
  const label = input.customerLabel.trim().slice(0, 40) || "Pelanggan";
  const id = `bk_${randomBytes(4).toString("hex")}`;

  const { error } = await db.from("bookings").insert({
    id, company_id: companyId, product_id: product.id, slot_start: start.toISOString(), slot_end: end.toISOString(), status: "held", payment_method: "gateway",
    customer_ref: customerRef(`${label}:${randomUUID()}`, SALT), customer_label: label, amount, hold_expires_at: expires.toISOString(), created_by: input.createdBy ?? null,
  });
  if (error) throw new Error(error.code === "23505" ? "Sesi itu sudah dipesan" : error.message);

  const payToken = randomBytes(18).toString("base64url");
  const adapter = psp();
  let inv;
  try {
    inv = await adapter.createInvoice({ amount, reference: id, expiresAt: expires, description: `${product.name} · Sesi ${session.index} · ${input.date}`, returnUrl: `${process.env.POS_URL ?? "http://localhost:3001"}/pay/${payToken}` });
  } catch (e) {
    await db.from("bookings").delete().eq("id", id);
    throw e;
  }
  const { error: pe } = await db.from("payments").insert({
    id: `pay_${randomBytes(4).toString("hex")}`, company_id: companyId, booking_id: id, psp_ref: inv.pspRef, pay_token: payToken,
    status: "pending", gross: amount, expires_at: expires.toISOString(), simulated: inv.simulated, provider: adapter.name, checkout_url: inv.checkoutUrl,
  });
  if (pe) {
    await db.from("bookings").delete().eq("id", id);
    throw new Error(pe.message);
  }
  return { bookingId: id, amount, payToken, sessionIndex: session.index };
}

/**
 * Settlement dari PSP (webhook atau halaman bayar simulasi). Idempoten: dipanggil dua kali tidak menggandakan ledger.
 * `ref` = pay_token atau psp_ref.
 */
export async function settlePayment(db: AppClient, ref: { payToken?: string; pspRef?: string }, opts: { fee?: number } = {}) {
  let q = db.from("payments").select("*, bookings(*)");
  q = ref.payToken ? q.eq("pay_token", ref.payToken) : q.eq("psp_ref", ref.pspRef ?? "");
  const { data: pay } = await q.maybeSingle();
  if (!pay) throw new Error("Tagihan tidak ditemukan");
  if (pay.status === "settled" || pay.status === "refunded") return { already: true as const, amount: Number(pay.gross) };
  const booking = pay.bookings;
  if (pay.status !== "pending") throw new Error(`Tagihan berstatus ${pay.status}`);
  if ((pay.expires_at && new Date(pay.expires_at) < new Date()) || booking.status !== "held") {
    await db.from("payments").update({ status: "expired" }).eq("id", pay.id).eq("status", "pending");
    if (booking.status === "held") await db.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
    throw new Error("Tagihan sudah kedaluwarsa (hold 10 menit habis)");
  }
  const amount = Number(pay.gross);
  const fee = opts.fee ?? Math.round((amount * FEE_BPS) / 10_000); // fee nyata dari PSP bila ada, selain itu estimasi
  const tax = Math.round(amount / 11); // harga sudah termasuk PB1 10%
  const now = new Date().toISOString();
  // klaim atomik: hanya satu pemanggil yang berhasil mengubah pending → settled
  const { data: claimed } = await db.from("payments").update({ status: "settled", fee, settled_at: now }).eq("id", pay.id).eq("status", "pending").select("id");
  if (!claimed?.length) return { already: true as const, amount };
  await db.from("bookings").update({ status: "paid" }).eq("id", booking.id);
  await appendEntries(db, pay.company_id, [
    { type: "sale", amount, bookingId: booking.id, createdAt: now },
    { type: "tax", amount: tax, bookingId: booking.id, createdAt: now },
    { type: "fee", amount: fee, bookingId: booking.id, createdAt: now },
  ]);
  notifyPlatform(pay.company_id);
  return { already: false as const, amount, fee, tax, bookingId: booking.id as string };
}

/**
 * Beri tahu platform bahwa ada pembayaran yang settle, supaya split s% ke kantong SPV dicatat (MockPaymentProvider, sandbox).
 * Tidak ditunggu dan tidak pernah menggagalkan pelunasan: platform tidak terjangkau = diposting pada pembayaran berikutnya.
 */
function notifyPlatform(companyId: string) {
  const url = process.env.PLATFORM_URL, token = process.env.INTERNAL_API_TOKEN;
  if (!url || !token) return;
  void fetch(`${url.replace(/\/$/, "")}/api/pool/settled`, {
    method: "POST", headers: { "content-type": "application/json", "x-internal-token": token }, body: JSON.stringify({ companyId }), signal: AbortSignal.timeout(10_000),
  }).catch(() => { /* platform mati / jaringan: abaikan */ });
}

/**
 * Tarik status dari PSP untuk tagihan yang masih pending (dipakai saat webhook belum bisa menjangkau server, mis. localhost,
 * dan saat pelanggan kembali dari halaman bayar). Hasil PAID diproses dengan fungsi settle yang sama dengan webhook.
 */
export async function syncPayment(db: AppClient, payToken: string) {
  const { data: pay } = await db.from("payments").select("*").eq("pay_token", payToken).maybeSingle();
  if (!pay || pay.status !== "pending" || pay.provider !== "xendit") return { changed: false as const };
  const st = await psp().status(pay.psp_ref);
  if (st.state === "paid") { await settlePayment(db, { payToken }, { fee: st.fee }); return { changed: true as const, state: "paid" as const }; }
  if (st.state === "expired") {
    await db.from("payments").update({ status: "expired" }).eq("id", pay.id).eq("status", "pending");
    await db.from("bookings").update({ status: "cancelled" }).eq("id", pay.booking_id).eq("status", "held");
    return { changed: true as const, state: "expired" as const };
  }
  return { changed: false as const };
}

/** Sinkronkan semua tagihan Xendit yang masih pending milik satu company. */
export async function syncPendingPayments(db: AppClient, companyId: string) {
  const { data } = await db.from("payments").select("pay_token").eq("company_id", companyId).eq("status", "pending").eq("provider", "xendit");
  let paid = 0;
  for (const p of data ?? []) { const r = await syncPayment(db, p.pay_token); if (r.changed && r.state === "paid") paid++; }
  return { checked: data?.length ?? 0, paid };
}

/** Refund = entri NEGATIF baru. Entri lama tidak pernah diubah. */
export async function refundBooking(db: AppClient, companyId: string, bookingId: string) {
  const { data: b } = await db.from("bookings").select("*").eq("id", bookingId).eq("company_id", companyId).maybeSingle();
  if (!b) throw new Error("Booking tidak ditemukan");
  if (!["paid", "completed"].includes(b.status)) throw new Error(`Booking berstatus ${b.status}, tidak bisa direfund`);
  await db.from("payments").update({ status: "refunded" }).eq("booking_id", bookingId);
  await db.from("bookings").update({ status: "refunded" }).eq("id", bookingId);
  await appendEntries(db, companyId, [{ type: "refund", amount: -Number(b.amount), bookingId }]);
}

export async function cancelBooking(db: AppClient, companyId: string, bookingId: string) {
  const { data: b } = await db.from("bookings").select("status").eq("id", bookingId).eq("company_id", companyId).maybeSingle();
  if (b?.status !== "held") throw new Error("Hanya booking berstatus held yang bisa dibatalkan");
  await db.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
  await db.from("payments").update({ status: "failed" }).eq("booking_id", bookingId).eq("status", "pending");
}

export { rp, sessionOf };
