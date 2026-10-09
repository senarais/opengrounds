import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { platformDb } from "./db";

/**
 * PaymentProvider (§8.4). Dua implementasi:
 *  - XenditProvider : Invoice API (QRIS/VA/e-wallet), terverifikasi di TEST MODE. Status selalu dibaca ulang dari API Xendit.
 *  - MockPaymentProvider : sandbox berlabel, dengan webhook bertanda tangan HMAC. Dipakai bila Xendit tidak dikonfigurasi
 *    dan untuk split venue (xenPlatform belum aktif di akun ini).
 * Status tagihan TIDAK pernah dipercaya dari klik pengguna atau isi webhook mentah.
 */
export interface Charge { pspRef: string; checkoutUrl: string }
export type ChargeStatus = "pending" | "paid" | "expired";
export interface PaymentProvider {
  readonly name: "xendit" | "mock";
  createCharge(i: { amount: number; reference: string; description: string; returnUrl: string; seconds: number }): Promise<Charge>;
  status(pspRef: string): Promise<ChargeStatus>;
  expire(pspRef: string): Promise<void>;
}

export const xenditConfigured = () => (process.env.PSP_MODE ?? "mock") === "xendit" && !!process.env.XENDIT_SECRET_KEY;
export const xenditTestMode = () => (process.env.XENDIT_SECRET_KEY ?? "").startsWith("xnd_development_");
export const provider = (): PaymentProvider => (xenditConfigured() ? xendit() : mock());
export const providerFor = (pspRef: string): PaymentProvider => (pspRef.startsWith("mock_") ? mock() : xendit());

function xendit(): PaymentProvider {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) throw new Error("XENDIT_SECRET_KEY belum diisi di .env");
  const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetch(`https://api.xendit.co${path}`, { ...init, headers: { Authorization: auth, "Content-Type": "application/json" }, cache: "no-store" });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Xendit ${res.status}: ${body.message ?? body.error_code ?? "gagal"}`);
    return body;
  };
  return {
    name: "xendit",
    async createCharge({ amount, reference, description, returnUrl, seconds }) {
      const inv = await call("/v2/invoices", {
        method: "POST",
        body: JSON.stringify({ external_id: reference, amount, currency: "IDR", description, invoice_duration: seconds, success_redirect_url: returnUrl, failure_redirect_url: returnUrl }),
      });
      return { pspRef: inv.id as string, checkoutUrl: inv.invoice_url as string };
    },
    async status(pspRef) {
      const inv = await call(`/v2/invoices/${encodeURIComponent(pspRef)}`);
      if (inv.status === "PAID" || inv.status === "SETTLED") return "paid";
      if (inv.status === "EXPIRED") return "expired";
      return "pending";
    },
    async expire(pspRef) {
      await call(`/invoices/${encodeURIComponent(pspRef)}/expire!`, { method: "POST" }).catch(() => null);
    },
  };
}

function mock(): PaymentProvider {
  const pf = () => platformDb();
  return {
    name: "mock",
    async createCharge({ amount, description, returnUrl, seconds }) {
      const ref = `mock_${randomUUID()}`;
      const { error } = await pf().from("mock_charges").insert({ ref, amount, description, expires_at: new Date(Date.now() + seconds * 1000).toISOString() });
      if (error) throw new Error(error.message);
      return { pspRef: ref, checkoutUrl: `/sandbox/pay/${ref}?back=${encodeURIComponent(returnUrl)}` };
    },
    async status(ref) {
      const { data } = await pf().from("mock_charges").select("status, expires_at").eq("ref", ref).maybeSingle();
      if (!data) return "expired";
      if (data.status === "pending" && Date.parse(data.expires_at) < Date.now()) return "expired";
      return data.status as ChargeStatus;
    },
    async expire(ref) {
      await pf().from("mock_charges").update({ status: "expired" }).eq("ref", ref).eq("status", "pending");
    },
  };
}

// ---------------------------------------------------------------- webhook sandbox bertanda tangan

const secret = () => {
  const s = process.env.INTERNAL_API_TOKEN;
  if (!s) throw new Error("INTERNAL_API_TOKEN belum diisi (dipakai menandatangani webhook sandbox)");
  return s;
};
export const signMockWebhook = (body: string, ts: string) => createHmac("sha256", secret()).update(`${ts}.${body}`).digest("hex");
export function verifyMockWebhook(body: string, ts: string | null, sig: string | null): boolean {
  if (!ts || !sig || Math.abs(Date.now() - Number(ts)) > 5 * 60_000) return false;
  const want = Buffer.from(signMockWebhook(body, ts));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Halaman bayar sandbox → webhook bertanda tangan (format sama seperti dari penyedia sungguhan). */
export async function payMockCharge(ref: string): Promise<void> {
  const pf = platformDb();
  const { data } = await pf.from("mock_charges").select("*").eq("ref", ref).maybeSingle();
  if (!data) throw new Error("Tagihan sandbox tidak ditemukan");
  if (data.status === "paid") return;
  if (data.status !== "pending" || Date.parse(data.expires_at) < Date.now()) throw new Error("Tagihan sandbox sudah kedaluwarsa");
  await pf.from("mock_charges").update({ status: "paid", paid_at: new Date().toISOString() }).eq("ref", ref).eq("status", "pending");
}
