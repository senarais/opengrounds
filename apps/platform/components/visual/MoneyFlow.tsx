"use client";
import { useEffect, useRef, useState } from "react";
import { MascotSay } from "@venue-rwa/ui";

const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

/**
 * Satu pembayaran pelanggan → koin terbelah tiga: biaya gateway, kantong investor, dan bagian owner.
 * Perhitungan mengikuti definisi Eligible Revenue: bruto − pajak (PB1, termasuk dalam harga) − fee gateway; investor mendapat sharePct dari itu.
 * Pajak tetap bagian owner yang wajib disetor, jadi ditulis terpisah di keterangan owner.
 */
export function MoneyFlow({ amount, shareBps, feeBps, split }: { amount: number; shareBps: number; feeBps: number; split: "simulated" | "xendit" }) {
  const fee = Math.round((amount * feeBps) / 10_000);
  const tax = Math.round(amount / 11);
  const eligible = amount - tax - fee;
  const investor = Math.floor((eligible * shareBps) / 10_000);
  const owner = amount - fee - investor;
  const [played, setPlayed] = useState(false);
  const [run, setRun] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // putar sekali saat terlihat; tombol "Putar lagi" untuk mengulang
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setPlayed(true); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const jars = [
    // tinggi isi toples = porsi sebenarnya dari pembayaran (minimal 6% agar tetap terlihat)
    { key: "fee", label: "Gateway", sub: `fee ${(feeBps / 100).toLocaleString("id-ID")}%`, value: fee, color: "#94a3b8", tx: "16.7%", fill: `${Math.max(6, (fee / amount) * 100)}%` },
    { key: "inv", label: "Kantong investor", sub: `${shareBps / 100}% dari Eligible Revenue`, value: investor, color: "#ffd166", tx: "50%", fill: `${Math.max(6, (investor / amount) * 100)}%` },
    { key: "own", label: "Owner", sub: `termasuk PB1 ${rp(tax)} yang disetor owner`, value: owner, color: "#ff7a00", tx: "83.3%", fill: `${Math.max(6, (owner / amount) * 100)}%` },
  ];

  return (
    <div className="flow">
      <div ref={ref} key={run} className={`flow-stage ${played ? "played" : ""}`} aria-label={`Ilustrasi pembagian satu pembayaran ${rp(amount)}`}>
        {played && <div className="coin drop">Rp</div>}
        {played && jars.map((j, i) => (
          <i key={j.key} className="shard go" style={{ ["--tx" as any]: j.tx, background: j.color, animationDelay: `${0.9 + i * 0.08}s` }} />
        ))}
        <div className="jars">
          {jars.map((j) => (
            <div key={j.key} className="jar-mini">
              <div className="glass"><i style={{ ["--fill" as any]: j.fill, background: j.color }} /></div>
              <span>{j.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flow-legend">
        {jars.map((j) => (
          <div key={j.key}>
            <span style={{ fontWeight: 650, color: "var(--text-2)" }}><i className="swatch" style={{ background: j.color }} />{j.label}</span>
            <b className="num">{rp(j.value)}</b>
            <span className="muted">{j.sub}</span>
          </div>
        ))}
      </div>
      <div className="row between">
        <MascotSay size={40}>Satu pembayaran {rp(amount)} langsung terbagi: investor dapat {rp(investor)} masuk kantong, owner tetap terima sisanya.</MascotSay>
        <button type="button" className="btn sm" onClick={() => { setPlayed(true); setRun((r) => r + 1); }}>Putar lagi</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Eligible Revenue = {rp(amount)} − PB1 {rp(tax)} − fee {rp(fee)} = <b>{rp(eligible)}</b>; bagian investor {shareBps / 100}% = <b>{rp(investor)}</b> (dibulatkan ke bawah).
        {split === "simulated" ? " Pembagian di demo ini dicatat sistem dan kustodian disimulasikan; split otomatis di Xendit belum aktif." : " Pembagian dilakukan oleh split rule Xendit."}
      </p>
    </div>
  );
}
