"use client";
import { PrivyProvider, useSignMessage, useSignTypedData, useSubscribeToJwtAuthWithFlag, useWallets } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sepolia } from "viem/chains";
import { SignerCtx, type InvestorSigner, type SignerState } from "./signer-context";

const linkMessage = (authId: string) => `Hubungkan wallet ke OpenGrounds\nAkun: ${authId}\nWaktu: ${new Date().toISOString()}`;

/**
 * Wallet investor dan owner dibuat otomatis oleh Privy (custom auth: login Supabase kita ditukar jadi wallet milik pengguna itu).
 * Kunci disimpan Privy, bukan platform. Alamatnya dibuktikan ke server dengan menandatangani pesan yang sama seperti penautan MetaMask,
 * jadi server tidak perlu memercayai klien. Tanpa NEXT_PUBLIC_PRIVY_APP_ID komponen ini tidak melakukan apa-apa.
 */
export function PrivyShell({ appId, enabled, authId, linked, chainId, children }: { appId?: string; enabled: boolean; authId?: string; linked: boolean; chainId: number; children: React.ReactNode }) {
  // "Coba lagi" me-mount ulang Bridge, sehingga sinkronisasi login ke Privy diulang dari awal
  const [round, setRound] = useState(0);
  if (!appId || !enabled || !authId) return <>{children}</>;
  return (
    <PrivyProvider appId={appId} config={{
      embeddedWallets: { ethereum: { createOnLogin: "all-users" }, showWalletUIs: false },
      ...(chainId === sepolia.id ? { defaultChain: sepolia, supportedChains: [sepolia] } : {}),
    }}>
      <Bridge key={round} authId={authId} linked={linked} onRestart={() => setRound((n) => n + 1)}>{children}</Bridge>
    </PrivyProvider>
  );
}

/** Ambil token sesi dari server; coba ulang saat jaringan ke Supabase putus sesaat. Tidak pernah melempar (syarat Privy). */
async function fetchJwt(): Promise<string | undefined> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch("/api/auth/token", { cache: "no-store" });
      if (r.status === 401) return undefined;
      const j = (await r.json()) as { token?: string | null };
      if (r.ok && j.token) return j.token;
    } catch { /* jaringan: coba lagi */ }
    await new Promise((res) => setTimeout(res, 800 * 2 ** attempt));
  }
  return undefined;
}

const friendly = (m?: string) =>
  m && /authenticated|jwt|token|login/i.test(m) ? "Login ke Privy belum tersambung, biasanya karena koneksi ke server sempat putus. Klik Coba lagi." : m;

function Bridge({ authId, linked, onRestart, children }: { authId: string; linked: boolean; onRestart: () => void; children: React.ReactNode }) {
  const router = useRouter();
  const { wallets, ready: walletsReady } = useWallets();
  const { signMessage } = useSignMessage();
  const { signTypedData } = useSignTypedData();
  const [phase, setPhase] = useState<"idle" | "linking" | "done" | "error">(linked ? "done" : "idle");
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const tried = useRef(-1);

  const getExternalJwt = useCallback(fetchJwt, []);
  const { state } = useSubscribeToJwtAuthWithFlag({ isAuthenticated: true, getExternalJwt, onError: (e) => { setError(e.message); setPhase("error"); } });

  const embedded = wallets.find((w) => w.walletClientType === "privy");
  const signer = useMemo<InvestorSigner | null>(() => embedded ? ({
    address: embedded.address,
    signMessage: async (message) => (await signMessage({ message }, { address: embedded.address })).signature,
    signTypedData: async (typedJson) => (await signTypedData(JSON.parse(typedJson), { address: embedded.address })).signature,
  }) : null, [embedded?.address, signMessage, signTypedData]);

  // wallet sudah ada tetapi server belum tahu: buktikan kepemilikan sekali, lalu muat ulang
  useEffect(() => {
    if (linked || !signer || !walletsReady || tried.current === attempt) return;
    tried.current = attempt;
    (async () => {
      setPhase("linking"); setError(undefined);
      try {
        const message = linkMessage(authId);
        const signature = await signer.signMessage(message);
        const res = await fetch("/api/wallet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: signer.address, message, signature }) });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "gagal menautkan wallet");
        setPhase("done");
        router.refresh();
      } catch (e: any) { setError(e?.message ?? String(e)); setPhase("error"); }
    })();
  }, [linked, signer, walletsReady, attempt, authId, router]);

  const value: SignerState = {
    enabled: true,
    signer,
    status: phase === "error" || state.status === "error" ? "error" : phase === "linking" ? "linking" : signer ? "ready" : "loading",
    error: friendly(error) ?? (state.status === "error" ? "Login ke Privy gagal. Bila berulang, periksa pengaturan JWT-based auth di dashboard Privy." : undefined),
    // gagal di tahap login Privy: ulang sinkronisasi dari awal; gagal di tahap penautan: cukup ulang penautan
    retry: () => { if (state.status === "error" || !signer) { onRestart(); return; } setPhase("idle"); setError(undefined); setAttempt((n) => n + 1); },
  };
  return <SignerCtx.Provider value={value}>{children}</SignerCtx.Provider>;
}
