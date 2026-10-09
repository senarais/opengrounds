import { NextResponse } from "next/server";
import { getAddress, type Hex } from "viem";
import { getMe } from "@/lib/auth";
import { requestRedeemSigned } from "@/lib/flows/investor";
import { getCtx } from "@/lib/flow";
import { friendlyError } from "@/lib/operator";

/** Meneruskan permintaan redeem yang sudah ditandatangani investor (EIP-712). Kontrak memverifikasi tanda tangan dan nonce. */
export async function POST(req: Request) {
  try {
    const me = await getMe();
    if (!me || me.role !== "investor" || !me.wallet) return NextResponse.json({ error: "Hubungkan wallet di halaman Portofolio dulu" }, { status: 403 });
    const b = await req.json();
    const units = BigInt(b.units);
    if (units < 1n) return NextResponse.json({ error: "Jumlah token minimal 1" }, { status: 400 });
    const ctx = await getCtx(String(b.seriesId));
    const message = await requestRedeemSigned(ctx, getAddress(me.wallet), units, BigInt(b.deadline), b.signature as Hex);
    return NextResponse.json({ message });
  } catch (e: any) {
    return NextResponse.json({ error: friendlyError(e) }, { status: 400 });
  }
}
