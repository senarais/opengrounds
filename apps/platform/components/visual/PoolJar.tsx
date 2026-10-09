const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

/**
 * Toples nilai posisi investor: tinggi air = nilai tebus saat ini (estimasi), garis putus = yang sudah dibayar (titik impas).
 * Toples sengaja bisa terlihat "jauh dari garis" di awal: nilai tebus mulai dari ±Rp0 dan hanya naik seiring omzet terbukti.
 */
export function PoolJar({ paid, value, label = "Posisi Anda" }: { paid: number; value: number; label?: string }) {
  const H = 150, top = 26, bottom = top + H;
  const scaleMax = Math.max(paid * 1.25, value * 1.05, 1);
  const y = (v: number) => bottom - (Math.min(v, scaleMax) / scaleMax) * H;
  const water = y(value), even = y(paid);
  const pct = paid > 0 ? Math.round((value / paid) * 100) : 0;
  const cid = `jar-${[...`${label}|${paid}|${value}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)}`; // id unik per toples (beberapa toples di satu halaman)
  return (
    <div className="pool-jar">
      <svg width="150" height="200" viewBox="0 0 150 200" role="img" aria-label={`${label}: nilai tebus ${rp(value)} dari dibayar ${rp(paid)}`}>
        <defs>
          <clipPath id={cid}><rect x="22" y={top} width="106" height={H} rx="18" /></clipPath>
        </defs>
        <rect x="34" y="8" width="82" height="16" rx="6" fill="#94a3b8" />
        <rect x="22" y={top} width="106" height={H} rx="18" fill="var(--surface)" stroke="#cbd5e1" strokeWidth="3" />
        <g clipPath={`url(#${cid})`}>
          <rect x="22" y={water} width="106" height={bottom - water} fill="#ffd166" />
          <path d={`M22 ${water} q13 -6 26 0 t26 0 t26 0 t28 0 v8 h-106 z`} fill="#ffc23d" />
          {[0, 1, 2].map((k) => <circle key={k} cx={48 + k * 26} cy={Math.min(bottom - 10, water + 18 + k * 14)} r="3" fill="#ffffff" opacity=".7" />)}
        </g>
        <line x1="14" x2="136" y1={even} y2={even} stroke="#ff7a00" strokeWidth="2.5" strokeDasharray="6 5" />
        <text x="138" y={even + 4} fontSize="10" fontWeight="800" fill="#ff7a00" textAnchor="end" dy="-8">impas</text>
        <path d="M42 50 q-6 30 0 70" stroke="rgba(255,255,255,.7)" strokeWidth="5" fill="none" strokeLinecap="round" />
      </svg>
      <div className="stack" style={{ ["--gap" as any]: "6px" }}>
        <div className="eyebrow">{label}</div>
        <div><span className="muted small">Nilai tebus sekarang (estimasi)</span><div style={{ fontFamily: "var(--font-head)", fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }} className="num">{rp(value)}</div></div>
        <div><span className="muted small">Sudah Anda bayar (garis impas)</span><div style={{ fontWeight: 700 }} className="num">{rp(paid)}</div></div>
        <div className="small"><span className="badge plain" style={{ background: pct >= 100 ? "var(--ok-bg)" : "var(--highlight-soft)" }}>{pct}% dari titik impas</span></div>
        <p className="small muted" style={{ margin: 0 }}>Air naik setiap ada omzet yang masuk kantong. Menebus sekarang berarti menerima nilai tebus ini dan kehilangan bagian ke depan.</p>
      </div>
    </div>
  );
}
