import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { onChargePaid } from "@/lib/flows/payments";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Callback invoice Xendit. Token header dicek, tetapi isi callback TIDAK dipercaya untuk status: status dibaca ulang dari API Xendit.
 * Tanpa URL publik terdaftar, pesanan diselesaikan saat investor kembali ke Portofolio.
 */
export async function POST(req: Request) {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN;
  const got = req.headers.get("x-callback-token") ?? "";
  if (!expected || !same(got, expected)) return NextResponse.json({ error: "Invalid webhook token." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (body.id) await onChargePaid(body.id).catch((e) => console.error("[xendit]", e?.message ?? e));
  return NextResponse.json({ ok: true });
}
