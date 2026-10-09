import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/owner/", "/portfolio", "/review", "/verifier", "/spv", "/operator", "/staff"];

/** Menyegarkan sesi Supabase Auth dan mengarahkan ke login untuk halaman owner dan back-office. */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  let user: unknown = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch {
    // Supabase tidak terjangkau sesaat (jaringan). Jangan jatuhkan halaman: pengecekan login yang sebenarnya ada di halaman (requireOwner/requireArea/getMe).
    return res;
  }
  const path = req.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : p + "/"))) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"] };
