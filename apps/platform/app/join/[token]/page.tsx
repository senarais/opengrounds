import { Notice } from "@venue-rwa/ui";
import { inviteByToken } from "@/lib/flows/staff";
import { join } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terima undangan staf" };

export default async function Join({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ err?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const inv = await inviteByToken(token);
  return (
    <div className="container" style={{ maxWidth: 480, paddingTop: 56 }}>
      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Undangan staf</div>
        {!inv ? (
          <>
            <h1 style={{ fontSize: 26, marginBottom: 6 }}>Tautan tidak berlaku</h1>
            <p className="muted small">Tautan ini salah, sudah dipakai, atau kedaluwarsa. Minta operator mengundang Anda lagi.</p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 26, marginBottom: 6 }}>Halo, {inv.display_name}</h1>
            <p className="muted small" style={{ marginBottom: 16 }}>Anda diundang sebagai <b>{inv.role}</b> dengan email <b>{inv.email}</b>. Buat kata sandi Anda sendiri; operator yang mengundang tidak akan mengetahuinya.</p>
            {sp.err && <div style={{ marginBottom: 14 }}><Notice tone="bad">{sp.err}</Notice></div>}
            <form action={join} className="stack">
              <input type="hidden" name="token" value={token} />
              <label className="field">Kata sandi (min. 8 karakter)<input className="input" name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
              <label className="field">Ulangi kata sandi<input className="input" name="confirm" type="password" minLength={8} autoComplete="new-password" required /></label>
              <button className="btn primary lg" style={{ width: "100%" }}>Aktifkan akun</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
