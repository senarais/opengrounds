"use server";
import { redirect } from "next/navigation";
import { platformDb } from "@/lib/db";
import { userClient } from "@/lib/supabase";
import { serviceClient } from "@venue-rwa/shared";

/** Daftar sebagai owner venue atau investor: akun Supabase Auth + baris platform.users. Akun owner yang sama dipakai login ke PoS setelah disetujui. */
export async function registerAccount(fd: FormData) {
  const role = String(fd.get("role")) === "investor" ? "investor" : "owner";
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const fail = (m: string): never => redirect(`/register?err=${encodeURIComponent(m)}`);
  if (name.length < 2) fail("Nama wajib diisi");
  if (!/^\S+@\S+\.\S+$/.test(email)) fail("Email tidak valid");
  if (password.length < 8) fail("Kata sandi minimal 8 karakter");

  const admin = serviceClient("platform");
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) return fail(/already|registered|exists/i.test(error?.message ?? "") ? "Email sudah terdaftar. Silakan masuk." : error?.message ?? "Gagal membuat akun");
  const { error: ue } = await platformDb().from("users").insert({ role, display_name: name, email, auth_user_id: data.user.id });
  if (ue) {
    await admin.auth.admin.deleteUser(data.user.id);
    fail(ue.message);
  }
  const sb = await userClient();
  await sb.auth.signInWithPassword({ email, password });
  redirect(role === "investor" ? "/portfolio" : "/owner");
}
