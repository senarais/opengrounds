/** Offline sandbox payment fixtures; never calls a real PSP or bank. */
import { randomBytes } from "node:crypto";
import { customerRef, DEMO_SALT, serviceClient } from "@venue-rwa/shared";
import { settlePayment } from "../../pos/lib/pos";

export async function seedPosDemo(companyId: string, count: number, amount: number) {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seed disabled in production");
  const db = serviceClient("pos");
  const { data: company, error: ce } = await db.from("companies").select("synthetic").eq("id", companyId).single();
  if (ce || !company?.synthetic) throw new Error("Only synthetic PoS companies may be seeded");
  const { data: existing } = await db.from("products").select("id").eq("company_id", companyId).eq("name", "Paket sewa demo (sandbox)").maybeSingle();
  let productId = existing?.id;
  if (!productId) {
    const { data, error } = await db.from("products").insert({ company_id: companyId, name: "Paket sewa demo (sandbox)", category: "demo", open_hour: 0, close_hour: 24, session_minutes: 60, price: amount, active: false }).select("id").single();
    if (error) throw new Error(error.message);
    productId = data!.id;
  }
  for (let i = 0; i < count; i++) {
    const ref = `demo-profit-v1:${companyId}:${i}`;
    const id = `demo_${companyId.slice(0, 8)}_${i}`;
    const { data: pay } = await db.from("payments").select("status").eq("psp_ref", ref).maybeSingle();
    if (!pay) {
      const start = new Date(Date.now() + i * 3600000);
      const { error: be } = await db.from("bookings").upsert({ id, company_id: companyId, product_id: productId, slot_start: start.toISOString(), slot_end: new Date(start.getTime() + 3600000).toISOString(), status: "held", payment_method: "gateway", source: "pos", external_ref: ref, customer_ref: customerRef(ref, DEMO_SALT), customer_label: `Pelanggan demo ${i + 1}`, amount, hold_expires_at: new Date(Date.now() + 3600000).toISOString() }, { onConflict: "id", ignoreDuplicates: true });
      if (be) throw new Error(be.message);
      const { error: pe } = await db.from("payments").insert({ id: `pay_${id}`, company_id: companyId, booking_id: id, psp_ref: ref, pay_token: randomBytes(18).toString("base64url"), status: "pending", gross: amount, simulated: true, provider: "simulated", expires_at: new Date(Date.now() + 3600000).toISOString() });
      if (pe) throw new Error(pe.message);
    }
    if (pay?.status === "settled") continue;
    await settlePayment(db, { pspRef: ref });
  }
  console.log(`PoS sandbox: ${count} payments, Rp${(count * amount).toLocaleString("id-ID")}, company ${companyId}`);
}
