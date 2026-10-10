import { Badge, Card, Flash, Notice, PageHeader } from "@venue-rwa/ui";
import { requireArea } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { pendingInvites, STAFF_ROLES } from "@/lib/flows/staff";
import { dt } from "@/lib/format";
import { SpotlightPanel } from "@/components/SpotlightPanel";
import { addStaff } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team access · Open Grounds" };
const ROLE: Record<string, string> = { operator: "Operator · platform operations", reviewer: "Independent reviewer · KYB and verifier", spv: "Grounds · SPV acquisition and treasury" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; link?: string }> }) {
  const sp = await searchParams;
  const me = await requireArea("staff");
  const invites = await pendingInvites();
  const { data: staff } = await platformDb().from("users").select("display_name, email, role, created_at").in("role", STAFF_ROLES).order("created_at");
  return (
    <div className="container">
      <PageHeader eyebrow="Back office · Access" title="Team access" lead="Invite operators, independent reviewers, and Grounds staff." />
      <Flash ok={sp.ok} err={sp.err} />
      {sp.link && <div style={{ marginBottom: 18 }}><Notice tone="warn" title="One-time invitation link · share securely"><code className="mono" style={{ wordBreak: "break-all" }}>{sp.link}</code></Notice></div>}
      <div className="grid c2">
        <Card title="Platform staff">
          <table className="table"><thead><tr><th>Name</th><th>Role</th><th>Joined</th></tr></thead>
            <tbody>{(staff ?? []).map((s) => <tr key={s.email}><td><b>{s.display_name}</b><div className="small muted">{s.email}</div></td><td><Badge tone={s.role === "operator" ? "accent" : "neutral"}>{ROLE[s.role] ?? s.role}</Badge></td><td className="small">{dt(s.created_at)}</td></tr>)}</tbody></table>
          {invites.length > 0 && <div className="og-pending-invites"><b>Pending invitations</b><p className="small muted">{invites.map((i) => `${i.email} · ${ROLE[i.role] ?? i.role} · expires ${dt(i.expires_at)}`).join("; ")}</p></div>}
        </Card>
        {me.role === "operator" ? (
          <SpotlightPanel className="og-invite-panel"><div className="card-head"><div><h2>Invite staff</h2><p>One-time link · expires in 48 hours · recipient creates their own password</p></div></div>
            <form action={addStaff} className="stack">
              <label className="field">Full name<input className="input" name="name" required /></label>
              <label className="field">Email<input className="input" name="email" type="email" required /></label>
              <label className="field">Role<select className="select" name="role">{STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}</select></label>
              <div><button className="btn primary">Create invitation</button></div>
            </form>
          </SpotlightPanel>
        ) : <Card title="Invite staff"><p className="muted small">Only operators can invite staff.</p></Card>}
      </div>
    </div>
  );
}
