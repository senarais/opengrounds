"use server";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/auth";
import { userClient } from "@/lib/supabase";

/** Halaman awal setelah login menurut peran: auditor langsung ke review, operator ke konsol operator. */
const homeFor = (role: string) => (role === "owner" ? "/owner" : role === "investor" ? "/portfolio" : role === "auditor" ? "/reviewer" : "/operator");

/** Hanya path internal. Tolak "//host", "/\\host" (browser menganggap backslash = slash), dan karakter kontrol; lalu pastikan tetap satu origin. */
const safeNext = (n: string) => {
  if (!n.startsWith("/") || n.startsWith("//") || /[\\\u0000-\u001f]/.test(n)) return "/";
  try {
    const u = new URL(n, "http://internal.invalid");
    return u.origin === "http://internal.invalid" ? `${u.pathname}${u.search}${u.hash}` : "/";
  } catch { return "/"; }
};

export async function signIn(fd: FormData) {
  const next = safeNext(String(fd.get("next") || "/"));
  const sb = await userClient();
  const { error } = await sb.auth.signInWithPassword({ email: String(fd.get("email")).trim(), password: String(fd.get("password")) });
  if (error) redirect(`/login?err=${encodeURIComponent("Email atau kata sandi salah")}&next=${encodeURIComponent(next)}`);
  const me = await getMe();
  if (!me) {
    await sb.auth.signOut();
    redirect(`/login?err=${encodeURIComponent("Akun ini belum terdaftar di platform. Daftar sebagai owner dulu.")}`);
  }
  redirect(next === "/" ? homeFor(me!.role) : next);
}

export async function signOut() {
  const sb = await userClient();
  await sb.auth.signOut();
  redirect("/");
}
