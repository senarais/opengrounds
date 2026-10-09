import { NextResponse } from "next/server";
import { verifyDiditWebhook } from "@venue-rwa/shared";
import { diditConfig } from "@/lib/didit";
import { applyDiditStatus } from "@/lib/flows/investor";

/** Webhook Didit (butuh URL publik). Tanda tangan X-Signature-V2 dan timestamp diverifikasi; tanpa secret ditolak. */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = await verifyDiditWebhook({ rawBody: raw, signature: req.headers.get("x-signature-v2"), timestamp: req.headers.get("x-timestamp"), secret: diditConfig().webhookSecret });
  if (!ok) return NextResponse.json({ error: "tanda tangan tidak valid" }, { status: 401 });
  const b = JSON.parse(raw) as { session_id?: string; status?: string; event_id?: string; decision?: any };
  const idv = b.decision?.id_verification ?? {};
  const name = idv.full_name ?? ([idv.first_name, idv.last_name].filter(Boolean).join(" ") || null);
  if (b.session_id && b.status) await applyDiditStatus(b.session_id, b.status, b.event_id, name);
  return NextResponse.json({ ok: true });
}
