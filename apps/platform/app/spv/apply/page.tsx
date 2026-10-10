import { redirect } from "next/navigation";
import { requireArea } from "@/lib/auth";

/** Legacy staff URL: venue submission now belongs to the owner portal. */
export default async function SpvApply() {
  await requireArea("spv");
  redirect("/spv");
}
