import { NextResponse } from "next/server";
import { getMe } from "@/lib/auth";
import { userClient } from "@/lib/supabase";

/**
 * Access token Supabase milik pengguna yang sedang login, untuk ditukar Privy (custom auth) menjadi wallet milik pengguna itu.
 * Hanya investor; token itu sendiri sudah dimiliki browser (cookie sesi), dan Privy memverifikasi tanda tangannya lewat JWKS Supabase.
 */
export async function GET() {
  const me = await getMe().catch(() => null);
  if (!me || me.role !== "investor") return NextResponse.json({ token: null }, { status: 401, headers: { "cache-control": "no-store" } });
  const { data } = await (await userClient()).auth.getSession();
  return NextResponse.json({ token: data.session?.access_token ?? null }, { headers: { "cache-control": "no-store" } });
}
