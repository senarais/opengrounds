import Link from "next/link";
import { Notice } from "@venue-rwa/ui";
import { registerAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function Register({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="container" style={{ maxWidth: 480, paddingTop: 56 }}>
      <div className="card">
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>Daftar</h1>
        <p className="muted small" style={{ marginBottom: 18 }}>Owner venue: ajukan penjualan sebagian omzet (akun yang sama dipakai masuk ke PoS setelah disetujui). Investor: beli token dan pantau portofolio dengan wallet Anda sendiri.</p>
        {sp.err && <div style={{ marginBottom: 14 }}><Notice tone="bad">{sp.err}</Notice></div>}
        <form action={registerAccount} className="stack">
          <label className="field">Saya mendaftar sebagai
            <select className="select" name="role" defaultValue="owner"><option value="owner">Owner venue (ingin menjual sebagian omzet)</option><option value="investor">Investor (ingin membeli token)</option></select></label>
          <label className="field">Nama lengkap<input className="input" name="name" autoComplete="name" required /></label>
          <label className="field">Email<input className="input" name="email" type="email" autoComplete="username" required /></label>
          <label className="field">Kata sandi (min. 8 karakter)<input className="input" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
          <button className="btn primary lg" style={{ width: "100%" }}>Daftar</button>
        </form>
        <p className="small muted" style={{ marginTop: 16 }}>Sudah punya akun? <Link href="/login" style={{ color: "var(--accent)", fontWeight: 700 }}>Masuk</Link></p>
      </div>
    </div>
  );
}
