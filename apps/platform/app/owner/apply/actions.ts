"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireOwner } from "@/lib/auth";
import { buildApplication } from "@/lib/flows/application-form";
import { runAutomatedCheck } from "@/lib/flows/kyb";
import { submitOnboarding } from "@/lib/flows/onboarding";
import { friendlyError } from "@/lib/operator";

const fail = (m: string): never => redirect(`/owner/apply?err=${encodeURIComponent(m)}`);

/** Owners submit their own venue; ownership comes exclusively from the authenticated session. */
export async function submitVenue(fd: FormData) {
  const me = await requireOwner("/owner/apply");
  let venueId: string;
  try {
    const { input, files } = await buildApplication(fd);
    const r = await submitOnboarding(me.userId, input, files, `owner:${me.email}`);
    venueId = r.venueId;
    after(async () => { await runAutomatedCheck(r.caseId).catch((e) => console.error("[kyb]", e?.message ?? e)); });
  } catch (e: any) {
    if (e?.name === "ZodError") fail("Some application details need attention. Review required fields, ownership percentages, and financial data, then try again.");
    return fail(friendlyError(e));
  }
  redirect(`/owner/${venueId}?ok=${encodeURIComponent("Your venue application has been submitted. Automated checks are running; a reviewer will examine the evidence next.")}`);
}
