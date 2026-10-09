import { NextResponse } from "next/server";
import { onChargePaid } from "@/lib/flows/payments";
import { verifyMockWebhook } from "@/lib/psp";

/** Webhook MockPaymentProvider (sandbox): HMAC atas `${timestamp}.${body}`, sama bentuknya dengan webhook penyedia sungguhan. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMockWebhook(raw, req.headers.get("x-sandbox-timestamp"), req.headers.get("x-sandbox-signature"))) return NextResponse.json({ error: "tanda tangan tidak valid" }, { status: 401 });
  const body = JSON.parse(raw) as { ref?: string; status?: string };
  if (body.ref && body.status === "PAID") {
    try { return NextResponse.json({ ok: true, result: await onChargePaid(body.ref) }); }
    catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 }); }
  }
  return NextResponse.json({ ok: true });
}
