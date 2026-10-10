"use client";
import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Mascot } from "@venue-rwa/ui";
import type { CourtFacility } from "./CourtScene";

const CourtScene = dynamic(() => import("./CourtScene"), { ssr: false, loading: () => <div className="small muted" style={{ display: "grid", placeItems: "center", height: "100%" }}>Loading court model…</div> });

/** Warna langit untuk latar wadah (sama dengan latar adegan 3D): siang abu biru muda → senja amber → malam midnight. */
function skyCss(h: number) {
  const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i]! - v) * Math.max(0, Math.min(1, t)))).join(",")})`;
  const day = [232, 238, 246], dusk = [255, 214, 170], night = [15, 23, 42];
  if (h >= 16 && h < 17.5) return mix(day, dusk, (h - 16) / 1.5);
  if (h >= 17.5 && h < 19) return mix(dusk, night, (h - 17.5) / 1.5);
  if (h >= 19 || h < 5.5) return mix(night, night, 0);
  if (h < 7) return mix(night, day, (h - 5.5) / 1.5);
  return mix(day, day, 0);
}

/** Match the time label to the lighting shown in the 3D scene. */
export const lightsOn = (h: number) => h >= 18 || h < 6;
function phaseLabel(h: number) {
  if (h >= 19 || h < 6) return "Night · lights on";
  if (h >= 18) return "Dusk · lights on";
  if (h >= 16) return "Afternoon";
  return "Daytime";
}

const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const hh = (h: number) => `${String(h).padStart(2, "0")}.00`;

/** Fall back to the SVG court if WebGL fails. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function webglOk(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Static SVG fallback. Illustrative player count follows the selected occupancy. */
function IsoCourt({ facilities, occupancy, onPick, picked }: { facilities: CourtFacility[]; occupancy: number; onPick: (i: number) => void; picked: number | null }) {
  return (
    <div className="row" style={{ justifyContent: "center", gap: 18, padding: "26px 10px 140px" }}>
      {facilities.slice(0, 4).map((f, i) => {
        const n = Math.round(occupancy * 8);
        return (
          <button key={i} type="button" onClick={() => onPick(i)} style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }} aria-label={`${f.name} specifications`}>
            <svg width="190" height="130" viewBox="0 0 190 130">
              <polygon points="95,8 182,55 95,102 8,55" fill="#e2e8f0" />
              <polygon points="95,18 168,55 95,92 22,55" fill={picked === i ? "#ffd166" : "#6fb48a"} stroke="#fff" strokeWidth="2.5" />
              <line x1="58" y1="36" x2="131" y2="74" stroke="#fff" strokeWidth="2" />
              <polygon points="8,55 95,102 95,112 8,65" fill="#cbd5e1" /><polygon points="182,55 95,102 95,112 182,65" fill="#94a3b8" />
              {Array.from({ length: n }, (_, k) => <circle key={k} cx={60 + ((k * 37) % 70)} cy={45 + ((k * 23) % 22)} r="4.5" fill={["#ff7a00", "#ffd166", "#334155", "#38bdf8"][k % 4]} stroke="#0f172a" strokeWidth="1" />)}
            </svg>
            <div className="small" style={{ fontWeight: 650 }}>{f.name}</div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Venue diorama: a dimension-based 3D court, time-of-day slider, illustrative occupancy, and facility details.
 * Always label the occupancy source (PoS data, owner report, or illustration).
 */
export function CourtDiorama({ facilities, hours, openHour, closeHour, source, note, venueName, area }: {
  facilities: CourtFacility[]; hours: number[]; openHour: number; closeHour: number; source: "pos" | "reported" | "illustration"; note: string; venueName: string; area: string;
}) {
  const peak = hours.reduce((best, v, h) => (v > (hours[best] ?? 0) ? h : best), source === "illustration" ? 12 : Math.min(19, Math.max(openHour, 6)));
  const [hour, setHour] = useState(Math.min(Math.max(peak, 6), 23));
  const [picked, setPicked] = useState<number | null>(null);
  const [gl, setGl] = useState<boolean | null>(null);
  useEffect(() => setGl(webglOk()), []);

  const open = hour >= openHour && hour < closeHour;
  const occ = open ? hours[hour] ?? 0 : 0;
  const f = picked !== null && picked >= 0 ? facilities[picked] : null;
  const fallback = <IsoCourt facilities={facilities} occupancy={occ} onPick={setPicked} picked={picked} />;

  return (
    <div className="diorama" style={{ height: 540, background: skyCss(hour), transition: "background .4s" }}>
      <div style={{ position: "absolute", inset: "0 0 150px 0" }}>
        {gl === false ? fallback : gl === null ? null : <SceneBoundary fallback={fallback}><CourtScene facilities={facilities} hour={hour} occupancy={occ} picked={picked} onPick={setPicked} /></SceneBoundary>}
      </div>
      <div className="hud-top">
        <span className="badge plain" style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}>Drag to rotate · select a court for details</span>
        {facilities.length > 4 && <span className="badge plain" style={{ background: "var(--surface)", boxShadow: "var(--shadow)" }}>Showing 4 of {facilities.length} courts</span>}
      </div>
      {(f || picked === -1) && (
        <div className="spec" role="dialog" aria-label="Court specifications">
          <div className="row between"><b>{f ? f.name : venueName}</b><button type="button" className="btn sm ghost" onClick={() => setPicked(null)} aria-label="Close">×</button></div>
          {f ? (
            <table className="kv" style={{ fontSize: 13 }}><tbody>
              <tr><td>Sport</td><td>{f.sport}</td></tr>
              <tr><td>Dimensions</td><td>{f.lengthM} × {f.widthM} m</td></tr>
              <tr><td>Surface</td><td>{f.surface}</td></tr>
              <tr><td>Indoor</td><td>{f.indoor ? "Yes" : "No"}</td></tr>
              <tr><td>Hourly rate</td><td>{rp(f.pricePerHour)}</td></tr>
            </tbody></table>
          ) : (
            <p className="small muted" style={{ marginTop: 6 }}>{area} · {facilities.length} courts · open {hh(openHour)}–{hh(closeHour)} WIB.</p>
          )}
        </div>
      )}
      <div className="hud">
        <div className="row between">
          <div className="row" style={{ gap: 8 }}>
            <Mascot size={34} mood={open ? (occ > 0.6 ? "happy" : "think") : "think"} />
            <div>
              <div style={{ fontWeight: 700 }}>{hh(hour)} WIB · {source === "illustration" ? "Lighting preview" : open ? `Approx. ${Math.round(occ * 100)}% occupancy` : "Closed"}</div>
              <div className="small muted">{source === "pos" ? "PoS data" : source === "illustration" ? "3D illustration · occupancy unavailable" : "Illustration · not hourly data"}</div>
            </div>
          </div>
          <span className="badge plain" style={{ background: lightsOn(hour) ? "var(--surface-2)" : "var(--highlight-soft)" }}>{phaseLabel(hour)}</span>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }} aria-label="Choose a court">{facilities.slice(0, 4).map((facility, i) => <button type="button" key={i} className="btn sm" aria-pressed={picked === i} onClick={() => setPicked(picked === i ? null : i)}>{facility.name}</button>)}</div>
        <input type="range" min={6} max={23} step={1} value={hour} onChange={(e) => setHour(Number(e.target.value))} aria-label="Court lighting time" />
        <details className="small muted"><summary style={{ cursor: "pointer", fontWeight: 700 }}>{source === "illustration" ? "About this illustration" : "Where does occupancy data come from?"}</summary><div style={{ lineHeight: 1.4, marginTop: 4 }}>{note}</div></details>
      </div>
    </div>
  );
}
