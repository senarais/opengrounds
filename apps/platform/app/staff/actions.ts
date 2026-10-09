"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { createInvite, type StaffRole } from "@/lib/flows/staff";

/** Undang staf. Hanya operator. Operator mendapat tautan sekali pakai; kata sandi dibuat penerima sendiri. */
export async function addStaff(fd: FormData) {
  const me = await requireArea("staff");
  let q: string;
  try {
    const r = await createInvite(me, { name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""), role: String(fd.get("role")) as StaffRole });
    const base = process.env.PLATFORM_URL || "http://localhost:3000";
    q = `ok=${encodeURIComponent(`Undangan untuk ${r.email} dibuat. Kirim tautan di bawah lewat jalur terpisah; tautan hanya tampil sekali.`)}&link=${encodeURIComponent(`${base}/join/${r.token}`)}`;
  } catch (e: any) {
    q = `err=${encodeURIComponent(e?.message ?? String(e))}`;
  }
  revalidatePath("/staff");
  redirect(`/staff?${q}`);
}
