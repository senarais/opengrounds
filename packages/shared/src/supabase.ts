import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AppSchema = "pos" | "platform";
// skema kustom => generik skema longgar (tanpa tipe database yang di-generate)
export type AppClient = SupabaseClient<any, any, any>;

/** Browser/anon: hanya data publik (dibatasi RLS). */
export function anonClient(schema: AppSchema, url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_ANON_KEY!): AppClient {
  return createClient(url, key, { db: { schema }, auth: { persistSession: false } });
}

/** SERVER ONLY: service_role melewati RLS. Jangan diimpor dari kode browser. */
export function serviceClient(schema: AppSchema, url = process.env.SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!): AppClient {
  if (typeof window !== "undefined") throw new Error("serviceClient tidak boleh dipakai di browser");
  return createClient(url, key, { db: { schema }, auth: { persistSession: false, autoRefreshToken: false } });
}
