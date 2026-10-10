"use client";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useInvestorSigner } from "./signer-context";

declare global { interface Window { ethereum?: any } }

const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j;
}

/** Investor and owner signatures use Privy; the platform submits transactions. */
function usePrivySign() {
  const { signer, status, error } = useInvestorSigner();
  return {
    ready: !!signer,
    status, error,
    sign: async (typedJson: string) => {
      if (!signer) throw new Error(status === "error" ? (error ?? "Wallet is unavailable") : "Your wallet is still being prepared. Please wait.");
      return signer.signTypedData(typedJson);
    },
  };
}

/** MetaMask is used by independent staff verifiers. */
async function metamaskSign(typedJson: string, chainId: number): Promise<string> {
  if (!window.ethereum) throw new Error("MetaMask not found. Install it and select the registered verifier wallet.");
  const [account] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
  try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + chainId.toString(16) }] }); } catch { /* biarkan wallet menolak saat sign */ }
  return window.ethereum.request({ method: "eth_signTypedData_v4", params: [account, typedJson] });
}

function Msg({ m }: { m: { text: string; err?: boolean } }) {
  if (!m.text) return null;
  return <div className={`msg ${m.err ? "err" : ""}`} role={m.err ? "alert" : "status"}>{m.text}</div>;
}

/**
 * Investors create an order, sign it with Privy, pay through the gateway, then receive tokens after settlement.
 * `funding="balance"` reinvests from an existing balance.
 */
export function BuyBox({ seriesId, refPrice, available, balance, gateway }: { seriesId: string; refPrice: number; available: number; balance: number; gateway: "xendit" | "mock" }) {
  const router = useRouter();
  const { sign, ready, status } = usePrivySign();
  const [tokens, setTokens] = useState(10);
  const [funding, setFunding] = useState<"payment" | "balance">("payment");
  const [busy, setBusy] = useState("");
  const [m, setM] = useState<{ text: string; err?: boolean }>({ text: "" });
  const amount = tokens * refPrice;
  const max = funding === "balance" ? Math.min(available, Math.floor(balance / refPrice)) : available;
  async function buy() {
    setM({ text: "" });
    try {
      setBusy("Creating order…");
      const o = await post("/api/orders", { seriesId, tokens, funding });
      setBusy("Sign the order in your wallet…");
      const signature = await sign(o.typed);
      setBusy(funding === "balance" ? "Allocating tokens…" : "Preparing payment…");
      const r = await post(`/api/orders/${o.orderId}/sign`, { signature });
      if (r.url) { window.location.href = r.url; return; }
      setM({ text: `${tokens} tokens allocated to your wallet from your balance.` });
      router.refresh();
    } catch (e: any) { setM({ text: e?.message ?? String(e), err: true }); } finally { setBusy(""); }
  }
  return (
    <div className="stack" style={{ ["--gap" as any]: "12px" }}>
      <div className="seg" role="radiogroup" aria-label="Payment method">
        <button type="button" className={funding === "payment" ? "on" : ""} aria-pressed={funding === "payment"} onClick={() => setFunding("payment")}>Pay · {gateway === "xendit" ? "Xendit test" : "sandbox"}</button>
        <button type="button" className={funding === "balance" ? "on" : ""} aria-pressed={funding === "balance"} onClick={() => setFunding("balance")} disabled={balance < refPrice}>Reinvest balance</button>
      </div>
      <label className="field">Number of tokens
        <input className="input" type="number" min={1} max={max} value={tokens} onChange={(e) => setTokens(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
      </label>
      <div className="small">Total: <b>{rp(amount)}</b> ({tokens.toLocaleString("en-US")} × {rp(refPrice)} reference price). Purchase price is not income.</div>
      <button className="btn primary lg block" disabled={!!busy || !ready || tokens < 1 || tokens > max} onClick={buy}>{busy || (ready ? "Sign order & pay" : status === "error" ? "Wallet unavailable" : "Preparing wallet…")}</button>
      {tokens > max && <div className="small" style={{ color: "var(--bad)" }}>Up to {max.toLocaleString("en-US")} tokens {funding === "balance" ? "can be funded from your balance" : "are available in the treasury"}.</div>}
      <Msg m={m} />
    </div>
  );
}

/** Investors sign sell-back requests; Grounds executes FIFO when reserves allow. */
export function SellBackBox({ seriesId, unlocked, price }: { seriesId: string; unlocked: number; price: number }) {
  const router = useRouter();
  const { sign, ready } = usePrivySign();
  const [tokens, setTokens] = useState(Math.min(10, unlocked));
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<{ text: string; err?: boolean }>({ text: "" });
  async function go() {
    setBusy(true); setM({ text: "" });
    try {
      const r = await post("/api/sellback", { seriesId, tokens });
      const signature = await sign(r.typed);
      const s = await post(`/api/sellback/${r.requestId}/sign`, { signature });
      setM({ text: s.message });
      router.refresh();
    } catch (e: any) { setM({ text: e?.message ?? String(e), err: true }); } finally { setBusy(false); }
  }
  if (unlocked < 1) return <p className="small muted">No tokens have unlocked yet.</p>;
  return (
    <div className="stack" style={{ ["--gap" as any]: "10px" }}>
      <div className="row">
        <input className="input sm" type="number" min={1} max={unlocked} value={tokens} onChange={(e) => setTokens(Math.max(1, Math.floor(Number(e.target.value) || 1)))} aria-label="Number of tokens to sell back" />
        <button className="btn sm" disabled={busy || !ready || tokens > unlocked} onClick={go}>{busy ? "Waiting for wallet…" : `Request sell-back · ${rp(tokens * price)}`}</button>
      </div>
      <p className="small muted">No guaranteed liquidity. Buybacks depend on Grounds and available reserves; requests are processed FIFO.</p>
      <Msg m={m} />
    </div>
  );
}

/**
 * EIP-712 attestations: owners sign with Privy; independent verifiers use MetaMask.
 */
export function AttestSignButton({ attId, label, via, chainId, confirmText }: { attId: string; label: string; via: "privy" | "metamask"; chainId: number; confirmText?: string }) {
  const router = useRouter();
  const privy = usePrivySign();
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<{ text: string; err?: boolean }>({ text: "" });
  const confirmation = useRef<HTMLDialogElement>(null);
  const confirmationId = useId();
  async function go() {
    setBusy(true); setM({ text: "" });
    try {
      const res = await fetch(`/api/attest/${attId}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error ?? "Could not load attestation.");
      const signature = via === "privy" ? await privy.sign(j.typed) : await metamaskSign(j.typed, chainId);
      setM({ text: "Processing… when signatures are complete, the transaction is sent to Sepolia." });
      const r = await post(`/api/attest/${attId}`, { signature });
      setM({ text: r.message });
      router.refresh();
    } catch (e: any) { setM({ text: e?.message ?? String(e), err: true }); } finally { setBusy(false); }
  }
  return (
    <div className="stack" style={{ ["--gap" as any]: "8px" }}>
      <button type="button" className="btn primary" disabled={busy || (via === "privy" && !privy.ready)} onClick={() => confirmText ? confirmation.current?.showModal() : void go()}>{busy ? "Waiting for wallet…" : via === "privy" && !privy.ready ? "Preparing wallet…" : label}</button>
      {confirmText && <dialog ref={confirmation} className="og-attestation-dialog" aria-labelledby={`${confirmationId}-title`} aria-describedby={`${confirmationId}-description`}>
        <p className="small muted">Open Grounds · Ethereum Sepolia</p>
          <h2 id={`${confirmationId}-title`}>Review before signing</h2>
        <p id={`${confirmationId}-description`}>{confirmText}</p>
          <p className="small muted">Your wallet will ask for a signature. The platform submits and pays gas for the transaction.</p>
        <div className="og-attestation-actions">
          <button type="button" className="btn" autoFocus onClick={() => confirmation.current?.close()}>Cancel</button>
          <button type="button" className="btn primary" onClick={() => { confirmation.current?.close(); void go(); }}>Continue to wallet</button>
        </div>
      </dialog>}
      <Msg m={m} />
    </div>
  );
}

/** Privy wallet status, creation, and account linking. */
export function WalletStatus() {
  const { enabled, status, error, retry } = useInvestorSigner();
  if (!enabled) return <span className="small" style={{ color: "var(--bad)" }}>Privy is not configured (`NEXT_PUBLIC_PRIVY_APP_ID`).</span>;
  if (status === "error") return <div className="stack" style={{ ["--gap" as any]: "8px" }}><span className="small" style={{ color: "var(--bad)" }}>{error ?? "Wallet could not be created."}</span><div><button className="btn sm" onClick={retry}>Try again</button></div></div>;
  return <span className="small muted" role="status">{status === "linking" ? "Linking your wallet…" : "Creating your wallet securely with Privy…"}</span>;
}
