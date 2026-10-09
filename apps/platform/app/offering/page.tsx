import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Progress } from "@venue-rwa/ui";
import { listOfferings } from "@/lib/offering";
import { pct, rp } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OfferingList() {
  const items = await listOfferings();
  return (
    <div className="container">
      <PageHeader eyebrow="Penawaran" title="Venue yang sedang mencari pendanaan" lead="Setiap penawaran adalah bagian omzet satu venue selama tenor tertentu. Pelajari profil, kinerja, risiko, dan verifikasinya sebelum membeli." />
      {items.length === 0 ? <Card><Empty>Belum ada penawaran.</Empty></Card> : (
        <div className="grid c2">
          {items.map(({ series, venue, s }) => {
            const pub = venue?.disclosure?.public;
            return (
              <Card key={series.id} title={venue.name} subtitle={pub ? `${pub.profile.area}, ${pub.profile.city} · ${pub.profile.sports.join(", ")} · ${pub.profile.courts} lapangan` : undefined}
                actions={<Badge tone={s?.state === "Offering" ? "ok" : s?.state === "Draft" ? "warn" : "info"}>{s ? (s.state === "Draft" ? "Dalam verifikasi" : s.state) : "–"}</Badge>}>
                {s && <Progress value={Number(s.raised)} max={Number(s.target)} left={<>{rp(s.raised)} terkumpul</>} right={<>target {rp(s.target)}</>} />}
                <dl className="facts">
                  <div><dt>Bagian omzet</dt><dd>{pct(series.share_bps / 10000)}</dd></div>
                  <div><dt>Tenor</dt><dd>{Math.round(series.tenor_days / 30)} bulan</dd></div>
                  <div><dt>Harga/token</dt><dd>{rp(series.unit_price)}</dd></div>
                </dl>
                <div className="row between" style={{ marginTop: 16 }}>
                  <Badge tone={venue.data_source === "pos" ? "ok" : "warn"} plain>{venue.data_source === "pos" ? "kinerja terverifikasi gateway" : venue.data_source === "connector" ? "kinerja dari sistem eksternal owner" : "kinerja dilaporkan owner"}</Badge>
                  <Link className="btn primary sm" href={`/offering/${series.id}`}>Lihat detail →</Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
