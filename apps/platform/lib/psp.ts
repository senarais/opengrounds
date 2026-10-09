/**
 * Payment gateway untuk pembelian token investor: Xendit Invoice API (QRIS, virtual account, e-wallet).
 * Terverifikasi jalan di TEST MODE (lihat docs/XENDIT.md). Status selalu dibaca dari API Xendit, bukan dari klik pengguna atau isi webhook.
 */
export interface PspClient {
  createInvoice(i: { amount: number; reference: string; description: string; returnUrl: string; seconds: number }): Promise<{ pspRef: string; checkoutUrl: string }>;
  status(pspRef: string): Promise<"pending" | "paid" | "expired">;
}

/** Pembelian investor lewat Xendit hanya bila PSP_MODE=xendit dan key terisi; selain itu alur simulasi lama. */
export const xenditConfigured = () => (process.env.PSP_MODE ?? "simulated") === "xendit" && !!process.env.XENDIT_SECRET_KEY;
export const xenditTestMode = () => (process.env.XENDIT_SECRET_KEY ?? "").startsWith("xnd_development_");

export function xenditClient(): PspClient {
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
    async createInvoice({ amount, reference, description, returnUrl, seconds }) {
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
  };
}
