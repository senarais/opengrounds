import Link from "next/link";
import { Notice } from "@venue-rwa/ui";
import { SpotlightPanel } from "@/components/SpotlightPanel";
import { registerAccount } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create account · Open Grounds" };

export default async function Register({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="container og-auth-layout">
      <section className="og-auth-story"><span className="og-kicker">Join Open Grounds</span><h1>A good place<br /><em>to begin.</em></h1><p>Set up your account to follow a venue or take part as an investor.</p><span className="og-auth-icon">Ethereum Sepolia · testnet demo</span></section>
      <SpotlightPanel className="og-auth-card">
        <span className="og-kicker">One account, your role</span><h2>Create account</h2>
        {sp.err && <div style={{ marginTop: 16 }}><Notice tone="bad">{sp.err}</Notice></div>}
        <form action={registerAccount} className="stack" style={{ marginTop: 22 }}>
          <label className="field">I am joining as
            <select className="select" name="role" defaultValue="owner"><option value="owner">Venue owner</option><option value="investor">Investor</option></select></label>
          <p className="og-role-hint">Owners review and sign venue applications submitted by Grounds. Investors manage their own portfolio and wallet.</p>
          <label className="field">Full name<input className="input" name="name" autoComplete="name" required /></label>
          <label className="field">Email<input className="input" name="email" type="email" autoComplete="username" required /></label>
          <label className="field">Password · at least 8 characters<input className="input" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
          <button className="btn primary lg" style={{ width: "100%" }}>Create account</button>
        </form>
        <p className="small muted" style={{ marginTop: 18 }}>Already registered? <Link href="/login" className="og-auth-link">Log in</Link></p>
      </SpotlightPanel>
    </div>
  );
}
