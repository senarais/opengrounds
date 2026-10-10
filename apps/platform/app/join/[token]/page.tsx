import { Notice } from "@venue-rwa/ui";
import { inviteByToken } from "@/lib/flows/staff";
import { join } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accept staff invitation · Open Grounds" };

export default async function Join({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const inv = await inviteByToken(token);
  return (
      <div className="container" style={{ maxWidth: 480, paddingTop: 56 }}>
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Staff invitation</div>
        {!inv ? (
          <>
            <h1 style={{ fontSize: 26, marginBottom: 6 }}>Invitation unavailable</h1>
            <p className="muted small">This link is invalid, expired, or already used. Ask an operator to send a new invitation.</p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 26, marginBottom: 6 }}>Welcome, {inv.display_name}</h1>
            <p className="muted small" style={{ marginBottom: 16 }}>You’re joining as <b>{inv.role}</b> with <b>{inv.email}</b>. Create your own password; the inviting operator will never see it.</p>
            {sp.err && <div style={{ marginBottom: 14 }}><Notice tone="bad">{sp.err}</Notice></div>}
            <form action={join} className="stack">
              <input type="hidden" name="token" value={token} />
              <label className="field">Password · at least 8 characters<input className="input" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
              <label className="field">Confirm password<input className="input" name="confirm" type="password" minLength={8} autoComplete="new-password" required /></label>
              <button className="btn primary lg" style={{ width: "100%" }}>Activate account</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
