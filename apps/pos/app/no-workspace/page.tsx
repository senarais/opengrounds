import { Logo, Notice } from "@venue-rwa/ui";
import { signOut } from "../login/actions";

export const dynamic = "force-dynamic";
const PLATFORM_URL = process.env.PLATFORM_URL ?? "http://localhost:3000";

/** Akun sudah login tetapi belum punya workspace PoS: dibuat otomatis setelah pengajuan di platform disetujui. */
export default function NoWorkspace() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ marginBottom: 24 }}><Logo name="PoS" sub="Point of Sale untuk venue olahraga" /></div>
        <div className="card">
          <h1 style={{ fontSize: 22, marginBottom: 10 }}>Workspace belum aktif</h1>
          <Notice tone="info">Akun Anda belum terhubung ke perusahaan mana pun. Workspace PoS dibuat otomatis setelah pengajuan penjualan omzet Anda disetujui di platform.</Notice>
          <div className="row" style={{ marginTop: 18 }}>
            <a className="btn primary" href={`${PLATFORM_URL}/owner`} target="_blank">Cek status pengajuan ↗</a>
            <form action={signOut}><button className="btn">Keluar</button></form>
          </div>
        </div>
      </div>
    </div>
  );
}
