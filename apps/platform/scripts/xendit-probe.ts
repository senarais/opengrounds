/**
 * Probe kapabilitas akun Xendit (aman: hanya baca, plus 1 invoice test dan 1 split rule dengan destinasi palsu yang pasti gagal).
 * Jalankan ulang setelah Xendit mengaktifkan xenPlatform: pnpm --filter @venue-rwa/platform xendit:probe
 */
const key = process.env.XENDIT_SECRET_KEY;
if (!key) { console.error("XENDIT_SECRET_KEY kosong"); process.exit(1); }
const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
const mode = key.startsWith("xnd_development_") ? "TEST" : key.startsWith("xnd_production_") ? "PRODUCTION" : "?";

async function call(path: string, init?: RequestInit) {
  const r = await fetch(`https://api.xendit.co${path}`, { ...init, headers: { Authorization: auth, "Content-Type": "application/json" } });
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
}
const row = (name: string, ok: boolean, detail: string) => console.log(`${ok ? "✓" : "✗"} ${name.padEnd(34)} ${detail}`);

(async () => {
  console.log(`Mode key: ${mode}\n`);
  if (mode === "PRODUCTION") { console.log("Key PRODUCTION: probe tulis dilewati."); }
  const bal = await call("/balance");
  row("Saldo (GET /balance)", bal.status === 200, bal.status === 200 ? `Rp${Number(bal.body.balance).toLocaleString("id-ID")}` : `${bal.status} ${bal.body.message ?? ""}`);
  if (mode !== "PRODUCTION") {
    const inv = await call("/v2/invoices", { method: "POST", body: JSON.stringify({ external_id: `probe-${Date.now()}`, amount: 10000, currency: "IDR", description: "probe", invoice_duration: 300 }) });
    const qris = !!inv.body.available_qr_codes?.some((q: any) => q.qr_code_type === "QRIS");
    row("Invoice API (QRIS/VA/e-wallet)", inv.status === 200, inv.status === 200 ? `QRIS ${qris ? "ya" : "tidak"}, VA ${inv.body.available_banks?.length ?? 0} bank, e-wallet ${inv.body.available_ewallets?.length ?? 0}` : `${inv.status} ${inv.body.message ?? ""}`);
    const sr = await call("/split_rules", { method: "POST", body: JSON.stringify({ name: "probe", routes: [{ percent_amount: 10, currency: "IDR", destination_account_id: "000000000000000000000000", reference_id: "probe-1" }] }) });
    const splitOk = sr.body.error_code === "DESTINATION_ACCOUNT_NOT_FOUND" || sr.status === 200;
    row("Split rules (xenPlatform)", splitOk, splitOk ? "tersedia (destinasi palsu ditolak seperti yang diharapkan)" : `${sr.status} ${sr.body.error_code ?? ""}: ${sr.body.message ?? ""}`);
  }
  const acc = await call("/v2/accounts?type=MANAGED");
  row("Sub-akun (GET /v2/accounts)", acc.status === 200, acc.status === 200 ? `${acc.body.data?.length ?? 0} sub-akun` : `${acc.status} ${acc.body.name ?? acc.body.error_code ?? ""}`);
  console.log("\nKesimpulan: pool investor di dalam Xendit (split ke sub-akun) hanya bisa dipakai bila 'Split rules' dan 'Sub-akun' bertanda ✓.");
})().catch((e) => { console.error(e); process.exit(1); });
