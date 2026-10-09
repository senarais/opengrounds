/**
 * Adapter payment gateway.
 *  - simulasi : halaman bayar kita sendiri (/pay/<token>), tanpa uang riil.
 *  - xendit   : Invoice API (QRIS, VA, e-wallet). Terverifikasi jalan di TEST MODE. Split/sub-akun (xenPlatform) TIDAK dipakai
 *               karena akun ini belum punya aksesnya (INVALID_CREDENTIALS pada /split_rules dan /v2/accounts).
 */
export interface Invoice {
  pspRef: string; // simulasi: SIM-INV-…; xendit: id invoice
  checkoutUrl: string | null;
  simulated: boolean;
}

export type PspStatus = { state: "pending" | "paid" | "expired"; fee?: number };

export interface PspAdapter {
  name: "simulated" | "xendit";
  createInvoice(input: { amount: number; reference: string; expiresAt: Date; description: string; returnUrl: string; splitRuleId?: string }): Promise<Invoice>;
  status(pspRef: string): Promise<PspStatus>;
}

const simulated: PspAdapter = {
  name: "simulated",
  async createInvoice({ reference }) {
    return { pspRef: `SIM-INV-${reference.replace(/[^A-Za-z0-9]/g, "").slice(0, 14).toUpperCase()}`, checkoutUrl: null, simulated: true };
  },
  async status() {
    return { state: "pending" };
  },
};

/**
 * Aturan pemisahan dana (xenPlatform split rule): persen dari setiap pembayaran diarahkan ke akun tujuan (kantong SPV, s% dari omzet).
 * BELUM TERVERIFIKASI: akun Xendit kita belum punya akses xenPlatform (lihat docs/XENDIT.md). Bentuk request mengikuti dokumentasi
 * resmi dan hanya diuji dengan fetch palsu; jangan diaktifkan sebelum xenPlatform aktif dan dicoba di test mode.
 */
export function splitRuleBody(a: { name: string; percent: number; destinationAccountId: string; reference: string }) {
  if (!(a.percent > 0 && a.percent <= 100)) throw new Error("persen split harus di antara 0 dan 100");
  return { name: a.name.slice(0, 100), description: `Kantong SPV ${a.percent}%`, routes: [{ percent_amount: a.percent, currency: "IDR", destination_account_id: a.destinationAccountId, reference_id: a.reference }] };
}

export const splitEnabled = () => process.env.XENDIT_SPLIT === "on";

function xendit(): PspAdapter {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) throw new Error("XENDIT_SECRET_KEY belum diisi di .env");
  const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
  const call = async (path: string, init?: RequestInit) => {
    const res = await fetch(`https://api.xendit.co${path}`, { ...init, headers: { Authorization: auth, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Xendit ${res.status}: ${body.message ?? body.error_code ?? "gagal"}`);
    return body;
  };
  return {
    name: "xendit",
    async createInvoice({ amount, reference, expiresAt, description, returnUrl, splitRuleId }) {
      if (splitRuleId && !splitEnabled()) throw new Error("Split Xendit dimatikan (XENDIT_SPLIT=on belum diset; butuh xenPlatform aktif)");
      const seconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      const inv = await call("/v2/invoices", {
        method: "POST",
        headers: splitRuleId ? { "with-split-rule": splitRuleId } : undefined,
        body: JSON.stringify({ external_id: reference, amount, currency: "IDR", description, invoice_duration: seconds, success_redirect_url: returnUrl, failure_redirect_url: returnUrl }),
      });
      return { pspRef: inv.id, checkoutUrl: inv.invoice_url, simulated: false };
    },
    async status(pspRef) {
      const inv = await call(`/v2/invoices/${encodeURIComponent(pspRef)}`);
      if (inv.status === "PAID" || inv.status === "SETTLED") return { state: "paid", fee: typeof inv.fees_paid_amount === "number" ? inv.fees_paid_amount : undefined };
      if (inv.status === "EXPIRED") return { state: "expired" };
      return { state: "pending" };
    },
  };
}

/** Buat split rule di Xendit (butuh xenPlatform). Mengembalikan id aturan untuk dipakai di createInvoice. */
export async function createSplitRule(a: Parameters<typeof splitRuleBody>[0], f: typeof fetch = fetch): Promise<string> {
  if (!splitEnabled()) throw new Error("Split Xendit dimatikan (XENDIT_SPLIT=on belum diset; butuh xenPlatform aktif)");
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) throw new Error("XENDIT_SECRET_KEY belum diisi di .env");
  const res = await f("https://api.xendit.co/split_rules", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64"), "Content-Type": "application/json" }, body: JSON.stringify(splitRuleBody(a)) });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Xendit ${res.status}: ${body.message ?? body.error_code ?? "gagal"}`);
  return body.id as string;
}

export function psp(): PspAdapter {
  return (process.env.PSP_MODE ?? "simulated") === "xendit" ? xendit() : simulated;
}

export const providerName = () => ((process.env.PSP_MODE ?? "simulated") === "xendit" ? "xendit" : "simulated");
