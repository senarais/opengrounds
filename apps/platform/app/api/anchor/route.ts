import { NextResponse } from "next/server";
import { anchorDay } from "@/lib/anchor";
import { canOpen, getMe } from "@/lib/auth";
import { chainRef, getCtx, needCompany } from "@/lib/flow";

export async function POST(req: Request) {
  try {
    if (!canOpen(await getMe(), "auditor")) return NextResponse.json({ error: "Khusus auditor" }, { status: 403 });
    const b = await req.json();
    const ctx = await getCtx(String(b.seriesId));
    const r = await anchorDay({ series: chainRef(ctx).series, companyId: needCompany(ctx) }, String(b.date), String(b.signer), b.signature);
    return NextResponse.json({ message: `Root ${b.date} (${r.count} entri) ter-anchor on-chain` });
  } catch (e: any) {
    return NextResponse.json({ error: e?.shortMessage ?? e?.message ?? String(e) }, { status: 400 });
  }
}
