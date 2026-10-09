"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { reviewMessage } from "@/lib/review-message";
import { useInvestorSigner, type InvestorSigner } from "./signer-context";

declare global { interface Window { ethereum?: any } }

async function connect(chainId: number) {
  if (!window.ethereum) throw new Error("MetaMask tidak ditemukan. Pasang MetaMask di browser Anda.");
  const [account] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
  const hex = "0x" + chainId.toString(16);
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (e: any) {
    if (e?.code !== 4001) { /* chain tidak dikenal: biarkan wallet menolak saat sign */ }
    else throw new Error("Perpindahan jaringan ditolak");
  }
  return account!;
}

/** Investor menandatangani sebagai pemegang token: wallet Privy (dibuat otomatis) bila itu wallet akunnya, selain itu MetaMask. */
async function signAsHolder(signer: InvestorSigner | null, holder: string, chainId: number, typedJson: string): Promise<string> {
  if (signer && signer.address.toLowerCase() === holder.toLowerCase()) return signer.signTypedData(typedJson);
  const account = await connect(chainId);
  if (account.toLowerCase() !== holder.toLowerCase()) throw new Error("Pilih wallet yang terhubung ke akun ini di MetaMask");
  return window.ethereum.request({ method: "eth_signTypedData_v4", params: [account, typedJson] });
}

/** Tanda tangan EIP-712 lewat MetaMask lalu kirim ke server. Tanpa gas. */
export function SignTypedButton({ typedData, endpoint, body, chainId, label }: { typedData: string; endpoint: string; body: Record<string, unknown>; chainId: number; label: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  return (
    <span>
      <button className="btn primary" disabled={busy} onClick={async () => {
        setBusy(true); setMsg("");
        try {
          const account = await connect(chainId);
          const signature = await window.ethereum.request({ method: "eth_signTypedData_v4", params: [account, typedData] });
          const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, signer: account, signature }) });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error ?? "gagal");
          setMsg("✓ " + j.message);
          router.refresh();
        } catch (e: any) { setMsg("✗ " + (e?.message ?? String(e))); } finally { setBusy(false); }
      }}>{busy ? "Menunggu wallet…" : label}</button>
      {msg && <span className="muted" style={{ marginLeft: 10 }}>{msg}</span>}
    </span>
  );
}

/** Kirim transaksi biasa dari wallet pengguna (butuh sedikit ETH gas). */
export function SendTxButton({ to, data, chainId, label }: { to: string; data: string; chainId: number; label: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <span>
      <button className="btn danger" disabled={busy} onClick={async () => {
        setBusy(true); setMsg("");
        try {
          const account = await connect(chainId);
          const hash = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: account, to, data }] });
          setMsg("✓ terkirim " + String(hash).slice(0, 12) + "… (tunggu konfirmasi lalu refresh)");
          setTimeout(() => router.refresh(), 8000);
        } catch (e: any) { setMsg("✗ " + (e?.message ?? String(e))); } finally { setBusy(false); }
      }}>{busy ? "Menunggu wallet…" : label}</button>
      {msg && <span className="muted" style={{ marginLeft: 10 }}>{msg}</span>}
    </span>
  );
}

/**
 * Suara review di panel keputusan.
 * Setuju = SATU tanda tangan EIP-712 atas attestation (sekaligus suara dan tanda tangan attestation; tanpa gas).
 * Tolak = tanda tangan pesan berisi alasan. Server memeriksa wallet = Signer sesuai peran.
 */
export function ReviewVoteButtons({ seriesId, email, role, chainId }: { seriesId: string; email: string; role: string; chainId: number }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean }>({ text: "" });
  const [busy, setBusy] = useState<"" | "approved" | "rejected">("");
  async function vote(decision: "approved" | "rejected") {
    setBusy(decision); setMsg({ text: "" });
    try {
      if (decision === "rejected" && note.trim().length < 10) throw new Error("Alasan penolakan minimal 10 karakter (owner akan membacanya)");
      const account = await connect(chainId);
      let signature: string; const payload: Record<string, unknown> = { seriesId, decision, note };
      if (decision === "approved") {
        const prep = await fetch(`/api/review?seriesId=${encodeURIComponent(seriesId)}`);
        const pj = await prep.json();
        if (!prep.ok) throw new Error(pj.error ?? "gagal menyiapkan attestation");
        const allowed = (pj.allowed as string[]).map((a) => a.toLowerCase());
        if (!allowed.includes(account.toLowerCase())) throw new Error(`Akun MetaMask aktif (${account.slice(0, 8)}…) bukan wallet ${role === "auditor" ? "Signer 3" : "Signer 1 atau 2"}. Ganti akun ke ${(pj.allowed as string[]).map((a) => a.slice(0, 8) + "…").join(" atau ")}.`);
        signature = await window.ethereum.request({ method: "eth_signTypedData_v4", params: [account, pj.typed] });
        if (pj.notice) setMsg({ text: pj.notice });
      } else {
        const at = new Date().toISOString();
        payload.at = at;
        signature = await window.ethereum.request({ method: "personal_sign", params: [reviewMessage({ seriesId, email, role, decision, note, at }), account] });
      }
      setMsg({ text: "Memproses… jika ini suara kedua, kontrak dideploy dan attestation dikirim ke Sepolia (bisa 15–40 detik)." });
      const res = await fetch("/api/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, signature }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "gagal");
      setMsg({ text: j.message });
      router.refresh();
    } catch (e: any) { setMsg({ text: e?.message ?? String(e), err: true }); } finally { setBusy(""); }
  }
  return (
    <div className="stack" style={{ ["--gap" as any]: "12px" }}>
      <label className="field">Catatan (wajib bila menolak)<input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="mis. nama di polis tidak cocok dengan badan usaha" /></label>
      <button className="btn primary lg block" disabled={!!busy} onClick={() => vote("approved")}>{busy === "approved" ? "Menunggu MetaMask…" : "Setujui & tanda tangani"}</button>
      <button className="btn block" disabled={!!busy} onClick={() => vote("rejected")}>{busy === "rejected" ? "Menunggu MetaMask…" : "Tolak pengajuan"}</button>
      {msg.text && <div className={`msg ${msg.err ? "err" : ""}`} role={msg.err ? "alert" : "status"}>{msg.text}</div>}
    </div>
  );
}

/** Hubungkan wallet (MetaMask) ke akun: menandatangani pesan bukti kepemilikan, tanpa gas. */
export function ConnectWalletButton({ authId, chainId }: { authId: string; chainId: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <span>
      <button className="btn primary" disabled={busy} onClick={async () => {
        setBusy(true); setMsg("");
        try {
          const address = await connect(chainId);
          const message = `Hubungkan wallet ke Venue RWA\nAkun: ${authId}\nWaktu: ${new Date().toISOString()}`;
          const signature = await window.ethereum.request({ method: "personal_sign", params: [message, address] });
          const res = await fetch("/api/wallet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, message, signature }) });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error ?? "gagal");
          setMsg("✓ " + j.message);
          router.refresh();
        } catch (e: any) { setMsg("✗ " + (e?.message ?? String(e))); } finally { setBusy(false); }
      }}>{busy ? "Menunggu wallet…" : "Hubungkan wallet (MetaMask)"}</button>
      {msg && <span className="muted small" style={{ marginLeft: 10 }}>{msg}</span>}
    </span>
  );
}

/** Ajukan redeem: investor menandatangani RedeemRequest (EIP-712) di wallet-nya; platform meneruskan tanpa gas untuk investor. */
/**
 * Redeem dua langkah: tampilkan dulu apa yang DILEPAS (perkiraan bagian ke depan), baru minta tanda tangan.
 * Angka ke depan hanya estimasi dari data omzet; ditampilkan sebagai rentang.
 */
export function RedeemButton({ seriesId, series, holder, nonce, chainId, max, valuePerToken, futurePerToken }: {
  seriesId: string; series: string; holder: string; nonce: string; chainId: number; max: number;
  valuePerToken?: number; futurePerToken?: { low: number; high: number; monthsLeft: number };
}) {
  const router = useRouter();
  const { signer } = useInvestorSigner();
  const [units, setUnits] = useState(Math.min(100, max));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
  async function sign() {
    setBusy(true); setMsg("");
    try {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const typed = JSON.stringify({
        types: {
          EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
          RedeemRequest: [{ name: "series", type: "address" }, { name: "holder", type: "address" }, { name: "units", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
        },
        primaryType: "RedeemRequest",
        domain: { name: "Series", version: "1", chainId, verifyingContract: series },
        message: { series, holder, units: String(units), nonce, deadline: String(deadline) },
      });
      const signature = await signAsHolder(signer, holder, chainId, typed);
      const res = await fetch("/api/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seriesId, units: String(units), deadline: String(deadline), signature }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "gagal");
      setMsg("✓ " + j.message);
      setConfirming(false);
      router.refresh();
    } catch (e: any) { setMsg("✗ " + (e?.message ?? String(e))); } finally { setBusy(false); }
  }
  return (
    <div className="stack" style={{ ["--gap" as any]: "10px" }}>
      <div className="row">
        <input className="input sm" type="number" min={1} max={max} value={units} onChange={(e) => { setUnits(Number(e.target.value)); setConfirming(false); }} aria-label="Jumlah token yang ditebus" />
        {!confirming && <button className="btn sm" disabled={busy || units < 1 || units > max} onClick={() => setConfirming(true)}>Tebus…</button>}
      </div>
      {confirming && (
        <div className="notice warn" role="alertdialog" aria-label="Konfirmasi tebus">
          <div className="stack small" style={{ ["--gap" as any]: "8px" }}>
            <b>Sebelum menebus {units.toLocaleString("id-ID")} token, ini yang terjadi:</b>
            <div>Anda terima sekarang: <b>{valuePerToken !== undefined ? rp(valuePerToken * units) : "nilai tebus saat ini"}</b> (nilai tebus per token × jumlah, dibulatkan ke bawah).</div>
            <div>Anda <b>melepas</b> bagian ke depan: {futurePerToken && futurePerToken.monthsLeft > 0 ? <>perkiraan <b>{rp(futurePerToken.low * units)}–{rp(futurePerToken.high * units)}</b> selama sisa tenor (paling lama ±{futurePerToken.monthsLeft} bulan; estimasi, bisa lebih kecil).</> : "semua bagian omzet berikutnya untuk token ini."}</div>
            <div>Token dikunci, lalu dibakar setelah kustodian membayar. Tidak bisa dibatalkan setelah dibayar.</div>
            <div className="row">
              <button className="btn sm primary" disabled={busy} onClick={sign}>{busy ? "Menunggu wallet…" : "Saya paham, tanda tangani"}</button>
              <button className="btn sm ghost" disabled={busy} onClick={() => setConfirming(false)}>Batal</button>
            </div>
          </div>
        </div>
      )}
      {msg && <span className="muted small">{msg}</span>}
    </div>
  );
}

export function TransferButton({ seriesId, series, holder, nonce, chainId, max }: { seriesId: string; series: string; holder: string; nonce: string; chainId: number; max: number }) {
  const router = useRouter();
  const { signer } = useInvestorSigner();
  const [units, setUnits] = useState(1);
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack" style={{ ["--gap" as any]: "8px" }}>
      <input className="input sm mono" placeholder="Alamat wallet penerima (0x…)" value={to} onChange={(e) => setTo(e.target.value.trim())} aria-label="Alamat wallet penerima" />
      <div className="row">
        <input className="input sm" type="number" min={1} max={max} value={units} onChange={(e) => setUnits(Number(e.target.value))} aria-label="Jumlah token yang dikirim" />
        <button className="btn sm" disabled={busy || units < 1 || units > max || !/^0x[0-9a-fA-F]{40}$/.test(to)} onClick={async () => {
          setBusy(true); setMsg("");
          try {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const typed = JSON.stringify({
              types: {
                EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
                TransferRequest: [{ name: "series", type: "address" }, { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "units", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
              },
              primaryType: "TransferRequest",
              domain: { name: "Series", version: "1", chainId, verifyingContract: series },
              message: { series, from: holder, to, units: String(units), nonce, deadline: String(deadline) },
            });
            const signature = await signAsHolder(signer, holder, chainId, typed);
            const res = await fetch("/api/transfer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ seriesId, to, units: String(units), deadline: String(deadline), signature }) });
            const j = await res.json();
            if (!res.ok) throw new Error(j.error ?? "gagal");
            setMsg("✓ " + j.message);
            router.refresh();
          } catch (e: any) { setMsg("✗ " + (e?.message ?? String(e))); } finally { setBusy(false); }
        }}>{busy ? "Menunggu wallet…" : "Kirim token"}</button>
      </div>
      {msg && <span className="muted small">{msg}</span>}
    </div>
  );
}

/**
 * Status wallet investor. Dengan Privy: wallet dibuat dan ditautkan otomatis (tanpa klik); tanpa Privy: tombol MetaMask.
 */
export function WalletStatus({ authId, chainId }: { authId: string; chainId: number }) {
  const { enabled, status, error, retry } = useInvestorSigner();
  if (!enabled) return <ConnectWalletButton authId={authId} chainId={chainId} />;
  if (status === "error") return <div className="stack" style={{ ["--gap" as any]: "8px" }}><span className="small" style={{ color: "var(--bad)" }}>{error ?? "Wallet belum bisa dibuat."}</span><div><button className="btn sm" onClick={retry}>Coba lagi</button></div></div>;
  return <span className="small muted" role="status">{status === "linking" ? "Menautkan wallet ke akun Anda…" : "Wallet Anda sedang dibuat otomatis (kuncinya disimpan Privy)…"}</span>;
}
