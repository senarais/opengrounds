import { Badge, Card, Flash, Notice, PageHeader } from "@venue-rwa/ui";
import { CSV_HEADERS, CSV_TEMPLATE } from "@venue-rwa/shared";
import { admin } from "@/lib/supabase";
import { canManage, requireSession } from "@/lib/session";
import { dropApiKey, importCsv, makeApiKey } from "../actions";

export const dynamic = "force-dynamic";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; key?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession();
  const manage = canManage(s);
  const { data: keys } = manage ? await admin().from("api_keys").select("id, label, prefix, created_at, last_used_at, revoked_at").eq("company_id", s.company.id).order("created_at", { ascending: false }) : { data: [] };
  const { count } = await admin().from("bookings").select("id", { count: "exact", head: true }).eq("company_id", s.company.id).neq("source", "pos");
  const base = process.env.POS_URL || "http://localhost:3001";

  return (
    <>
      <PageHeader eyebrow="Integrasi" title="Impor dari sistem lain" lead="Sudah punya ERP/POS sendiri? Kirim transaksi ke sini lewat CSV atau API. Data impor ditandai sebagai sumber eksternal: platform memberi bobot kepercayaan lebih rendah daripada transaksi yang lahir langsung di PoS dan gateway." />
      <Flash ok={sp.ok} err={sp.err} />
      {sp.key && <Notice tone="warn" title="Kunci API Anda (hanya tampil sekali):"><code className="mono" style={{ wordBreak: "break-all" }}>{sp.key}</code></Notice>}
      <div className="grid c2 mt">
        <Card title="Impor CSV" subtitle={`${count ?? 0} transaksi sudah diimpor`}>
          <form action={importCsv} className="stack">
            <label className="field">File CSV<input className="input" type="file" name="file" accept=".csv,text/csv" required /></label>
            <div><button className="btn primary" disabled={!manage}>Impor</button></div>
          </form>
          <p className="small muted" style={{ marginTop: 12 }}>Kolom: <span className="mono">{CSV_HEADERS.join(", ")}</span>. Tipe: penjualan/refund. Metode: gateway/tunai/qris_sendiri. Tanggal tanpa zona dianggap WIB. Penjualan via gateway wajib punya <span className="mono">psp_ref</span> agar bisa dicocokkan dengan laporan settlement. Impor ulang file yang sama aman (ref yang sudah ada dilewati).</p>
          <a className="btn sm" download="template-impor.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}>Unduh template</a>
        </Card>
        <Card title="API ingest" subtitle="Untuk sistem yang bisa memanggil HTTP.">
          <pre className="mono small" style={{ whiteSpace: "pre-wrap" }}>{`POST ${base}/api/ingest
Authorization: Bearer <kunci>
{"transactions":[{"externalRef":"INV-1","occurredAt":"2026-09-01T03:00:00.000Z","kind":"sale","amount":150000,"method":"cash"}]}`}</pre>
          {manage && (
            <form action={makeApiKey} className="row" style={{ marginTop: 12 }}>
              <input className="input" name="label" placeholder="Nama integrasi" /><button className="btn">Buat kunci</button>
            </form>
          )}
          <table className="table" style={{ marginTop: 12 }}>
            <thead><tr><th>Kunci</th><th>Terakhir dipakai</th><th /></tr></thead>
            <tbody>{(keys ?? []).map((k) => (
              <tr key={k.id}><td><b>{k.label}</b><div className="small muted mono">{k.prefix}…</div></td><td className="small">{k.last_used_at ? new Date(k.last_used_at).toLocaleString("id-ID") : "belum"}</td>
                <td>{k.revoked_at ? <Badge tone="neutral">dicabut</Badge> : manage && <form action={dropApiKey}><input type="hidden" name="id" value={k.id} /><button className="btn sm">Cabut</button></form>}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
