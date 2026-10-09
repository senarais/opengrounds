"use client";
import { useState } from "react";

export function CopyText({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="copybox">
      <input readOnly value={value} aria-label="Nilai yang bisa disalin" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard ditolak */ } }}>{done ? "Tersalin" : "Salin"}</button>
    </div>
  );
}
