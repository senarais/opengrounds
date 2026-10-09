import { Logo, Notice } from "@venue-rwa/ui";
import { signIn } from "./actions";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ marginBottom: 28 }}><Logo name="OpenGrounds PoS" sub="Point of Sale untuk venue olahraga" /></div>
        <div className="card">
          <h1 style={{ fontSize: 24, marginBottom: 6 }}>Masuk</h1>
          <p className="muted small" style={{ marginBottom: 18 }}>Gunakan akun admin perusahaan Anda.</p>
          {sp.err && <div style={{ marginBottom: 14 }}><Notice tone="bad">{sp.err}</Notice></div>}
          <form action={signIn} className="stack">
            <label className="field">Email<input className="input" name="email" type="email" autoComplete="username" required defaultValue="" /></label>
            <label className="field">Kata sandi<input className="input" name="password" type="password" autoComplete="current-password" required /></label>
            <button className="btn primary lg" style={{ width: "100%" }}>Masuk</button>
          </form>
        </div>
      </div>
    </div>
  );
}
