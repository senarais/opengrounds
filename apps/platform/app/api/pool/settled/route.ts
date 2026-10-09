import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { platformDb } from "@/lib/db";
import { getCtx } from "@/lib/flow";
import { finalizePeriod } from "@/lib/flows/series";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
/** Satu antrean per perusahaan: pembayaran yang lunas berdekatan tidak memposting periode bersamaan (nomor periode bentrok). */
const queues = new Map<string, Promise<unknown>>();

/**
 * Dipanggil PoS setiap kali satu pembayaran settle di payment gateway. Bila penawaran perusahaan itu sudah terdanai,
 * bagian investor dari omzet sejak periode terakhir langsung diposting ke kantong on-chain (gas dari wallet operator).
 * Fail-closed: tanpa INTERNAL_API_TOKEN yang cocok, ditolak.
 */
export async function POST(req: Request) {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "INTERNAL_API_TOKEN belum diisi" }, { status: 503 });
  if (!same(req.headers.get("x-internal-token") ?? "", expected)) return NextResponse.json({ error: "token tidak valid" }, { status: 401 });
  const { companyId } = (await req.json().catch(() => ({}))) as { companyId?: string };
  if (!companyId) return NextResponse.json({ error: "companyId wajib" }, { status: 400 });

  after(async () => {
    const prev = queues.get(companyId) ?? Promise.resolve();
    const run = prev.then(() => postForCompany(companyId)).catch(() => null);
    queues.set(companyId, run);
    await run;
    if (queues.get(companyId) === run) queues.delete(companyId);
  });
  return NextResponse.json({ ok: true, queued: true }, { status: 202 });
}

async function postForCompany(companyId: string) {
  const pf = platformDb();
  const { data: venues } = await pf.from("venues").select("id").eq("pos_company_id", companyId);
  if (!venues?.length) return;
  const { data: series } = await pf.from("series").select("id").in("venue_id", venues.map((v) => v.id)).in("status", ["Funded", "Active"]).not("contract_address", "is", null);
  for (const s of series ?? []) {
    try {
      const msg = await finalizePeriod(await getCtx(s.id));
      console.log(`[kantong] ${s.id}: ${msg}`);
    } catch (e: any) {
      if (!/Belum ada akrual/.test(String(e?.message))) console.error(`[kantong] ${s.id} gagal:`, e?.shortMessage ?? e?.message ?? e);
    }
  }
}
