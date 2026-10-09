/** Cek adapter Xendit tanpa database: buat tagihan test lalu baca statusnya. */
import { psp } from "../lib/psp";
(async () => {
  process.env.PSP_MODE = "xendit";
  const a = psp();
  const inv = await a.createInvoice({ amount: 25000, reference: `check-${Date.now()}`, expiresAt: new Date(Date.now() + 600_000), description: "cek adapter PoS", returnUrl: "http://localhost:3001/pay/x" });
  console.log("invoice:", inv);
  console.log("status :", await a.status(inv.pspRef));
})().catch((e) => { console.error(e.message); process.exit(1); });
