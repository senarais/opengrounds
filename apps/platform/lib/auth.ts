import { redirect } from "next/navigation";
import { platformDb } from "./db";
import { userClient } from "./supabase";

import { AREA_ROLES, type Role, type StaffArea } from "./roles";
export type { Role, StaffArea } from "./roles";
export { AREA_ROLES } from "./roles";
export const canOpen = (m: Me | null, area: StaffArea) => !!m && AREA_ROLES[area].includes(m.role);
export interface Me { authId: string; email: string; userId: string; role: Role; name: string; wallet: string | null }

export async function getMe(): Promise<Me | null> {
  const sb = await userClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: u } = await platformDb().from("users").select("id, role, display_name, wallet").eq("auth_user_id", user.id).maybeSingle();
  if (!u) return null;
  return { authId: user.id, email: user.email ?? "", userId: u.id, role: u.role as Role, name: u.display_name, wallet: u.wallet ?? null };
}

export const isStaff = (m: Me | null) => !!m && (m.role === "operator" || m.role === "reviewer" || m.role === "spv");

/** Wajib login sebagai owner. */
export async function requireOwner(next = "/owner"): Promise<Me> {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (me.role !== "owner") redirect("/?err=" + encodeURIComponent("Halaman ini untuk owner venue"));
  return me;
}

/** Wajib login sebagai investor. */
export async function requireInvestor(next = "/portfolio"): Promise<Me> {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (me.role !== "investor") redirect("/?err=" + encodeURIComponent("Halaman ini untuk investor"));
  return me;
}

/** Wajib login dengan peran yang diizinkan untuk area itu. Peran lain diarahkan pulang dengan penjelasan. */
export async function requireArea(area: StaffArea): Promise<Me> {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/${area}`)}`);
  if (!canOpen(me, area)) redirect("/?err=" + encodeURIComponent("Menu ini tidak tersedia untuk peran Anda"));
  return me;
}

/** Wajib login sebagai staf platform (operator / reviewer / spv). */
export async function requireStaff(next = "/operator"): Promise<Me> {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!isStaff(me)) redirect("/?err=" + encodeURIComponent("Halaman ini untuk staf platform"));
  return me;
}
