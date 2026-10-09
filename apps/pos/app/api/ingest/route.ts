import { NextResponse } from "next/server";
import { ImportRow, MAX_IMPORT_ROWS } from "@venue-rwa/shared";
import { companyForKey, ingestTransactions } from "@/lib/connector";
import { admin } from "@/lib/supabase";

/** Ingest dari sistem eksternal: Authorization: Bearer <kunci API perusahaan>; body { transactions: [...] }. */
export async function POST(req: Request) {
  const db = admin();
  const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const companyId = await companyForKey(db, key);
  if (!companyId) return NextResponse.json({ error: "kunci API tidak valid" }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "body bukan JSON" }, { status: 400 }); }
  const list = body?.transactions;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_IMPORT_ROWS) return NextResponse.json({ error: `transactions wajib berisi 1–${MAX_IMPORT_ROWS} item` }, { status: 400 });
  const rows: ImportRow[] = [];
  const errors: { index: number; message: string }[] = [];
  list.forEach((t, i) => { const p = ImportRow.safeParse(t); if (p.success) rows.push(p.data); else errors.push({ index: i, message: p.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") }); });
  if (errors.length) return NextResponse.json({ error: "validasi gagal", errors }, { status: 422 });
  const r = await ingestTransactions(db, companyId, rows, "api");
  return NextResponse.json(r, { status: r.errors.length && !r.imported ? 422 : 200 });
}
