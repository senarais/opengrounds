"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { signOut } from "@/app/login/actions";
import type { Role } from "@/lib/roles";

const destinations: Record<Role, { href: string; label: string }> = {
  investor: { href: "/portfolio", label: "My portfolio" },
  owner: { href: "/owner", label: "My venues" },
  operator: { href: "/operator", label: "Operator dashboard" },
  reviewer: { href: "/review", label: "Review dashboard" },
  spv: { href: "/spv", label: "Grounds dashboard" },
};

export function PlatformShell({ me, header, footer, children }: { me: { role: Role } | null; header: ReactNode; footer: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pathname !== "/" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("og-entered");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12 });
    document.querySelectorAll(".og-intro, .og-gallery-heading, .og-section-heading, .og-owner-copy, .og-faq-list").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  if (pathname !== "/") return <>{header}{children}{footer}</>;
  const destination = me ? destinations[me.role] : null;

  return (
    <div className="og-site" lang="en">
      <a className="og-skip-link" href="#main-content">Skip to content</a>
      <div className="og-demo-strip"><span>ETHJKT 2026 · Ethereum Sepolia</span><span>Testnet demo. No real money.</span></div>
      <header className="og-header">
        <div className="og-wrap og-header-inner">
          <Link className="og-brand" href="/" aria-label="Open Grounds home"><Image src="/og-logo.png" width={38} height={42} alt="" /><span>open<span>grounds</span></span></Link>
          <nav className="og-desktop-nav" aria-label="Main navigation"><Link href="/products">Explore venues</Link><a href="#how-it-works">How it works</a><a href="#for-owners">For venue owners</a></nav>
          <div className="og-header-actions">{me && destination ? <><Link className="og-header-login" href={destination.href}>{destination.label}</Link><form action={signOut}><button className="og-button og-button-small og-button-outline">Log out</button></form></> : <><Link className="og-header-login" href="/login">Log in</Link><Link className="og-button og-button-small og-button-dark" href="/register">Get started <ArrowUpRight size={17} aria-hidden /></Link></>}</div>
          <button ref={menuButton} className="og-menu-button" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="og-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={24} aria-hidden /> : <Menu size={24} aria-hidden />}</button>
        </div>
        <nav id="og-mobile-nav" className="og-mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen} onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) setMenuOpen(false); }}><Link href="/products">Explore venues <ArrowUpRight size={18} aria-hidden /></Link><a href="#how-it-works">How it works</a><a href="#for-owners">For venue owners</a>{destination ? <><Link href={destination.href}>{destination.label}</Link><form action={signOut}><button>Log out</button></form></> : <><Link href="/login">Log in</Link><Link href="/register">Get started <ArrowUpRight size={18} aria-hidden /></Link></>}</nav>
      </header>
      {children}
      <footer className="og-footer"><div className="og-wrap">
        <div className="og-footer-top"><Link className="og-brand" href="/" aria-label="Open Grounds home"><Image src="/og-logo.png" width={42} height={46} alt="" /><span>open<span>grounds</span></span></Link><p>Good grounds.<br />Shared possibilities.</p><nav aria-label="Footer navigation"><Link href="/products">Explore venues</Link><Link href="/owner">For venue owners</Link><Link href="/cara-kerja">The model & formulas</Link><Link href="/kebijakan-data">Data policy</Link></nav></div>
        <div className="og-disclosures"><h2>A demo. An opportunity to understand.</h2><p>Open Grounds is an ETHJKT 2026 RWA hackathon project on Ethereum Sepolia. All money flows on this demo are simulated. Open Grounds is not licensed or approved by a regulator to offer these products. Returns and liquidity are not guaranteed. Tokens are not backed or guaranteed by venue assets. This is not legal or investment advice.</p></div>
        <div className="og-footer-bottom"><span>© 2026 Open Grounds</span><details className="og-photo-credits"><summary>Photography credits</summary><p>Illustrative images from <a href="https://unsplash.com" target="_blank" rel="noreferrer">Unsplash</a>, <a href="https://ranagrounds.id/" target="_blank" rel="noreferrer">Rana Grounds</a>, and <a href="https://alsagerpadel.co.uk/" target="_blank" rel="noreferrer">Alsager Padel</a>. These photographs do not represent listed venues or a partnership. Original source links are documented in the repository.</p></details><span>Built around the places we play.</span></div>
      </div></footer>
    </div>
  );
}
