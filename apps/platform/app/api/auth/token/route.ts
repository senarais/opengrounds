import { NextResponse } from "next/server";
import { platformDb } from "@/lib/db";
import { userClient } from "@/lib/supabase";

const out = (token: string | null, status = 200) => NextResponse.json({ token, retry: status === 503 }, { status, headers: { "cache-control": "no-store" } });

/**
 * Access token Supabase milik investor yang sedang login, untuk ditukar Privy (custom auth) menjadi wallet milik pengguna itu.
 * 401 = memang bukan investor yang login; 503 = Supabase tidak terjangkau sesaat (klien mencoba ulang).
 */
export async function GET() {
  try {
    const sb = await userClient();
    const { data, error } = await sb.auth.getUser();
    if (error) {
      const transient = error.name === "AuthRetryableFetchError" || !error.status || error.status >= 500;
      return out(null, transient ? 503 : 401);
    }
    if (!data.user) return out(null, 401);
    const { data: row, error: e2 } = await platformDb().from("users").select("role").eq("auth_user_id", data.user.id).maybeSingle();
    if (e2) return out(null, 503);
    if (row?.role !== "investor") return out(null, 401);
    const { data: s } = await sb.auth.getSession();
    return s.session?.access_token ? out(s.session.access_token) : out(null, 503);
  } catch {
    return out(null, 503);
  }
}
