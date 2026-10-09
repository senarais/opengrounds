import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Klien atas nama pengguna yang login (hanya untuk autentikasi; data platform lewat service_role di server). */
export async function userClient() {
  const store = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* Server Component: abaikan */ }
      },
    },
  });
}
