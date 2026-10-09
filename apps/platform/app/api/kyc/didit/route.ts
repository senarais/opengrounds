import { NextResponse } from "next/server";
import { verifyDiditWebhook } from "@venue-rwa/shared";
import { diditConfig } from "@/lib/didit";
import { applyStatus } from "@/lib/flows/kyc";

/** Webhook Didit (butuh URL publik). Tanda tangan X-Signature-V2 dan timestamp diverifikasi; tanpa secret ditolak. */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = await verifyDiditWebhook({ rawBody: raw, signature: req.headers.get("x-signature-v2"), timestamp: req.headers.get("x-timestamp"), secret: diditConfig().webhookSecret });
  if (!ok) return NextResponse.json({ error: "tanda tangan tidak valid" }, { status: 401 });
  const b = JSON.parse(raw) as { session_id?: string; status?: string; event_id?: string; webhook_type?: string };
  if (b.session_id && b.status) await applyStatus(b.session_id, b.status, b.event_id);
  return NextResponse.json({ ok: true });
}
