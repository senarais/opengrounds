"use server";
import { redirect } from "next/navigation";
import { acceptInvite } from "@/lib/flows/staff";

export async function join(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const pw = String(fd.get("password") ?? "");
  let err: string | null = null;
  try {
    if (pw !== String(fd.get("confirm") ?? "")) throw new Error("Kata sandi dan pengulangannya tidak sama");
    await acceptInvite(token, pw);
  } catch (e: any) {
    err = e?.message ?? String(e);
  }
  if (err) redirect(`/join/${token}?err=${encodeURIComponent(err)}`);
  redirect(`/login?ok=${encodeURIComponent("Akun staf aktif. Silakan masuk dengan kata sandi yang baru Anda buat.")}`);
}
