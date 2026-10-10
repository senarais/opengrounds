"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { createInvite, type StaffRole } from "@/lib/flows/staff";

/** Invite staff. The recipient creates their password through the one-time link. */
export async function addStaff(fd: FormData) {
  const me = await requireArea("staff");
  let q: string;
  try {
    const r = await createInvite(me, { name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""), role: String(fd.get("role")) as StaffRole });
    const base = process.env.PLATFORM_URL || "http://localhost:3000";
    q = `ok=${encodeURIComponent(`Invitation created for ${r.email}. Share the one-time link below.`)}&link=${encodeURIComponent(`${base}/join/${r.token}`)}`;
  } catch (e: any) {
    q = `err=${encodeURIComponent(e?.message ?? String(e))}`;
  }
  revalidatePath("/staff");
  redirect(`/staff?${q}`);
}
