import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "bad" | "info" | "accent" | "neutral";

export function Logo({ name, sub, href = "/", src = "/og-logo.png" }: { name: string; sub?: string; href?: string; src?: string }) {
  return (
    <a className="logo" href={href} aria-label={name}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={30} height={34} alt="" />
      <span>
        <b>{name}</b>
        {sub && <small>{sub}</small>}
      </span>
    </a>
  );
}

/**
 * Maskot "Bolo": bola kecil bermata. Dipakai hanya sebagai PENJELAS (gelembung bicara menjelaskan mekanisme),
 * bukan dorongan membeli. mood: senang / berpikir / waspada.
 */
export function Mascot({ size = 56, mood = "happy", color = "#ff7a00" }: { size?: number; mood?: "happy" | "think" | "alert"; color?: string }) {
  const mouth = mood === "happy" ? "M21 34 q7 6 14 0" : mood === "think" ? "M22 35 h12" : "M24 35 q4 -4 8 0";
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden className="mascot-bob">
      <ellipse cx="28" cy="52" rx="15" ry="3" fill="rgba(15,23,42,.12)" />
      <circle cx="28" cy="27" r="22" fill={color} stroke="#0f172a" strokeWidth="2.5" />
      <path d="M12 20 q16 -14 32 0" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="20.5" cy="25" r="4.2" fill="#fff" stroke="#0f172a" strokeWidth="1.8" />
      <circle cx="35.5" cy="25" r="4.2" fill="#fff" stroke="#0f172a" strokeWidth="1.8" />
      <circle cx={mood === "think" ? 22 : 21} cy={mood === "think" ? 23.5 : 25.5} r="2" fill="#0f172a" />
      <circle cx={mood === "think" ? 37 : 36} cy={mood === "think" ? 23.5 : 25.5} r="2" fill="#0f172a" />
      <path d={mouth} fill="none" stroke="#0f172a" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="15" cy="32" r="2.6" fill="rgba(255,255,255,.5)" /><circle cx="41" cy="32" r="2.6" fill="rgba(255,255,255,.5)" />
      {mood === "alert" && <path d="M46 6 v8 M46 18 v1" stroke="#b91c1c" strokeWidth="3" strokeLinecap="round" />}
    </svg>
  );
}

/** Maskot dengan gelembung bicara: kalimat penjelas singkat. */
export function MascotSay({ children, mood, size }: { children: ReactNode; mood?: "happy" | "think" | "alert"; size?: number }) {
  return (
    <div className="mascot-say">
      <Mascot mood={mood} size={size} />
      <div className="bubble">{children}</div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, lead, children }: { eyebrow?: string; title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 8 }}>{eyebrow}</div>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

export function Card({ title, subtitle, actions, tone, children, className = "" }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; tone?: "accent" | "bad" | "ok"; children?: ReactNode; className?: string }) {
  return (
    <section className={`card ${tone ? `tone-${tone}` : ""} ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className={`kpi ${accent ? "accent" : ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Badge({ tone = "neutral", plain, children }: { tone?: Tone; plain?: boolean; children: ReactNode }) {
  return <span className={`badge ${tone === "neutral" ? "" : tone} ${plain ? "plain" : ""}`}>{children}</span>;
}

const ICON: Record<string, string> = { info: "i", warn: "!", ok: "✓", bad: "×" };
export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "ok" | "bad"; title?: string; children: ReactNode }) {
  return (
    <div className={`notice ${tone}`} role={tone === "bad" ? "alert" : "status"}>
      <div className="ico"><span>{ICON[tone]}</span></div>
      <div>{title && <b>{title} </b>}{children}</div>
    </div>
  );
}

/** Pesan hasil aksi (server action → redirect ?ok= / ?err=). */
export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return <div style={{ marginBottom: 18 }}><Notice tone={err ? "bad" : "ok"}>{err ?? ok}</Notice></div>;
}

export function Progress({ value, max, left, right, slim }: { value: number; max: number; left?: ReactNode; right?: ReactNode; slim?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div>
      <div className={`progress ${slim ? "slim" : ""}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
      {(left || right) && <div className="progress-meta"><span>{left}</span><span>{right}</span></div>}
    </div>
  );
}

export function Stepper({ steps, current, failed }: { steps: string[]; current: number; failed?: boolean }) {
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div key={s} className={`step ${failed && i === current ? "bad" : i < current ? "done" : i === current ? "now" : ""}`}>
          <i>{i < current && !failed ? "✓" : i + 1}</i>{s}
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <table className="kv"><tbody>{rows.map(([k, v], i) => <tr key={i}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
  );
}

export function Bars({ rows }: { rows: { label: string; value: number; display: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="muted">{r.label}</span>
          <div className="track"><i style={{ width: `${(r.value / max) * 100}%` }} /></div>
          <span className="num mono" style={{ textAlign: "right" }}>{r.display}</span>
        </div>
      ))}
    </div>
  );
}

export function SimBanner({ children }: { children: ReactNode }) {
  return <div className="sim-banner">{children}</div>;
}
