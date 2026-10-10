import { redirect } from "next/navigation";
import { Notice } from "@venue-rwa/ui";
import { staffCount } from "@/lib/flows/staff";
import { createFirstStaff } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Initial setup · Open Grounds" };

export default async function Setup({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  if ((await staffCount()) > 0) redirect("/login");
  const sp = await searchParams;
  const needToken = !!process.env.SETUP_TOKEN;
  return (
    <div className="container" style={{ maxWidth: 480, paddingTop: 56 }}>
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Initial setup</div>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>Create the first operator</h1>
        <p className="muted small" style={{ marginBottom: 16 }}>This setup closes after the first staff account is created.</p>
        {sp.err && <div style={{ marginBottom: 14 }}><Notice tone="bad">{sp.err}</Notice></div>}
        <form action={createFirstStaff} className="stack">
          <label className="field">Full name<input className="input" name="name" autoComplete="name" required /></label>
          <label className="field">Email<input className="input" name="email" type="email" autoComplete="username" required /></label>
          <label className="field">Password · at least 8 characters<input className="input" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
          <label className="field">Confirm password<input className="input" name="confirm" type="password" minLength={8} autoComplete="new-password" required /></label>
          {needToken && <label className="field">Setup token<input className="input" name="token" type="password" required /></label>}
          <button className="btn primary lg" style={{ width: "100%" }}>Create operator account</button>
        </form>
        {!needToken && <p className="small muted" style={{ marginTop: 14 }}>Tip: set <span className="mono">SETUP_TOKEN</span> before exposing this server.</p>}
      </div>
    </div>
  );
}
