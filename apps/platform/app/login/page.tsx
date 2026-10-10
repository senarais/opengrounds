import Link from "next/link";
import { Notice } from "@venue-rwa/ui";
import { KeyRound } from "lucide-react";
import { SpotlightPanel } from "@/components/SpotlightPanel";
import { signIn } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in · Open Grounds" };

export default async function Login({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="container og-auth-layout">
      <section className="og-auth-story"><span className="og-kicker">Welcome back</span><h1>Good grounds.<br /><em>Clear choices.</em></h1><p>Sign in to follow your venue, review, or investor activity.</p><span className="og-auth-icon"><KeyRound size={20} aria-hidden="true" /> Ethereum Sepolia · testnet</span></section>
      <SpotlightPanel className="og-auth-card">
        <span className="og-kicker">Open Grounds account</span><h2>Log in</h2>
        {sp.ok && <div style={{ marginTop: 16 }}><Notice tone="ok">{sp.ok}</Notice></div>}
        {sp.err && <div style={{ marginTop: 16 }}><Notice tone="bad">{sp.err}</Notice></div>}
        <form action={signIn} className="stack" style={{ marginTop: 22 }}>
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <label className="field">Email<input className="input" name="email" type="email" autoComplete="username" required /></label>
          <label className="field">Password<input className="input" name="password" type="password" autoComplete="current-password" required /></label>
          <button className="btn primary lg" style={{ width: "100%" }}>Log in</button>
        </form>
        <p className="small muted" style={{ marginTop: 18 }}>New to Open Grounds? <Link href="/register" className="og-auth-link">Create an account</Link></p>
      </SpotlightPanel>
    </div>
  );
}
