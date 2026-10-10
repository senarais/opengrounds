import Link from "next/link";
import { Notice } from "@venue-rwa/ui";

/** Required product disclosures from PRD v4.1 §7.8. */
export function Statements({ compact }: { compact?: boolean }) {
  const items = [
    "Testnet demo only. No real money moves.",
    "Returns are not guaranteed. Distributions depend on venue performance.",
    "Liquidity is not guaranteed. Buybacks depend on Grounds and available reserves.",
    <>Reference prices follow <Link href="/cara-kerja#rumus">the published valuation formula</Link>.</>,
    "Venue assets are a pricing benchmark, not collateral. Tokens are not backed by venue assets.",
    "Open Grounds is not licensed or approved by a regulator to offer these products.",
  ];
  if (compact) return <p className="small muted">{items.map((t, i) => <span key={i}>{t} </span>)}</p>;
  return (
      <Notice tone="warn" title="Before you participate:">
      <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.7 }}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </Notice>
  );
}

/** Assumed demo parameters are always labeled. */
export const Asumsi = () => <span className="badge warn plain" title="Team-set demo parameter; not calibrated to verified operating data" style={{ marginLeft: 6, fontSize: 11 }}>Assumption</span>;
