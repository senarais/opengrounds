import { DEMO_PARAMS } from "@venue-rwa/shared";
import { Card, PageHeader } from "@venue-rwa/ui";
import { Asumsi, Statements } from "@/components/Statements";
import { SpotlightPanel } from "@/components/SpotlightPanel";
import { REGISTRY, etherscan } from "@/lib/chain";

export const metadata = { title: "Model & formula · Open Grounds" };
const P = DEMO_PARAMS;
const pct = (b: number) => `${b / 100}%`;

export default function HowItWorks() {
  let registry: string | null = null;
  try { registry = REGISTRY.address; } catch { /* not deployed yet */ }
  return (
    <div className="container">
      <PageHeader eyebrow="The model" title="Clear rules. Open numbers." lead="Review how venue valuations and profit distributions are calculated. Sepolia contracts independently enforce the same rules." />

      <div className="grid c2">
        <SpotlightPanel className="og-formula-panel"><div className="card-head"><div><h2>Valuation & reference price</h2><p>PRD §4.1–4.3</p></div></div>
          <div id="rumus" className="small" style={{ lineHeight: 1.9 }}>
            <div><b>D12</b> = reconciled distributable net profit over the latest 12 months</div>
            <div><b>V_income</b> = D12 ÷ r, where r = {pct(P.requiredYieldBps)}<Asumsi /></div>
            <div><b>V</b> = min(asset value, V_income) · the more conservative value</div>
            <div><b>y</b> = D12 ÷ V · {pct(P.yieldMinBps)}–{pct(P.yieldMaxBps)}<Asumsi /> is a review range, not an automatic rejection rule.</div>
            <div><b>S</b> = V × X · economic rights acquired by Grounds</div>
            <div><b>N</b> = S ÷ p · nominal token price p = Rp{P.tokenPrice.toLocaleString("en-US")}<Asumsi /></div>
            <div><b>Reference price</b> = V × X ÷ N · changes only through a platform + verifier revaluation for new purchases.</div>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>Demo asset values are entered by a reviewer from submitted documents and labeled. Production requires an independent valuation. Grounds buys and issues the rights, so inputs and results are disclosed.</p>
        </SpotlightPanel>
        <Card title="Monthly waterfall & per-token distribution" subtitle="PRD §4.4–4.5">
          <div className="small" style={{ lineHeight: 1.9 }}>
            <div><b>D</b> = max(0, gross − refunds − operating expenses − tax − operator fee − venue reserve − platform fee)</div>
            <div><b>P_SPV</b> = D × X · <b>F_spv</b> = P_SPV × m, where m = {pct(P.spvFeeBps)}<Asumsi /> · <b>P_inv</b> = P_SPV − F_spv</div>
            <div><b>Per-token share</b> = P_inv ÷ N · accumulated at 1e18 precision, rounded down; remainder carries forward</div>
            <div><b>Period obligation</b> = (N − treasury tokens) × per-token share. Grounds receives the treasury-token share.</div>
            <div>Contracts reject deductions above gross revenue or operating expenses above {pct(P.maxOpexBps)}<Asumsi /> of gross. Platform fee: {pct(P.platformFeeBps)}<Asumsi /> of gross. Losses do not carry forward; investors are never billed.</div>
          </div>
        </Card>
        <Card title="Daily split & monthly true-up" subtitle="PRD §3.6.1–3.6.2">
          <p className="small">Each gateway-settled booking sends {pct(P.splitBps)}<Asumsi /> to the SPV pocket and the remainder to the owner. At period close, collections are reconciled against P_SPV. Surplus returns to the owner; shortfalls are due before the deadline. If distributions remain unpaid for {P.payoutWindowSeconds / 86_400} days<Asumsi />, anyone can mark the series <b>Overdue</b>; after {P.defaultGraceSeconds / 86_400} more days<Asumsi />, it can become <b>Defaulted</b>.</p>
          <p className="small muted" style={{ marginTop: 8 }}>Payment splitting uses MockPaymentProvider in this sandbox; live Xendit splitting is not enabled.</p>
        </Card>
        <Card title="Who approves what" subtitle="EIP-712 attestations · 2 of 3 signers">
          <table className="table small">
            <thead><tr><th>Decision</th><th>Signers</th></tr></thead>
            <tbody>
              <tr><td>Asset verified · tokens may be issued</td><td>Grounds via Open Grounds (buyer) + owner (seller). Owners upload the venue application. Grounds approves the acquisition deal in its back office before the owner signs.</td></tr>
              <tr><td>Monthly profit figures</td><td>Grounds via Open Grounds + owner; after {P.ownerSignWindowSeconds / 86_400} days<Asumsi /> of owner silence, an independent verifier may sign instead.</td></tr>
              <tr><td>Reference-price revaluation</td><td>Grounds via Open Grounds + independent verifier</td></tr>
              <tr><td>Token purchase / sell-back</td><td>The investor signs the order; the platform executes after rupiah settles.</td></tr>
              <tr><td>Distribution credited</td><td>Platform only; limited by the on-chain obligation.</td></tr>
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 8 }}>Demo disclosure: our team operates both Open Grounds and Grounds. If the same team controls two keys, 2-of-3 demonstrates the mechanism only. Owners and reviewers are independent. Production requires separate SPV and platform governance, accounts, and control.{registry && <> Registry: <a href={etherscan(registry)} target="_blank" rel="noreferrer" className="mono">{registry.slice(0, 10)}…</a></>}</p>
        </Card>
        <Card title="Token rules" subtitle="ERC-20 · 0 decimals · restricted transfers">
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Fixed supply mints once to the treasury at acquisition. No additional minting and no burns.</li>
            <li>Tokens move from treasury to investor after payment and from investor back to treasury for buyback. Investor-to-investor transfers are rejected.</li>
            <li>Each purchase creates a separately locked lot: {P.lockSeconds / 60} minutes in demo mode<Asumsi /> · six months in production.</li>
            <li>Sell-back price = reference price × (1 − d), where d = {pct(P.sellbackDiscountBps)}<Asumsi />. Requests depend on reserves, run FIFO, and are not guaranteed.</li>
            <li>Tokens have no expiry. They end only through liquidation or dissolution.</li>
          </ul>
        </Card>
        <Card title="Series lifecycle">
          <p className="small" style={{ lineHeight: 1.8 }}>Draft → Verified → <b>Active</b> ⇄ Disputed · Active → Overdue → (Active | Defaulted) · Defaulted → (Active | Liquidating) · Liquidating → Closed</p>
          <p className="small muted">Status is read from the contract.</p>
        </Card>
      </div>
      <div className="mt"><Statements /></div>
    </div>
  );
}
