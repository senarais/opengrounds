"use client";
import { useState } from "react";
import type { FeedDay } from "@/lib/holdings";

const W = 560, H = 190, PAD = { l: 64, r: 12, t: 12, b: 26 };
const BAR = "#c25a00"; // Sunrise gelap, sama dengan grafik lain (lolos kontras ≥ 3:1)
const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const rpShort = (n: number) => (n >= 1e6 ? `Rp${(n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt` : n >= 1e3 ? `Rp${(n / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb` : `Rp${Math.round(n)}`);
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });

/** Eligible Revenue venue per hari (satu warna). Hover menampilkan rincian omzet dan potongannya; tabel sebagai alternatif. */
export function DailyBars({ days }: { days: FeedDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const raw = Math.max(...days.map((d) => d.eligible), 1) * 1.1;
  const mag = 10 ** Math.floor(Math.log10(raw / 4));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => raw / s <= 4) ?? 10 * mag;
  const vmax = Math.ceil(raw / step) * step;
  const ticks = Array.from({ length: Math.round(vmax / step) + 1 }, (_, i) => i * step);
  const y = (v: number) => H - PAD.b - (v / vmax) * (H - PAD.t - PAD.b);
  const slot = (W - PAD.l - PAD.r) / days.length;
  const bw = Math.max(2, slot - 2); // celah 2px antar batang
  const hd = hover !== null ? days[hover]! : null;
  const marks = [0, Math.floor(days.length / 2), days.length - 1];

  return (
    <figure className="vchart">
      <figcaption className="small"><b>Eligible Revenue per hari</b> <span className="muted">· {days.length} hari terakhir</span></figcaption>
      <div className="vchart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Eligible Revenue per hari, total ${rp(days.reduce((a, d) => a + d.eligible, 0))}`} style={{ width: "100%", height: "auto" }} onPointerLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{rpShort(v)}</text>
            </g>
          ))}
          {days.map((d, i) => {
            const x = PAD.l + slot * i + (slot - bw) / 2, top = y(d.eligible), h = Math.max(0, H - PAD.b - top), r = Math.min(2, h);
            return (
              <g key={d.day} onPointerEnter={() => setHover(i)}>
                <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
                {h > 0 && <path d={`M${x},${H - PAD.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - PAD.b} Z`} fill={BAR} opacity={hover === null || hover === i ? 1 : 0.45} />}
              </g>
            );
          })}
          {marks.map((i) => <text key={i} x={PAD.l + slot * i + slot / 2} y={H - 8} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} fontSize={11} fill="var(--muted)">{dayLabel(days[i]!.day)}</text>)}
        </svg>
        {hd && (
          <div className="vchart-tip" style={{ left: `${Math.min(80, Math.max(20, ((PAD.l + slot * hover! + slot / 2) / W) * 100))}%` }} role="status">
            <div className="muted">{dayLabel(hd.day)}</div>
            <div>Omzet settle <b>{rp(hd.gross)}</b></div>
            <div className="muted">− refund {rp(hd.refunds)} · pajak {rp(hd.taxes)} · fee {rp(hd.fees)}</div>
            <div>Eligible <b>{rp(hd.eligible)}</b>{hd.investor > 0 && <> · investor <b>{rp(hd.investor)}</b></>}</div>
          </div>
        )}
      </div>
      <details className="disclose" style={{ marginTop: 6 }}>
        <summary>Lihat sebagai tabel</summary>
        <div className="body"><div className="table-wrap">
          <table className="table"><thead><tr><th>Tanggal</th><th className="r">Omzet settle</th><th className="r">Refund</th><th className="r">Pajak</th><th className="r">Fee gateway</th><th className="r">Eligible</th><th className="r">Investor</th></tr></thead>
            <tbody>{days.filter((d) => d.gross || d.refunds || d.taxes || d.fees).map((d) => <tr key={d.day}><td>{dayLabel(d.day)}</td><td className="r num">{rp(d.gross)}</td><td className="r num">{rp(d.refunds)}</td><td className="r num">{rp(d.taxes)}</td><td className="r num">{rp(d.fees)}</td><td className="r num">{rp(d.eligible)}</td><td className="r num">{rp(d.investor)}</td></tr>)}</tbody></table>
        </div></div>
      </details>
    </figure>
  );
}
