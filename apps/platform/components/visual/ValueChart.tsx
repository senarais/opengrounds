"use client";
import { useMemo, useRef, useState } from "react";

export interface ValuePoint { t: string; v: number }

const W = 560, H = 220, PAD = { l: 64, r: 16, t: 16, b: 30 };
const LINE = "#c25a00"; // Sunrise gelap: lolos kontras ≥ 3:1 di atas putih (Sunrise murni 2,6:1)
const rpShort = (n: number) => (n >= 1e9 ? `Rp${(n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M` : n >= 1e6 ? `Rp${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : n >= 1e3 ? `Rp${(n / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb` : `Rp${Math.round(n)}`);
const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const day = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" });

/**
 * Riwayat nilai tebus token yang dipegang (bukan harga pasar). Garis bertangga: nilai naik saat periode kantong difinalkan
 * dan turun saat ada redeem yang dibayar. Garis putus-putus = yang sudah dibayar (titik impas).
 */
export function ValueChart({ points, paid, title }: { points: ValuePoint[]; paid: number; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const geo = useMemo(() => {
    const ts = points.map((p) => Date.parse(p.t));
    const t0 = Math.min(...ts), t1 = Math.max(...ts, t0 + 86_400_000);
    // sumbu Y dengan angka bulat: langkah 1/2/2,5/5 × 10^k
    const raw = Math.max(paid, ...points.map((p) => p.v), 1) * 1.08;
    const mag = 10 ** Math.floor(Math.log10(raw / 4));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((st) => raw / st <= 4) ?? 10 * mag;
    const vmax = Math.ceil(raw / step) * step;
    const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (v: number) => H - PAD.b - (v / vmax) * (H - PAD.t - PAD.b);
    // garis bertangga (nilai berubah di titik, lalu datar sampai titik berikutnya)
    let d = "";
    points.forEach((p, i) => {
      const px = x(ts[i]!), py = y(p.v);
      d += i === 0 ? `M${px},${py}` : `H${px}V${py}`;
    });
    const ticks = Array.from({ length: Math.round(vmax / step) + 1 }, (_, i) => i * step);
    return { ts, t0, t1, x, y, d, ticks };
  }, [points, paid]);

  if (points.length < 2) return null;
  const last = points[points.length - 1]!;
  const onMove = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    geo.ts.forEach((t, i) => { if (Math.abs(geo.x(t) - px) < Math.abs(geo.x(geo.ts[best]!) - px)) best = i; });
    setHover(best);
  };
  const hp = hover !== null ? points[hover]! : null;

  return (
    <figure className="vchart">
      <figcaption className="small"><b>{title}</b> <span className="muted">· estimasi, bukan harga pasar</span></figcaption>
      <div className="vchart-wrap">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: dari ${rp(points[0]!.v)} menjadi ${rp(last.v)}; sudah dibayar ${rp(paid)}`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ width: "100%", height: "auto", touchAction: "pan-y" }}>
          {geo.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 8} y={geo.y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{rpShort(v)}</text>
            </g>
          ))}
          <text x={PAD.l} y={H - 8} fontSize={11} fill="var(--muted)">{day(points[0]!.t)}</text>
          <text x={W - PAD.r} y={H - 8} fontSize={11} fill="var(--muted)" textAnchor="end">{day(last.t)}</text>
          {/* titik impas */}
          <line x1={PAD.l} x2={W - PAD.r} y1={geo.y(paid)} y2={geo.y(paid)} stroke="var(--slate)" strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={W - PAD.r - 4} y={geo.y(paid) - 6} textAnchor="end" fontSize={11} fill="var(--text-2)" fontWeight={600}>Sudah dibayar {rpShort(paid)}</text>
          <path d={geo.d} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={geo.x(geo.ts[geo.ts.length - 1]!)} cy={geo.y(last.v)} r={4.5} fill={LINE} stroke="var(--surface)" strokeWidth={2} />
          {hp && (
            <g pointerEvents="none">
              <line x1={geo.x(geo.ts[hover!]!)} x2={geo.x(geo.ts[hover!]!)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ash)" strokeWidth={1} />
              <circle cx={geo.x(geo.ts[hover!]!)} cy={geo.y(hp.v)} r={5} fill={LINE} stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {hp && (
          <div className="vchart-tip" style={{ left: `${(geo.x(geo.ts[hover!]!) / W) * 100}%` }} role="status">
            <div className="muted">{day(hp.t)}</div>
            <b>{rp(hp.v)}</b>
            <div className="muted">{paid > 0 ? `${Math.round((hp.v / paid) * 100)}% dari yang dibayar` : ""}</div>
          </div>
        )}
      </div>
      <details className="disclose" style={{ marginTop: 6 }}>
        <summary>Lihat sebagai tabel</summary>
        <div className="body">
          <table className="table"><thead><tr><th>Tanggal</th><th className="r">Nilai tebus</th></tr></thead>
            <tbody>{points.map((p, i) => <tr key={i}><td>{day(p.t)}</td><td className="r num">{rp(p.v)}</td></tr>)}</tbody></table>
        </div>
      </details>
    </figure>
  );
}
