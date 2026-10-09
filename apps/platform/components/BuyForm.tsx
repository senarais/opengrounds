"use client";
import Link from "next/link";
import { useState } from "react";

const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

export interface BuyCalc {
  /** Perkiraan masuk kantong per token per bulan: dasar (median omzet) dan konservatif (setelah haircut). */
  perTokenBase: number;
  perTokenCons: number;
  tenorMonths: number;
}

/** Garis waktu titik impas dengan pita estimasi (dasar → konservatif). Selalu berlabel estimasi, bukan janji. */
function BreakEven({ price, calc, units }: { price: number; calc: BuyCalc; units: number }) {
  const mBase = calc.perTokenBase > 0 ? price / calc.perTokenBase : Infinity;
  const mCons = calc.perTokenCons > 0 ? price / calc.perTokenCons : Infinity;
  const span = Math.max(calc.tenorMonths, Math.min(Math.max(mCons, mBase), calc.tenorMonths * 2)) || 1;
  const at = (m: number) => `${Math.min(100, (m / span) * 100)}%`;
  const endAt = at(calc.tenorMonths);
  const consFinite = Number.isFinite(mCons), baseFinite = Number.isFinite(mBase);
  return (
    <div className="stack" style={{ ["--gap" as any]: "6px" }}>
      <div className="row between small"><b>Kapan balik modal?</b><span className="badge plain" style={{ background: "var(--highlight-soft)" }}>estimasi, bukan janji</span></div>
      <div className="timeline" aria-label="Garis waktu titik impas">
        <div className="track" />
        {baseFinite && <div className="band" style={{ left: at(mBase), width: `calc(${consFinite ? at(mCons) : "100%"} - ${at(mBase)})` }} />}
        <div className="pin" style={{ left: endAt, transform: calc.tenorMonths / span > 0.85 ? "translateX(-100%)" : "translateX(-50%)" }}>tenor {calc.tenorMonths} bln ▼</div>
      </div>
      <div className="small">
        {baseFinite ? <>Perkiraan impas sekitar bulan ke-<b>{Math.ceil(mBase)}</b> (dasar) sampai <b>{consFinite ? `ke-${Math.ceil(mCons)}` : "tidak tercapai"}</b> (konservatif).</> : "Belum ada data omzet untuk memperkirakan."}
      </div>
      {consFinite && mCons > calc.tenorMonths && <div className="small" style={{ color: "var(--warn)", fontWeight: 700 }}>Dalam skenario konservatif, kantong belum mencapai harga beli sampai tenor berakhir: Anda bisa rugi.</div>}
      <div className="small muted">Untuk {units.toLocaleString("id-ID")} token, kantong bertambah kira-kira {rp(calc.perTokenCons * units)}–{rp(calc.perTokenBase * units)} per bulan bila omzet seperti datanya. Omzet bisa turun; tidak ada jaminan.</div>
    </div>
  );
}

/** Form beli: wallet investor yang login; total rupiah dihitung langsung. Syarat: login investor, wallet terhubung, KYC lolos. */
export function BuyForm({ action, unitPrice, remaining, disabled, back, seriesId, status, calc, gateway }: {
  action: (fd: FormData) => void | Promise<void>; unitPrice: number; remaining: number; disabled: boolean; back: string; seriesId: string;
  status: { kind: "ready"; wallet: string } | { kind: "login" } | { kind: "not-investor" } | { kind: "no-wallet" } | { kind: "no-kyc"; wallet: string };
  calc?: BuyCalc;
  /** true = bayar lewat payment gateway (Xendit); false = alur simulasi. */
  gateway?: boolean;
}) {
  const [units, setUnits] = useState(Math.min(1, Math.max(remaining, 1)));
  const max = Math.max(1, remaining);
  const total = Math.max(0, units) * unitPrice;
  const preview = calc && <div style={{ marginTop: 14 }}><BreakEven price={unitPrice} calc={calc} units={Math.max(1, units)} /></div>;
  if (status.kind === "login") return <div className="stack"><p className="muted small">Masuk sebagai investor untuk membeli token.</p><Link className="btn primary lg" style={{ width: "100%" }} href={`/login?next=${encodeURIComponent(back)}`}>Masuk</Link><Link className="btn" style={{ width: "100%" }} href="/register">Daftar sebagai investor</Link>{preview}</div>;
  if (status.kind === "not-investor") return <div><p className="muted small">Pembelian hanya untuk akun investor. Daftar akun investor terpisah untuk membeli.</p>{preview}</div>;
  if (status.kind === "no-wallet" || status.kind === "no-kyc") {
    return <div className="stack"><p className="muted small">{status.kind === "no-wallet" ? (process.env.NEXT_PUBLIC_PRIVY_APP_ID ? "Wallet Anda dibuat otomatis begitu Anda membuka Portofolio." : "Hubungkan wallet Anda dulu.") : "Selesaikan KYC dulu."} Keduanya di halaman Portofolio.</p><Link className="btn primary lg" style={{ width: "100%" }} href={`/portfolio?s=${seriesId}`}>Ke Portofolio</Link>{preview}</div>;
  }
  return (
    <form action={action} className="stack" style={{ ["--gap" as any]: "12px" }}>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="s" value={seriesId} />
      <div className="small muted">Token dikirim ke <span className="mono">{status.wallet.slice(0, 8)}…{status.wallet.slice(-4)}</span></div>
      <label className="field">Jumlah token: <span className="num" style={{ fontSize: 18, color: "var(--text)" }}>{units.toLocaleString("id-ID")}</span>
        {max > 1 && <input type="range" min={1} max={max} value={units} onChange={(e) => setUnits(Number(e.target.value))} disabled={disabled} aria-label="Geser jumlah token" />}
        <input className="input" name="units" type="number" min={1} max={max} value={units} onChange={(e) => setUnits(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} disabled={disabled} />
      </label>
      <div className="row between" style={{ padding: "10px 14px", borderRadius: 14, background: "var(--surface-2)" }}>
        <span className="muted small">{gateway ? "Total yang dibayar" : "Total (rupiah simulasi)"}</span>
        <b className="num">{rp(total)}</b>
      </div>
      {preview}
      <button className="btn primary lg" style={{ width: "100%" }} disabled={disabled || units < 1 || units > remaining}>{gateway ? "Lanjut ke pembayaran" : "Beli token"}</button>
      {gateway && <p className="small muted" style={{ margin: 0 }}>Anda diarahkan ke halaman bayar Xendit (QRIS, virtual account, atau e-wallet). Token masuk ke wallet setelah pembayaran terkonfirmasi.</p>}
    </form>
  );
}
