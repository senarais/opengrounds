import { NextResponse } from "next/server";
import type { Hex } from "viem";
import { getMe } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { verifyWalletLink } from "@/lib/wallet-link";

/** Link a wallet to an account with a signed ownership message. No gas is required. */
export async function POST(req: Request) {
  try {
    const me = await getMe();
    if (!me || (me.role !== "investor" && me.role !== "owner")) return NextResponse.json({ error: "Sign in with an owner or investor account." }, { status: 403 });
    const { address, message, signature } = (await req.json()) as { address: string; message: string; signature: Hex };
    const wallet = await verifyWalletLink(me.authId, address, message, signature);
    const { error } = await platformDb().from("users").update({ wallet }).eq("id", me.userId);
    if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? "This wallet is linked to another account." : error.message }, { status: 400 });
    return NextResponse.json({ message: `Wallet ${wallet.slice(0, 8)}… linked` });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}
