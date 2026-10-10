"use client";
import { useState } from "react";

const W = 560, H = 200, PAD = { l: 64, r: 12, t: 14, b: 28 };
const BAR = "#c25a00"; // Sunrise gelap, sama dengan grafik nilai tebus (lolos kontras ≥ 3:1)
const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const rpShort = (n: number) => (n >= 1e6 ? `Rp${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })}m` : n >= 1e3 ? `Rp${(n / 1e3).toLocaleString("en-US", { maximumFractionDigits: 0 })}k` : `Rp${Math.round(n)}`);

/** Investor share per period. Hover each bar; a table provides an accessible alternative. */
export function PeriodBars({ bars, title }: { bars: { label: string; at: string; mine: number; pool: number }[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (bars.length === 0) return null;
  const raw = Math.max(...bars.map((b) => b.mine), 1) * 1.1;
  const mag = 10 ** Math.floor(Math.log10(raw / 4));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => raw / s <= 4) ?? 10 * mag;
  const vmax = Math.ceil(raw / step) * step;
  const ticks = Array.from({ length: Math.round(vmax / step) + 1 }, (_, i) => i * step);
  const y = (v: number) => H - PAD.b - (v / vmax) * (H - PAD.t - PAD.b);
  const slot = (W - PAD.l - PAD.r) / bars.length;
  const bw = Math.min(42, slot - 2 * 2 - 8); // celah 2px antar batang + ruang
  const hb = hover !== null ? bars[hover]! : null;

  return (
    <figure className="vchart">
      <figcaption className="small"><b>{title}</b></figcaption>
      <div className="vchart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${bars.map((b) => `${b.label} ${rp(b.mine)}`).join(", ")}`} style={{ width: "100%", height: "auto" }} onPointerLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{rpShort(v)}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = PAD.l + slot * i + slot / 2;
            const top = y(b.mine), h = Math.max(0, H - PAD.b - top), r = Math.min(4, h);
            return (
              <g key={b.label} onPointerEnter={() => setHover(i)}>
                <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
                {/* ujung atas membulat 4px, dasar tetap rata di garis nol */}
                <path d={`M${cx - bw / 2},${H - PAD.b} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${H - PAD.b} Z`} fill={BAR} opacity={hover === null || hover === i ? 1 : 0.45} />
                {bars.length <= 12 && <text x={cx} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--muted)">{b.label.replace("Period ", "P")}</text>}
              </g>
            );
          })}
        </svg>
        {hb && (
          <div className="vchart-tip" style={{ left: `${((PAD.l + slot * hover! + slot / 2) / W) * 100}%` }} role="status">
            <div className="muted">{hb.label} · {new Date(hb.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
            <b>{rp(hb.mine)}</b> <span className="muted">your share</span>
            <div className="muted">total investor pool · {rp(hb.pool)}</div>
          </div>
        )}
      </div>
      <details className="disclose" style={{ marginTop: 6 }}>
        <summary>View as a table</summary>
        <div className="body">
          <table className="table"><thead><tr><th>Period</th><th className="r">Investor pool</th><th className="r">Your share</th></tr></thead>
            <tbody>{bars.map((b) => <tr key={b.label}><td>{b.label}</td><td className="r num">{rp(b.pool)}</td><td className="r num">{rp(b.mine)}</td></tr>)}</tbody></table>
        </div>
      </details>
    </figure>
  );
}
