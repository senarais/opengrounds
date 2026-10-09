import { Logo, NavLink } from "@venue-rwa/ui";
import { IconBox, IconCal, IconChart, IconGear, IconHome, IconLedger } from "@/components/icons";
import { requireSession } from "@/lib/session";
import { signOut } from "../login/actions";

const PLATFORM_URL = process.env.PLATFORM_URL ?? "http://localhost:3000";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo name="OpenGrounds PoS" sub={s.company.name} />
        <nav aria-label="Navigasi utama">
          <NavLink href="/" exact><IconHome /><span>Dashboard</span></NavLink>
          <NavLink href="/schedule"><IconCal /><span>Jadwal &amp; booking</span></NavLink>
          <NavLink href="/products"><IconBox /><span>Produk &amp; sesi</span></NavLink>
          <NavLink href="/ledger"><IconLedger /><span>Ledger &amp; bukti</span></NavLink>
          <NavLink href="/import"><IconBox /><span>Impor data</span></NavLink>
          <NavLink href="/reports"><IconChart /><span>Laporan</span></NavLink>
          <NavLink href="/settings"><IconGear /><span>Pengaturan</span></NavLink>
        </nav>
        <div className="side-foot">
          <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{s.name}</div>
          <div style={{ marginBottom: 8 }}>{s.email} · {s.role}</div>
          <form action={signOut}><button className="btn sm ghost" style={{ color: "#cbd5e1", padding: "4px 0" }}>Keluar</button></form>
          <div style={{ marginTop: 10 }}>Terhubung ke <a href={PLATFORM_URL} target="_blank">platform tokenisasi ↗</a></div>
        </div>
      </aside>
      <div className="main">
        <div className="container">{children}</div>
      </div>
    </div>
  );
}
