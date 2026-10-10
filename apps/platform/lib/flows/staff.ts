import { platformDb } from "../db";

/** Platform staff roles: Operator, independent Reviewer, and Grounds SPV. */
export type StaffRole = "operator" | "reviewer" | "spv";
export const STAFF_ROLES: StaffRole[] = ["operator", "reviewer", "spv"];

export async function staffCount(): Promise<number> {
  const { count } = await platformDb().from("users").select("*", { count: "exact", head: true }).in("role", STAFF_ROLES);
  return count ?? 0;
}

/** Buat akun staf: Supabase Auth + baris platform.users. Gagal di tengah jalan → akun auth dibatalkan (tidak ada akun setengah jadi). */
export async function createStaffAccount(input: { name: string; email: string; password: string; role: StaffRole }) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new Error("Enter a full name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
  if (input.password.length < 8) throw new Error("Password must contain at least 8 characters.");
  if (!STAFF_ROLES.includes(input.role)) throw new Error("Invalid staff role.");
  const pf = platformDb();
  const { data, error } = await pf.auth.admin.createUser({ email, password: input.password, email_confirm: true });
  if (error || !data.user) throw new Error(/already|registered|exists/i.test(error?.message ?? "") ? "This email is already registered." : error?.message ?? "Could not create the account.");
  const { error: ue } = await pf.from("users").insert({ role: input.role, display_name: name, email, auth_user_id: data.user.id });
  if (ue) {
    await pf.auth.admin.deleteUser(data.user.id);
    throw new Error(ue.message);
  }
  return { email, userId: data.user.id };
}

// ---------------------------------------------------------------- undangan staf
import { createHash, randomBytes } from "node:crypto";
import { audit } from "../flow";

export const INVITE_HOURS = 48;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * Operator mengundang staf. Yang dibuat hanya undangan: penerima memilih kata sandinya sendiri lewat tautan sekali pakai,
 * jadi operator tidak pernah tahu kata sandi staf lain. Mengembalikan token utuh (ditampilkan sekali).
 */
export async function createInvite(actor: { email: string; role: string }, input: { name: string; email: string; role: StaffRole }) {
  if (actor.role !== "operator") throw new Error("Only operators can invite staff.");
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new Error("Enter a full name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
  if (!STAFF_ROLES.includes(input.role)) throw new Error("Invalid staff role.");
  const pf = platformDb();
  const { data: existing } = await pf.from("users").select("id").ilike("email", email).maybeSingle();
  if (existing) throw new Error("This email is already registered.");
  // undangan lama yang belum dipakai untuk email yang sama dibatalkan (hanya satu tautan berlaku)
  await pf.from("staff_invites").update({ used_at: new Date().toISOString() }).ilike("email", email).is("used_at", null);
  const token = randomBytes(32).toString("hex");
  const { error } = await pf.from("staff_invites").insert({ email, display_name: name, role: input.role, token_hash: hashToken(token), invited_by: actor.email, expires_at: new Date(Date.now() + INVITE_HOURS * 3_600_000).toISOString() });
  if (error) throw new Error(error.message);
  await audit(actor.email, "staff.invite", { detail: { email, role: input.role } });
  return { token, email };
}

/** Active invite data for /join. Returns null for invalid, expired, or used links. */
export async function inviteByToken(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await platformDb().from("staff_invites").select("id, email, display_name, role, expires_at, used_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return null;
  return data as { id: string; email: string; display_name: string; role: StaffRole; expires_at: string; used_at: null };
}

/** The invitee sets their own password. Each invitation can be used once. */
export async function acceptInvite(token: string, password: string) {
  const inv = await inviteByToken(token);
  if (!inv) throw new Error("This invitation is invalid, expired, or already used. Ask an operator to send a new one.");
  // klaim atomik: hanya satu pemanggil yang menang
  const { data: claimed } = await platformDb().from("staff_invites").update({ used_at: new Date().toISOString() }).eq("id", inv.id).is("used_at", null).select("id");
  if (!claimed?.length) throw new Error("This invitation has already been used.");
  try {
    await createStaffAccount({ name: inv.display_name, email: inv.email, password, role: inv.role });
  } catch (e) {
    await platformDb().from("staff_invites").update({ used_at: null }).eq("id", inv.id); // gagal (mis. sandi pendek): undangan tetap bisa dicoba lagi
    throw e;
  }
  await audit(inv.email, "staff.join", { detail: { role: inv.role } });
  return { email: inv.email, role: inv.role };
}

export async function pendingInvites() {
  const { data } = await platformDb().from("staff_invites").select("email, role, invited_by, expires_at").is("used_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
  return data ?? [];
}
