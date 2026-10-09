import { redirect } from "next/navigation";
import { Notice } from "@venue-rwa/ui";
import { staffCount } from "@/lib/flows/staff";
import { createFirstStaff } from "./actions";

export const dynamic = "force-dynamic";

export default async function Setup({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  if ((await staffCount()) > 0) redirect("/login");
  const sp = await searchParams;
  const needToken = !!process.env.SETUP_TOKEN;
  return (
    <div className="container" style={{ maxWidth: 480, paddingTop: 56 }}>
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Setup pertama kali</div>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>Buat akun staf pertama</h1>
        <p className="muted small" style={{ marginBottom: 16 }}>Belum ada staf platform. Akun ini menjadi operator dan bisa mengundang staf lain dari menu Staf (mereka membuat kata sandi sendiri). Halaman ini otomatis tertutup begitu akun pertama dibuat.</p>
        {sp.err && <div style={{ marginBottom: 14 }}><Notice tone="bad">{sp.err}</Notice></div>}
        <form action={createFirstStaff} className="stack">
          <label className="field">Nama<input className="input" name="name" autoComplete="name" required /></label>
          <label className="field">Email<input className="input" name="email" type="email" autoComplete="username" required /></label>
          <label className="field">Kata sandi (min. 8 karakter)<input className="input" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
          <label className="field">Ulangi kata sandi<input className="input" name="confirm" type="password" minLength={8} autoComplete="new-password" required /></label>
          {needToken && <label className="field">Token setup (dari SETUP_TOKEN di .env)<input className="input" name="token" type="password" required /></label>}
          <button className="btn primary lg" style={{ width: "100%" }}>Buat akun staf</button>
        </form>
        {!needToken && <p className="small muted" style={{ marginTop: 14 }}>Tip: set <span className="mono">SETUP_TOKEN</span> di <span className="mono">.env</span> bila server ini bisa diakses orang lain sebelum setup selesai.</p>}
      </div>
    </div>
  );
}
