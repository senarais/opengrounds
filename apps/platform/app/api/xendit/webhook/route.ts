import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { platformDb } from "@/lib/db";
import { settlePurchase } from "@/lib/flows/payment";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Callback invoice Xendit. Token header dicek, tetapi isi callback TIDAK dipercaya untuk status:
 * settlePurchase membaca ulang status invoice dari API Xendit. Butuh URL publik yang didaftarkan di dashboard Xendit;
 * tanpa itu, pembelian diselesaikan saat investor kembali ke Portofolio.
 */
export async function POST(req: Request) {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN;
  const got = req.headers.get("x-callback-token") ?? "";
  if (!expected || !same(got, expected)) return NextResponse.json({ error: "token tidak valid" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ ok: true });
  const { data: p } = await platformDb().from("purchases").select("id").eq("psp_ref", body.id).maybeSingle();
  if (p) await settlePurchase(p.id).catch(() => null);
  return NextResponse.json({ ok: true });
}
