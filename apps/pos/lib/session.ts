import { redirect } from "next/navigation";
import { userClient } from "./supabase";

export interface Session {
  userId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "cashier";
  company: { id: string; name: string; slug: string; synthetic: boolean };
  /** Klien pengguna (RLS) untuk membaca. */
  db: Awaited<ReturnType<typeof userClient>>;
}

/** null = belum login; "no-workspace" = login tetapi belum menjadi anggota company mana pun. */
export async function getSession(): Promise<Session | "no-workspace" | null> {
  const db = await userClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: m } = await db.from("members").select("role, display_name, companies(id, name, slug, synthetic, status)").eq("user_id", user.id).limit(1).maybeSingle();
  const c: any = m?.companies;
  if (!m || !c || c.status === "suspended") return "no-workspace"; // workspace ditangguhkan = tidak bisa masuk
  return { userId: user.id, email: user.email ?? "", name: m.display_name ?? user.email ?? "", role: m.role as Session["role"], company: c, db };
}

/** Wajib login dan terdaftar sebagai anggota company. Akun tanpa workspace diarahkan ke /no-workspace (bukan ke /login: menghindari loop). */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s === "no-workspace") redirect("/no-workspace");
  return s;
}

export const canManage = (s: Session) => s.role === "owner" || s.role === "admin";
