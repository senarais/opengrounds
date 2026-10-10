"use server";
import { redirect } from "next/navigation";
import { createStaffAccount, staffCount } from "@/lib/flows/staff";
import { userClient } from "@/lib/supabase";

/** Create the first operator account. This page closes once a staff account exists. */
export async function createFirstStaff(fd: FormData) {
  const fail = (m: string): never => redirect(`/setup?err=${encodeURIComponent(m)}`);
  if ((await staffCount()) > 0) redirect("/login");
  const required = process.env.SETUP_TOKEN;
  if (required && String(fd.get("token") ?? "") !== required) fail("Setup token is incorrect.");
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) fail("Passwords do not match.");
  try {
    await createStaffAccount({ name: String(fd.get("name") ?? ""), email, password, role: "operator" });
  } catch (e: any) {
    return fail(e?.message ?? "Could not create the account.");
  }
  const sb = await userClient();
  await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  redirect("/operator");
}
