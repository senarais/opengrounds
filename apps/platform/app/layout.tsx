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
  title: "OpenGrounds · Bagi hasil omzet venue olahraga",
  description: "Investor kecil ikut membiayai venue olahraga dan menerima bagian dari omzet yang dibuktikan data payment gateway. Demo testnet, bukan produk disetujui OJK.",
};

const POS_URL = process.env.POS_URL ?? "http://localhost:3001";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe().catch(() => null);
  return (
    <html lang="id" className={`${sans.variable} ${display.variable}`}>
      <body>
        <header className="topbar">
          <div className="in">
            <Logo name="OpenGrounds" sub="Bagi hasil omzet venue" />
            <nav className="topnav" aria-label="Navigasi utama">
              <NavLink href="/offering">Penawaran</NavLink>
              {(!me || me.role === "investor") && <NavLink href="/portfolio">Portofolio</NavLink>}
              {(!me || me.role === "owner") && <NavLink href="/owner">Untuk owner</NavLink>}
              {canOpen(me, "operator") && (<>
                <span className="sep" aria-hidden />
                <NavLink href="/operator">Operator</NavLink>
                <NavLink href="/reviewer">Review</NavLink>
                <NavLink href="/verification">Verifikasi</NavLink>
                <NavLink href="/staff">Staf</NavLink>
              </>)}
              {me?.role === "auditor" && (<>
                <span className="sep" aria-hidden />
                <NavLink href="/reviewer">Review</NavLink>
                <NavLink href="/auditor">Auditor</NavLink>
                <NavLink href="/verification">Verifikasi</NavLink>
              </>)}
            </nav>
            <span className="testnet-chip" title="Jaringan uji Sepolia. Rupiah dan kustodian disimulasikan; bukan produk disetujui OJK.">Testnet · simulasi</span>
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
        <PrivyShell appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID} investor={me?.role === "investor"} authId={me?.authId} linked={!!me?.wallet} chainId={chain.id}>{children}</PrivyShell>
        <footer className="footer">
          OpenGrounds · proyek hackathon ETHJKT 2026 (track RWA) · Testnet Sepolia, tanpa uang riil dan tanpa penawaran publik.
          Tidak mengklaim disetujui OJK. Bukan nasihat hukum atau investasi. <a href="/kebijakan-data" style={{ textDecoration: "underline" }}>Kebijakan data</a>
        </footer>
      </body>
    </html>
  );
}
