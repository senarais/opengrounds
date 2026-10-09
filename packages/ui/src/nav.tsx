"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Link navigasi yang menandai halaman aktif (aria-current) untuk styling topbar/sidebar. */
export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + "/");
  return <Link href={href} aria-current={active ? "page" : undefined}>{children}</Link>;
}
