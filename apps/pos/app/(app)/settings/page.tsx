import { Badge, Card, Flash, PageHeader } from "@venue-rwa/ui";
import { admin } from "@/lib/supabase";
import { requireSession } from "@/lib/session";
import { addMember } from "../actions";

export const dynamic = "force-dynamic";

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const { data: members } = await s.db.from("members").select("user_id, role, display_name, created_at").eq("company_id", s.company.id).order("created_at");
  // email ada di auth.users: ambil lewat admin API (server-side)
  const emails = new Map<string, string>();
  await Promise.all((members ?? []).map(async (m) => { const { data } = await admin().auth.admin.getUserById(m.user_id); if (data.user?.email) emails.set(m.user_id, data.user.email); }));

  return (
    <>
      <PageHeader eyebrow="Pengaturan" title="Perusahaan & anggota" lead="Setiap perusahaan punya workspace sendiri. Data produk, booking, ledger, dan hash harian terpisah antar perusahaan dan dijaga di tingkat database (RLS)." />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="grid c2">
        <Card title={s.company.name} subtitle={`ID workspace: ${s.company.slug}`} actions={s.company.synthetic ? <Badge tone="warn" plain>data sintetis</Badge> : undefined}>
          <table className="table">
            <thead><tr><th>Anggota</th><th>Peran</th></tr></thead>
            <tbody>{(members ?? []).map((m) => <tr key={m.user_id}><td><b>{m.display_name}</b><div className="small muted">{emails.get(m.user_id)}</div></td><td><Badge tone={m.role === "owner" ? "accent" : "neutral"}>{m.role}</Badge></td></tr>)}</tbody>
          </table>
        </Card>
        {s.role === "owner" && (
          <Card title="Tambah admin" subtitle="Admin dapat membuat booking, mengubah produk, dan melihat ledger.">
            <form action={addMember} className="stack">
              <label className="field">Nama<input className="input" name="name" required /></label>
              <label className="field">Email<input className="input" name="email" type="email" required /></label>
              <label className="field">Kata sandi sementara<input className="input" name="password" type="password" minLength={8} required /></label>
              <label className="field">Peran<select className="select" name="role"><option value="admin">admin</option><option value="cashier">cashier</option></select></label>
              <div><button className="btn primary">Tambah anggota</button></div>
            </form>
          </Card>
        )}
      </div>
    </>
  );
}
