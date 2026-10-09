"use server";
import { redirect } from "next/navigation";
import { createStaffAccount, staffCount } from "@/lib/flows/staff";
import { userClient } from "@/lib/supabase";

/** Setup pertama kali: membuat staf operator PERTAMA. Setelah ada staf, halaman ini tertutup. Bila SETUP_TOKEN diset di .env, token wajib diisi. */
export async function createFirstStaff(fd: FormData) {
  const fail = (m: string): never => redirect(`/setup?err=${encodeURIComponent(m)}`);
  if ((await staffCount()) > 0) redirect("/login");
  const required = process.env.SETUP_TOKEN;
  if (required && String(fd.get("token") ?? "") !== required) fail("Token setup salah");
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) fail("Konfirmasi kata sandi tidak sama");
  try {
    await createStaffAccount({ name: String(fd.get("name") ?? ""), email, password, role: "operator" });
  } catch (e: any) {
    return fail(e?.message ?? "Gagal");
  }
  const sb = await userClient();
  await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  redirect("/operator");
}
