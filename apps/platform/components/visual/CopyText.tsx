"use client";
import { useState } from "react";

export function CopyText({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="copybox">
      <input readOnly value={value} aria-label="Value to copy" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard access denied */ } }}>{done ? "Copied" : "Copy"}</button>
    </div>
  );
}
