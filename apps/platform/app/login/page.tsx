import Link from "next/link";
import { Notice } from "@venue-rwa/ui";
import { signIn } from "./actions";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="container" style={{ maxWidth: 440, paddingTop: 56 }}>
      <div className="card">
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>Masuk</h1>
        <p className="muted small" style={{ marginBottom: 18 }}>Untuk owner venue, investor, dan staf platform.</p>
        {sp.ok && <div style={{ marginBottom: 14 }}><Notice tone="ok">{sp.ok}</Notice></div>}
        {sp.err && <div style={{ marginBottom: 14 }}><Notice tone="bad">{sp.err}</Notice></div>}
        <form action={signIn} className="stack">
          <input type="hidden" name="next" value={sp.next ?? "/"} />
          <label className="field">Email<input className="input" name="email" type="email" autoComplete="username" required /></label>
          <label className="field">Kata sandi<input className="input" name="password" type="password" autoComplete="current-password" required /></label>
          <button className="btn primary lg" style={{ width: "100%" }}>Masuk</button>
        </form>
        <p className="small muted" style={{ marginTop: 16 }}>Belum punya akun? <Link href="/register" style={{ color: "var(--accent)", fontWeight: 700 }}>Daftar</Link></p>
      </div>
    </div>
  );
}
