import Link from "next/link";
import { Badge, Card, Empty, Flash, PageHeader } from "@venue-rwa/ui";
import { requireOwner } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { pct, rp } from "@/lib/format";
import { STATUS } from "@/lib/owner-status";

export const dynamic = "force-dynamic";

export default async function OwnerHome({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await requireOwner();
  const pf = platformDb();
  const { data: venues } = await pf.from("venues").select("*").eq("owner_id", me.userId).order("created_at", { ascending: false });
  const ids = (venues ?? []).map((v) => v.id);
  const { data: series } = ids.length ? await pf.from("series").select("*").in("venue_id", ids) : { data: [] as any[] };
  const { data: runs } = (series ?? []).length ? await pf.from("verification_runs").select("series_id, score, recommendation, created_at").in("series_id", series!.map((s) => s.id)).order("created_at", { ascending: false }) : { data: [] as any[] };

  return (
    <div className="container">
      <PageHeader eyebrow="Untuk owner" title="Pengajuan Anda" lead="Jual sebagian omzet venue selama tenor tertentu. Setelah disetujui, Anda mendapat token seri perusahaan dan akun PoS untuk mencatat booking dan pembayaran.">
        <Link className="btn primary" href="/owner/apply">+ Ajukan penjualan omzet</Link>
      </PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      {(venues ?? []).length === 0 ? (
        <Card><Empty>Belum ada pengajuan. <Link href="/owner/apply" style={{ color: "var(--accent)", fontWeight: 700 }}>Buat pengajuan pertama →</Link></Empty></Card>
      ) : (
        <div className="grid c2">
          {(venues ?? []).map((v) => {
            const s = series?.filter((x) => x.venue_id === v.id && x.status !== "Superseded").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            const run = runs?.find((r) => r.series_id === s?.id);
            const st = STATUS[v.status] ?? STATUS.applied!;
            return (
              <Card key={v.id} title={v.name} subtitle={`${pct((s?.share_bps ?? 0) / 10000)} omzet · ${Math.round((s?.tenor_days ?? 0) / 30)} bulan · target ${rp(s?.target ?? 0)}`} actions={<Badge tone={st.tone}>{st.label}</Badge>}>
                <div className="row between small">
                  <span className="muted">{run ? <>Rekomendasi: <b>{run.recommendation === "pass" ? "lolos" : "tidak lolos"}</b> · skor {run.score}</> : "Belum diverifikasi"}</span>
                  <Link className="btn sm" href={`/owner/${v.id}`}>Lihat detail</Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
