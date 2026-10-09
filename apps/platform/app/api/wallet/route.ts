import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { getMe } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { verifyWalletLink } from "@/lib/wallet-link";

/** Hubungkan wallet ke akun: pengguna menandatangani pesan (bukti kepemilikan; tanpa gas). */
export async function POST(req: Request) {
  try {
    const me = await getMe();
    if (!me || me.role !== "investor") return NextResponse.json({ error: "Khusus investor yang sudah login" }, { status: 403 });
    const { address, message, signature } = (await req.json()) as { address: string; message: string; signature: Hex };
    const wallet = await verifyWalletLink(me.authId, address, message, signature);
    const { error } = await platformDb().from("users").update({ wallet }).eq("id", me.userId);
    if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? "Wallet itu sudah terhubung ke akun lain" : error.message }, { status: 400 });
    return NextResponse.json({ message: `Wallet ${wallet.slice(0, 8)}… terhubung` });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}
