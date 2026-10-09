import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serviceClient } from "@venue-rwa/shared";

/** Klien atas nama pengguna yang login (JWT di cookie). Dibatasi RLS: hanya data company miliknya. */
export async function userClient() {
  const store = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* dipanggil dari Server Component: abaikan */ }
      },
    },
    db: { schema: "pos" },
  });
}

/** SERVER ONLY. Penulisan dan operasi tanpa sesi (webhook, halaman bayar publik). company_id SELALU diturunkan dari sesi/data, bukan input form. */
export const admin = () => serviceClient("pos");
