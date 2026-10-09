import { NextResponse } from "next/server";
import { addSignature } from "@/lib/attest";
import { canOpen, getMe } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    if (!canOpen(await getMe(), "reviewer")) return NextResponse.json({ error: "Khusus operator atau auditor" }, { status: 403 });
    const b = await req.json();
    const r = await addSignature(String(b.attId), String(b.signer), b.signature);
    return NextResponse.json({ message: r.added ? `Tanda tangan ${r.signer.slice(0, 8)}… tersimpan (${r.count})` : "Sudah pernah menandatangani" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}
