"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireArea } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { buildApplication } from "@/lib/flows/application-form";
import { runAutomatedCheck } from "@/lib/flows/kyb";
import { submitOnboarding } from "@/lib/flows/onboarding";
import { friendlyError } from "@/lib/operator";

const fail = (m: string): never => redirect(`/spv/apply?err=${encodeURIComponent(m)}`);

/**
 * Grounds (SPV) mengajukan venue ATAS NAMA owner. Venue tercatat milik akun owner (yang harus sudah terdaftar); owner melihatnya di
 * dashboard-nya dan tetap harus menandatangani akuisisi dengan wallet-nya sendiri, sehingga SPV tidak bisa menyetujui dirinya sendiri.
 */
export async function submitForOwner(fd: FormData) {
  const me = await requireArea("spv");
  let venueId: string;
  try {
    const email = String(fd.get("ownerEmail") ?? "").trim().toLowerCase();
    const { data: owner } = await platformDb().from("users").select("id, role").ilike("email", email).maybeSingle();
    if (!owner || owner.role !== "owner") throw new Error("No owner account exists for this email. Ask the venue owner to register first.");
    const { input, files } = await buildApplication(fd);
    const r = await submitOnboarding(owner.id, input, files, `spv:${me.email}`);
    venueId = r.venueId;
    after(async () => { await runAutomatedCheck(r.caseId).catch((e) => console.error("[kyb]", e?.message ?? e)); });
  } catch (e: any) {
    if (e?.name === "ZodError") fail("Some application details need attention. Review required fields, ownership percentages, and financial data, then try again.");
    return fail(friendlyError(e));
  }
  redirect(`/spv?ok=${encodeURIComponent("Venue application submitted for the owner. Automated checks are running; a reviewer will examine the evidence next.")}`);
}
