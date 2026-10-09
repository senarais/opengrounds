import { Badge, Card, Flash, Notice, PageHeader } from "@venue-rwa/ui";
import { requireArea } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { pendingInvites, STAFF_ROLES } from "@/lib/flows/staff";
import { dt } from "@/lib/format";
import { addStaff } from "./actions";

export const dynamic = "force-dynamic";
const ROLE: Record<string, string> = { operator: "Operator (tim kita: review KYB, tutup periode, jual balik, kepatuhan)", reviewer: "Reviewer (pihak luar independen: review KYB, tanda tangan revaluasi, menggantikan owner yang diam, menengahi sengketa)", spv: "Grounds (SPV): menyetujui pembelian hak dari owner, treasury, modal dan cadangan buyback" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; link?: string }> }) {
  const sp = await searchParams;
  const me = await requireArea("staff");
  const invites = await pendingInvites();
  const { data: staff } = await platformDb().from("users").select("display_name, email, role, created_at").in("role", STAFF_ROLES).order("created_at");
  return (
    <div className="container">
      <PageHeader eyebrow="Back-office · Staf" title="Staf platform" lead="Akun staf bisa membuka halaman back-office. Wallet verifier (MetaMask) terdaftar di registry dan terpisah dari akun login ini." />
      <Flash ok={sp.ok} err={sp.err} />
      {sp.link && <div style={{ marginBottom: 18 }}><Notice tone="warn" title="Tautan undangan (hanya tampil sekali):"><code className="mono" style={{ wordBreak: "break-all" }}>{sp.link}</code></Notice></div>}
      <div className="grid c2">
        <Card title="Daftar staf">
          <table className="table"><thead><tr><th>Nama</th><th>Peran</th><th>Dibuat</th></tr></thead>
            <tbody>{(staff ?? []).map((s) => <tr key={s.email}><td><b>{s.display_name}</b><div className="small muted">{s.email}</div></td><td><Badge tone={s.role === "operator" ? "accent" : "neutral"}>{s.role}</Badge></td><td className="small">{dt(s.created_at)}</td></tr>)}</tbody></table>
          {invites.length > 0 && <p className="small muted" style={{ marginTop: 12 }}>Undangan menunggu: {invites.map((i) => `${i.email} (${i.role}, sampai ${dt(i.expires_at)})`).join("; ")}</p>}
        </Card>
        {me.role === "operator" ? (
          <Card title="Undang staf" subtitle="Penerima membuat kata sandinya sendiri lewat tautan sekali pakai (berlaku 48 jam). Operator tidak pernah melihat kata sandi staf lain.">
            <form action={addStaff} className="stack">
              <label className="field">Nama<input className="input" name="name" required /></label>
              <label className="field">Email<input className="input" name="email" type="email" required /></label>
              <label className="field">Peran<select className="select" name="role">{STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</select></label>
              <div><button className="btn primary">Buat undangan</button></div>
            </form>
          </Card>
        ) : <Card title="Tambah staf"><p className="muted small">Hanya operator yang bisa menambah staf.</p></Card>}
      </div>
    </div>
  );
}
