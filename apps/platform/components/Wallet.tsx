"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useInvestorSigner } from "./signer-context";

declare global { interface Window { ethereum?: any } }

const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error ?? `Gagal (${res.status})`);
  return j;
}

/** Tanda tangan dengan wallet Privy pengguna (investor/owner). Tanpa gas: platform yang mengirim transaksi. */
function usePrivySign() {
  const { signer, status, error } = useInvestorSigner();
  return {
    ready: !!signer,
    status, error,
    sign: async (typedJson: string) => {
      if (!signer) throw new Error(status === "error" ? (error ?? "Wallet belum siap") : "Wallet Anda masih disiapkan, tunggu sebentar");
      return signer.signTypedData(typedJson);
    },
  };
}

/** MetaMask (penanda tangan staf: verifier independen). */
async function metamaskSign(typedJson: string, chainId: number): Promise<string> {
  if (!window.ethereum) throw new Error("MetaMask tidak ditemukan. Pasang MetaMask dan pilih wallet verifier.");
  const [account] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
  try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + chainId.toString(16) }] }); } catch { /* biarkan wallet menolak saat sign */ }
  return window.ethereum.request({ method: "eth_signTypedData_v4", params: [account, typedJson] });
}

function Msg({ m }: { m: { text: string; err?: boolean } }) {
  if (!m.text) return null;
  return <div className={`msg ${m.err ? "err" : ""}`} role={m.err ? "alert" : "status"}>{m.text}</div>;
}

/**
 * Beli token: (1) pesanan dibuat, (2) investor menandatangani pesanan di wallet Privy (jumlah, nominal, batas waktu),
 * (3) bayar di payment gateway, (4) platform mengeksekusi pesanan on-chain setelah rupiah masuk.
 * `funding="balance"` = reinvest dari saldo: langkah 3 dilewati.
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
      setBusy("Membuat pesanan…");
      const o = await post("/api/orders", { seriesId, tokens, funding });
      setBusy("Tanda tangani pesanan di wallet Anda…");
      const signature = await sign(o.typed);
      setBusy(funding === "balance" ? "Mengalokasikan token…" : "Menyiapkan halaman bayar…");
      const r = await post(`/api/orders/${o.orderId}/sign`, { signature });
      if (r.url) { window.location.href = r.url; return; }
      setM({ text: `${tokens} token masuk ke wallet Anda (dibayar dari saldo).` });
      router.refresh();
    } catch (e: any) { setM({ text: e?.message ?? String(e), err: true }); } finally { setBusy(""); }
  }
  return (
    <div className="stack" style={{ ["--gap" as any]: "12px" }}>
      <div className="seg" role="radiogroup" aria-label="Sumber dana">
        <button type="button" className={funding === "payment" ? "on" : ""} aria-pressed={funding === "payment"} onClick={() => setFunding("payment")}>Bayar ({gateway === "xendit" ? "Xendit mode uji" : "sandbox"})</button>
        <button type="button" className={funding === "balance" ? "on" : ""} aria-pressed={funding === "balance"} onClick={() => setFunding("balance")} disabled={balance < refPrice}>Reinvest dari saldo</button>
      </div>
      <label className="field">Jumlah token
        <input className="input" type="number" min={1} max={max} value={tokens} onChange={(e) => setTokens(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
      </label>
      <div className="small">Dibayar: <b>{rp(amount)}</b> ({tokens.toLocaleString("id-ID")} × harga referensi {rp(refPrice)}). Ini harga yang dibayar, bukan penghasilan.</div>
      <button className="btn primary lg block" disabled={!!busy || !ready || tokens < 1 || tokens > max} onClick={buy}>{busy || (ready ? "Tanda tangani pesanan & bayar" : status === "error" ? "Wallet bermasalah" : "Menyiapkan wallet…")}</button>
      {tokens > max && <div className="small" style={{ color: "var(--bad)" }}>Maksimal {max.toLocaleString("id-ID")} token {funding === "balance" ? "dari saldo Anda" : "tersedia di treasury"}.</div>}
      <Msg m={m} />
    </div>
  );
}

/** Ajukan jual balik: pemegang menandatangani permintaan (jumlah, nominal) di wallet Privy; dieksekusi pada jendela berikutnya bila dana ada. */
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
  if (unlocked < 1) return <p className="small muted">Belum ada token yang lewat masa kunci.</p>;
  return (
    <div className="stack" style={{ ["--gap" as any]: "10px" }}>
      <div className="row">
        <input className="input sm" type="number" min={1} max={unlocked} value={tokens} onChange={(e) => setTokens(Math.max(1, Math.floor(Number(e.target.value) || 1)))} aria-label="Jumlah token dijual balik" />
        <button className="btn sm" disabled={busy || !ready || tokens > unlocked} onClick={go}>{busy ? "Menunggu wallet…" : `Ajukan jual balik ${rp(tokens * price)}`}</button>
      </div>
      <p className="small muted">Likuiditas tidak dijamin. Jual balik bergantung pada dana cadangan dan keputusan Grounds; antrean FIFO per jendela.</p>
      <Msg m={m} />
    </div>
  );
}

/**
 * Tanda tangan attestation (EIP-712, tanpa gas). Owner memakai wallet Privy; verifier (reviewer independen) memakai MetaMask.
 * Server mengenali slot dari alamat penanda tangan; kontrak memeriksa ulang.
 */
export function AttestSignButton({ attId, label, via, chainId, confirmText }: { attId: string; label: string; via: "privy" | "metamask"; chainId: number; confirmText?: string }) {
  const router = useRouter();
  const privy = usePrivySign();
  const [busy, setBusy] = useState(false);
  const [m, setM] = useState<{ text: string; err?: boolean }>({ text: "" });
  async function go() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setM({ text: "" });
    try {
      const res = await fetch(`/api/attest/${attId}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error ?? "gagal memuat attestation");
      const signature = via === "privy" ? await privy.sign(j.typed) : await metamaskSign(j.typed, chainId);
      setM({ text: "Memproses… bila tanda tangan sudah lengkap, transaksi dikirim ke Sepolia (15–40 detik)." });
      const r = await post(`/api/attest/${attId}`, { signature });
      setM({ text: r.message });
      router.refresh();
    } catch (e: any) { setM({ text: e?.message ?? String(e), err: true }); } finally { setBusy(false); }
  }
  return (
    <div className="stack" style={{ ["--gap" as any]: "8px" }}>
      <button className="btn primary" disabled={busy || (via === "privy" && !privy.ready)} onClick={go}>{busy ? "Menunggu wallet…" : via === "privy" && !privy.ready ? "Menyiapkan wallet…" : label}</button>
      <Msg m={m} />
    </div>
  );
}

/** Status wallet Privy (dibuat dan ditautkan otomatis). */
export function WalletStatus() {
  const { enabled, status, error, retry } = useInvestorSigner();
  if (!enabled) return <span className="small" style={{ color: "var(--bad)" }}>Privy belum dikonfigurasi (NEXT_PUBLIC_PRIVY_APP_ID).</span>;
  if (status === "error") return <div className="stack" style={{ ["--gap" as any]: "8px" }}><span className="small" style={{ color: "var(--bad)" }}>{error ?? "Wallet belum bisa dibuat."}</span><div><button className="btn sm" onClick={retry}>Coba lagi</button></div></div>;
  return <span className="small muted" role="status">{status === "linking" ? "Menautkan wallet ke akun Anda…" : "Wallet Anda sedang dibuat otomatis (kuncinya disimpan Privy)…"}</span>;
}
