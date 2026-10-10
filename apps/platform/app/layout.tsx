import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "@venue-rwa/ui/styles.css";
import { getMe } from "@/lib/auth";
import { PrivyShell } from "@/components/PrivyShell";
import { PlatformShell } from "@/components/PlatformShell";
import "./landing.css";
import "./interior.css";
import { chain } from "@/lib/chain";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: "Open Grounds · Sports venue participation",
  description: "Explore tokenized economic rights in sports venues. Ethereum Sepolia testnet demo; no real money.",
};

const POS_URL = process.env.POS_URL ?? "http://localhost:3001";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe().catch(() => null);
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <PlatformShell me={me ? { name: me.name, role: me.role } : null} posUrl={POS_URL}>
          <PrivyShell appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID} enabled={me?.role === "investor" || me?.role === "owner"} authId={me?.authId} linked={!!me?.wallet} chainId={chain.id}>{children}</PrivyShell>
        </PlatformShell>
      </body>
    </html>
  );
}
