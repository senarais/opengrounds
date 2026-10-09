"use server";
import { requireArea } from "@/lib/auth";
import { guarded } from "@/lib/flow";
import { resolvePeriodDispute } from "@/lib/flows/periods";

export async function resolveAction(fd: FormData) {
  const me = await requireArea("verifier");
  await guarded("/verifier", () => resolvePeriodDispute(String(fd.get("id")), me.email, String(fd.get("resolution") ?? "")));
}
