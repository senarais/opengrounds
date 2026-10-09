import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { canOpen, getMe } from "@/lib/auth";
import { getCtx } from "@/lib/flow";
import { decideReview, prepareApproval } from "@/lib/flows/review";

const reviewer = async () => {
  const me = await getMe();
  return me && canOpen(me, "reviewer") ? me : null;
};

/** Data yang harus ditandatangani saat menyetujui (attestation EIP-712 terikat ke alamat kontrak yang akan dideploy). */
export async function GET(req: Request) {
  try {
    const me = await reviewer();
    if (!me) return NextResponse.json({ error: "Khusus operator atau auditor" }, { status: 403 });
    const ctx = await getCtx(new URL(req.url).searchParams.get("seriesId"));
    const p = await prepareApproval(ctx, me);
    return NextResponse.json({ typed: p.typed, allowed: p.allowed, notice: p.notice });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}

/**
 * Suara review. Setuju = tanda tangan attestation (EIP-712, sekaligus tanda tangan attestation); tolak = tanda tangan pesan alasan.
 * Bila kedua pihak setuju, server men-deploy kontrak lalu mengirim attestation ke Sepolia.
 */
export async function POST(req: Request) {
  try {
    const me = await reviewer();
    if (!me) return NextResponse.json({ error: "Khusus operator atau auditor" }, { status: 403 });
    const b = await req.json();
    const ctx = await getCtx(String(b.seriesId));
    const proof = b.decision === "approved" ? ({ kind: "attestation", signature: b.signature as Hex } as const) : ({ kind: "message", at: String(b.at), signature: b.signature as Hex } as const);
    const message = await decideReview(ctx, me, b.decision === "approved" ? "approved" : "rejected", String(b.note ?? ""), proof);
    return NextResponse.json({ message });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}
