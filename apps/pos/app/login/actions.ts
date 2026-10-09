"use server";
import { redirect } from "next/navigation";
import { userClient } from "@/lib/supabase";

export async function signIn(fd: FormData) {
  const db = await userClient();
  const { error } = await db.auth.signInWithPassword({ email: String(fd.get("email")).trim(), password: String(fd.get("password")) });
  if (error) redirect(`/login?err=${encodeURIComponent("Email atau kata sandi salah")}`);
  redirect("/");
}

export async function signOut() {
  const db = await userClient();
  await db.auth.signOut();
  redirect("/login");
}
