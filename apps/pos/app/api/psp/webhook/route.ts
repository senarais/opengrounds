import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { settlePayment } from "@/lib/pos";

/** Webhook settlement PSP. Adapter menormalkan payload ke { psp_ref, status }. Settlement dicatat DARI SINI, bukan dari klik kasir. */
export async function POST(req: Request) {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN;
  if (expected && req.headers.get("x-callback-token") !== expected) return NextResponse.json({ error: "token tidak valid" }, { status: 401 });
  try {
    const b = await req.json();
    if (b.status !== "settled" && b.status !== "PAID" && b.status !== "SETTLED") return NextResponse.json({ ok: true, ignored: true });
    // Xendit Invoice callback: { id, external_id, status: "PAID", paid_amount, fees_paid_amount, ... }
    const r = await settlePayment(admin(), { pspRef: String(b.psp_ref ?? b.id) }, { fee: typeof b.fees_paid_amount === "number" ? b.fees_paid_amount : undefined });
    return NextResponse.json({ ok: true, already: r.already });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}
