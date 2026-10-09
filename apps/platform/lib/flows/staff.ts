import { platformDb } from "../db";

/** Tiga jenis staf: operator (tim internal), reviewer (pihak luar independen), spv (Grounds, pembeli hak; akunnya dibuat operator lewat undangan). */
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
  if (name.length < 2) throw new Error("Nama wajib diisi");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email tidak valid");
  if (input.password.length < 8) throw new Error("Kata sandi minimal 8 karakter");
  if (!STAFF_ROLES.includes(input.role)) throw new Error("Peran tidak valid");
  const pf = platformDb();
  const { data, error } = await pf.auth.admin.createUser({ email, password: input.password, email_confirm: true });
  if (error || !data.user) throw new Error(/already|registered|exists/i.test(error?.message ?? "") ? "Email itu sudah terdaftar" : error?.message ?? "Gagal membuat akun");
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
  if (actor.role !== "operator") throw new Error("Hanya operator yang boleh mengundang staf");
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new Error("Nama wajib diisi");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Email tidak valid");
  if (!STAFF_ROLES.includes(input.role)) throw new Error("Peran tidak valid");
  const pf = platformDb();
  const { data: existing } = await pf.from("users").select("id").ilike("email", email).maybeSingle();
  if (existing) throw new Error("Email itu sudah terdaftar");
  // undangan lama yang belum dipakai untuk email yang sama dibatalkan (hanya satu tautan berlaku)
  await pf.from("staff_invites").update({ used_at: new Date().toISOString() }).ilike("email", email).is("used_at", null);
  const token = randomBytes(32).toString("hex");
  const { error } = await pf.from("staff_invites").insert({ email, display_name: name, role: input.role, token_hash: hashToken(token), invited_by: actor.email, expires_at: new Date(Date.now() + INVITE_HOURS * 3_600_000).toISOString() });
  if (error) throw new Error(error.message);
  await audit(actor.email, "staff.invite", { detail: { email, role: input.role } });
  return { token, email };
}

/** Data undangan yang masih berlaku (untuk halaman /join). null bila token salah, kedaluwarsa, atau sudah dipakai. */
export async function inviteByToken(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await platformDb().from("staff_invites").select("id, email, display_name, role, expires_at, used_at").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return null;
  return data as { id: string; email: string; display_name: string; role: StaffRole; expires_at: string; used_at: null };
}

/** Penerima menerima undangan dan menetapkan kata sandinya sendiri. Undangan hanya bisa dipakai sekali. */
export async function acceptInvite(token: string, password: string) {
  const inv = await inviteByToken(token);
  if (!inv) throw new Error("Tautan undangan tidak valid, sudah dipakai, atau kedaluwarsa. Minta operator mengundang ulang.");
  // klaim atomik: hanya satu pemanggil yang menang
  const { data: claimed } = await platformDb().from("staff_invites").update({ used_at: new Date().toISOString() }).eq("id", inv.id).is("used_at", null).select("id");
  if (!claimed?.length) throw new Error("Undangan sudah dipakai");
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
