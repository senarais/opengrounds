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

const roleLinks: Record<Role, { href: string; label: string }[]> = {
  owner: [{ href: "/owner", label: "My venues" }, { href: "/owner/apply", label: "Submit venue" }, { href: "/products", label: "Explore venues" }],
  investor: [{ href: "/portfolio", label: "Portfolio" }, { href: "/products", label: "Explore venues" }],
  operator: [{ href: "/operator", label: "Operations" }, { href: "/review", label: "KYB review" }, { href: "/staff", label: "Team" }],
  reviewer: [{ href: "/review", label: "KYB review" }, { href: "/verifier", label: "Verification" }],
  spv: [{ href: "/spv", label: "Acquisition & treasury" }],
};

function Brand() {
  return <Link className="og-brand" href="/" aria-label="Open Grounds home"><Image src="/og-logo.png" width={36} height={40} alt="" /><span>open<span>grounds</span></span></Link>;
}

export function PlatformShell({ me, posUrl, children }: { me: { name: string; role: Role } | null; posUrl: string; children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const headerSentinel = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const sentinel = headerSentinel.current;
    if (pathname !== "/" || !sentinel) return;
    setScrolled(window.scrollY > 16);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setScrolled(entry.intersectionRatio < 1);
    }, { threshold: 1 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [pathname]);
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
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    window.addEventListener("keydown", close);
    return () => { window.removeEventListener("keydown", close); desktop.removeEventListener("change", closeOnDesktop); };
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [pathname]);

  if (pathname !== "/") {
    const links = me ? roleLinks[me.role] : [{ href: "/products", label: "Explore venues" }, { href: "/owner", label: "For owners" }, { href: "/cara-kerja", label: "How it works" }];
    const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
    return <div className="og-interior">
      <a className="og-skip-link" href="#main-content">Skip to content</a>
      <div className="og-demo-strip"><span>ETHJKT 2026 · Ethereum Sepolia</span><span>Testnet demo · no real money</span></div>
      <header className="og-app-header">
        <div className="og-app-header-inner"><Brand />
          <nav className="og-app-nav" aria-label="Main navigation">{links.map((item) => <Link key={item.href} href={item.href} aria-current={current(item.href) ? "page" : undefined}>{item.label}</Link>)}</nav>
          <div className="og-app-actions">
            <span className="og-env-badge"><i aria-hidden="true" />Sepolia · Sandbox</span>
            {me ? <><span className="og-account-name">{me.name}</span><form action={signOut}><button className="og-app-logout">Log out</button></form>{me.role === "owner" && <a className="og-app-pos" href={posUrl} target="_blank" rel="noreferrer">PoS <ArrowUpRight size={15} aria-hidden="true" /></a>}</> : <><Link href="/login">Log in</Link><Link className="og-app-create" href="/register">Create account <ArrowUpRight size={16} aria-hidden="true" /></Link></>}
          </div>
          <button ref={menuButton} className="og-app-menu-button" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="og-app-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}</button>
        </div>
        <nav id="og-app-mobile-nav" className="og-app-mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen}>
          {links.map((item) => <Link key={item.href} href={item.href} aria-current={current(item.href) ? "page" : undefined}>{item.label}<ArrowUpRight size={16} aria-hidden="true" /></Link>)}
          <span className="og-app-mobile-account">{me ? me.name : "Ethereum Sepolia · Sandbox"}</span>
          {me ? <form action={signOut}><button className="og-app-mobile-logout">Log out</button></form> : <><Link href="/login">Log in</Link><Link href="/register">Create account <ArrowUpRight size={16} aria-hidden="true" /></Link></>}
        </nav>
      </header>
      <main id="main-content" className="og-interior-main">{children}</main>
      <footer className="og-interior-footer"><div><Brand /><p>Open Grounds · ETHJKT 2026 · Ethereum Sepolia testnet</p><p>Sandbox only. No real money. No guaranteed returns or liquidity. Open Grounds is not licensed to offer these products.</p><nav aria-label="Footer navigation"><Link href="/cara-kerja">Model & formula</Link><Link href="/kebijakan-data">Data policy</Link></nav></div></footer>
    </div>;
  }
  const destination = me ? destinations[me.role] : null;

  return (
    <div className="og-site" lang="en">
      <a className="og-skip-link" href="#main-content">Skip to content</a>
      <span ref={headerSentinel} className="og-header-sentinel" aria-hidden="true" />
      <div className="og-demo-strip"><span>ETHJKT 2026 · Ethereum Sepolia</span><span>Testnet demo. No real money.</span></div>
      <header className="og-header" data-scrolled={scrolled || undefined} data-open={menuOpen || undefined}>
        <div className="og-wrap og-header-inner">
          <Brand />
          <nav className="og-desktop-nav" aria-label="Main navigation"><Link href="/products">Explore venues</Link><a href="#how-it-works">How it works</a><a href="#for-owners">For venue owners</a></nav>
          <div className="og-header-actions">{me && destination ? <><Link className="og-header-login" href={destination.href}>{destination.label}</Link><form action={signOut}><button className="og-button og-button-small og-button-outline">Log out</button></form></> : <><Link className="og-header-login" href="/login">Log in</Link><Link className="og-button og-button-small og-button-dark" href="/register">Get started <ArrowUpRight size={17} aria-hidden /></Link></>}</div>
          <button ref={menuButton} className="og-menu-button" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="og-mobile-nav" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={24} aria-hidden /> : <Menu size={24} aria-hidden />}</button>
        </div>
        <nav id="og-mobile-nav" className="og-mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen} onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) setMenuOpen(false); }}><Link href="/products">Explore venues <ArrowUpRight size={18} aria-hidden /></Link><a href="#how-it-works">How it works</a><a href="#for-owners">For venue owners</a>{destination ? <><Link href={destination.href}>{destination.label}</Link><form action={signOut}><button>Log out</button></form></> : <><Link href="/login">Log in</Link><Link href="/register">Get started <ArrowUpRight size={18} aria-hidden /></Link></>}</nav>
      </header>
      {children}
      <footer className="og-footer"><div className="og-wrap">
        <div className="og-footer-top"><Brand /><p>Good grounds.<br />Shared possibilities.</p><nav aria-label="Footer navigation"><Link href="/products">Explore venues</Link><Link href="/owner">For venue owners</Link><Link href="/cara-kerja">The model & formulas</Link><Link href="/kebijakan-data">Data policy</Link></nav></div>
        <div className="og-disclosures"><h2>A demo. An opportunity to understand.</h2><p>Open Grounds is an ETHJKT 2026 RWA hackathon project on Ethereum Sepolia. All money flows on this demo are simulated. Open Grounds is not licensed or approved by a regulator to offer these products. Returns and liquidity are not guaranteed. Tokens are not backed or guaranteed by venue assets. This is not legal or investment advice.</p></div>
        <div className="og-footer-bottom"><span>© 2026 Open Grounds</span><details className="og-photo-credits"><summary>Photography credits</summary><p>Illustrative images from <a href="https://unsplash.com" target="_blank" rel="noreferrer">Unsplash</a>, <a href="https://ranagrounds.id/" target="_blank" rel="noreferrer">Rana Grounds</a>, and <a href="https://alsagerpadel.co.uk/" target="_blank" rel="noreferrer">Alsager Padel</a>. These photographs do not represent listed venues or a partnership. Original source links are documented in the repository.</p></details><span>Built around the places we play.</span></div>
      </div></footer>
    </div>
  );
}
