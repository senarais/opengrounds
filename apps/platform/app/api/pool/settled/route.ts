import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { platformDb } from "@/lib/db";
import { ingestSplits } from "@/lib/flows/periods";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Dipanggil PoS setiap kali satu pembayaran booking settle: catat split s% ke kantong SPV (sandbox, xenPlatform belum aktif).
 * Fail-closed: tanpa INTERNAL_API_TOKEN yang cocok, ditolak.
 */
export async function POST(req: Request) {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "INTERNAL_API_TOKEN is not configured." }, { status: 503 });
  if (!same(req.headers.get("x-internal-token") ?? "", expected)) return NextResponse.json({ error: "Invalid API token." }, { status: 401 });
  const { companyId } = (await req.json().catch(() => ({}))) as { companyId?: string };
  if (!companyId) return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  after(async () => {
    const pf = platformDb();
    const { data: venues } = await pf.from("venues").select("id").eq("pos_company_id", companyId);
    if (!venues?.length) return;
    const { data: series } = await pf.from("series").select("id").in("venue_id", venues.map((v) => v.id)).not("contract_address", "is", null);
    for (const s of series ?? []) await ingestSplits(s.id).catch((e) => console.error("[split]", s.id, e?.message ?? e));
  });
  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}
