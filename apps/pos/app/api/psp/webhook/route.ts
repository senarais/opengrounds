import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase";
import { syncPayment } from "@/lib/pos";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Callback invoice Xendit. Fail-closed: tanpa XENDIT_WEBHOOK_TOKEN yang cocok, ditolak.
 * Isi callback TIDAK dipercaya untuk status atau fee: syncPayment membaca ulang invoice dari API Xendit, baru melunasi.
 * Hanya tagihan ber-provider xendit yang diproses (tagihan simulasi dilunasi lewat halaman bayar simulasi).
 */
export async function POST(req: Request) {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN;
  if (!expected) return NextResponse.json({ error: "webhook belum dikonfigurasi (XENDIT_WEBHOOK_TOKEN kosong)" }, { status: 503 });
  if (!same(req.headers.get("x-callback-token") ?? "", expected)) return NextResponse.json({ error: "token tidak valid" }, { status: 401 });
  try {
    const b = (await req.json().catch(() => ({}))) as { id?: unknown; psp_ref?: unknown };
    const ref = String(b.psp_ref ?? b.id ?? "");
    if (!ref) return NextResponse.json({ ok: true, ignored: true });
    const { data: pay } = await admin().from("payments").select("pay_token, provider").eq("psp_ref", ref).maybeSingle();
    if (!pay || pay.provider !== "xendit") return NextResponse.json({ ok: true, ignored: true });
    const r = await syncPayment(admin(), pay.pay_token);
    return NextResponse.json({ ok: true, changed: r.changed });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}
