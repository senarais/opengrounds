import Link from "next/link";
import { listSeries } from "@/lib/flow";

/** Pilih seri (pengajuan) yang sedang dikerjakan di halaman back-office. */
export async function SeriesPicker({ path, current, onlyDeployed = false }: { path: string; current?: string; onlyDeployed?: boolean }) {
  let items = await listSeries();
  if (onlyDeployed) items = items.filter((x) => x.series.contract_address);
  if (items.length <= 1) return null;
  return (
    <div className="row" style={{ marginBottom: 22, gap: 8 }}>
      <span className="eyebrow">Seri</span>
      {items.map(({ series, venue }) => (
        <Link key={series.id} href={`${path}?s=${series.id}`} className={`badge ${series.id === current ? "accent" : ""}`} style={{ padding: "5px 12px" }}>
          {venue?.name ?? series.name}{series.contract_address ? "" : " · belum dideploy"}
        </Link>
      ))}
    </div>
  );
}
