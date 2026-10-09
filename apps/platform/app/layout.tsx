import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Logo, NavLink } from "@venue-rwa/ui";
import "@venue-rwa/ui/styles.css";
import { canOpen, getMe } from "@/lib/auth";
import { PrivyShell } from "@/components/PrivyShell";
import { chain } from "@/lib/chain";
import { signOut } from "./login/actions";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "Open Grounds · Hak manfaat ekonomi venue olahraga",
  description: "Investor kecil memiliki token hak manfaat atas bagian laba bersih venue olahraga yang tanahnya milik sendiri. Demo testnet; Open Grounds belum memiliki izin regulator.",
};

const POS_URL = process.env.POS_URL ?? "http://localhost:3001";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe().catch(() => null);
  return (
    <html lang="id" className={`${sans.variable} ${display.variable}`}>
      <body>
        <header className="topbar">
          <div className="in">
            <Logo name="Open Grounds" sub="Hak manfaat venue olahraga" />
            <nav className="topnav" aria-label="Navigasi utama">
              <NavLink href="/products">Produk</NavLink>
              {(!me || me.role === "investor") && <NavLink href="/portfolio">Portofolio</NavLink>}
              {(!me || me.role === "owner") && <NavLink href="/owner">{me ? "Venue saya" : "Untuk owner"}</NavLink>}
              {canOpen(me, "review") && (<>
                <span className="sep" aria-hidden />
                <NavLink href="/review">Review KYB</NavLink>
              </>)}
              {canOpen(me, "operator") && (<>
                <NavLink href="/operator">Operator</NavLink>
                <NavLink href="/staff">Staf</NavLink>
              </>)}
              {canOpen(me, "verifier") && <NavLink href="/verifier">Verifier</NavLink>}
              {canOpen(me, "spv") && <NavLink href="/spv">Grounds (SPV)</NavLink>}
            </nav>
            <span className="testnet-chip" title="Testnet/simulasi. Tidak ada uang sungguhan. Open Grounds belum memiliki izin atau persetujuan regulator.">Testnet · simulasi</span>
            {me ? (
              <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <span className="small muted" style={{ whiteSpace: "nowrap" }}>{me.name}</span>
                <form action={signOut}><button className="btn sm ghost">Keluar</button></form>
              </div>
            ) : (
              <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                <Link className="btn sm ghost" href="/login">Masuk</Link>
                <Link className="btn sm primary" href="/register">Daftar</Link>
              </div>
            )}
            {me?.role === "owner" && <a className="btn sm dark" href={POS_URL} target="_blank" rel="noreferrer">PoS ↗</a>}
          </div>
        </header>
        <PrivyShell appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID} enabled={me?.role === "investor" || me?.role === "owner"} authId={me?.authId} linked={!!me?.wallet} chainId={chain.id}>{children}</PrivyShell>
        <footer className="footer">
          Open Grounds · proyek hackathon ETHJKT 2026 (track RWA) · Testnet/simulasi: tidak ada uang sungguhan. Open Grounds belum memiliki izin atau persetujuan regulator untuk menawarkan produk ini.
          Imbal hasil dan likuiditas tidak dijamin. Bukan nasihat hukum atau investasi. <a href="/kebijakan-data" style={{ textDecoration: "underline" }}>Kebijakan data</a> · <a href="/cara-kerja" style={{ textDecoration: "underline" }}>Cara kerja & rumus</a>
        </footer>
      </body>
    </html>
  );
}
