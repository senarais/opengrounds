"use client";
import { PrivyProvider, useSignMessage, useSignTypedData, useSubscribeToJwtAuthWithFlag, useWallets } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sepolia } from "viem/chains";
import { SignerCtx, type InvestorSigner, type SignerState } from "./signer-context";

const linkMessage = (authId: string) => `Hubungkan wallet ke Venue RWA\nAkun: ${authId}\nWaktu: ${new Date().toISOString()}`;

/**
 * Wallet investor dibuat otomatis oleh Privy (custom auth: login Supabase kita ditukar jadi wallet milik pengguna itu).
 * Kunci disimpan Privy, bukan platform. Alamatnya dibuktikan ke server dengan menandatangani pesan yang sama seperti penautan MetaMask,
 * jadi server tidak perlu memercayai klien. Tanpa NEXT_PUBLIC_PRIVY_APP_ID komponen ini tidak melakukan apa-apa (jalur MetaMask tetap ada).
 */
export function PrivyShell({ appId, investor, authId, linked, chainId, children }: { appId?: string; investor: boolean; authId?: string; linked: boolean; chainId: number; children: React.ReactNode }) {
  if (!appId || !investor || !authId) return <>{children}</>;
  return (
    <PrivyProvider appId={appId} config={{
      embeddedWallets: { ethereum: { createOnLogin: "all-users" }, showWalletUIs: false },
      ...(chainId === sepolia.id ? { defaultChain: sepolia, supportedChains: [sepolia] } : {}),
    }}>
      <Bridge authId={authId} linked={linked}>{children}</Bridge>
    </PrivyProvider>
  );
}

function Bridge({ authId, linked, children }: { authId: string; linked: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const { wallets, ready: walletsReady } = useWallets();
  const { signMessage } = useSignMessage();
  const { signTypedData } = useSignTypedData();
  const [phase, setPhase] = useState<"idle" | "linking" | "done" | "error">(linked ? "done" : "idle");
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const tried = useRef(-1);

  const getExternalJwt = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/token", { cache: "no-store" });
      return ((await r.json()) as { token?: string | null }).token ?? undefined;
    } catch { return undefined; }
  }, []);
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
    error: error ?? (state.status === "error" ? "Login ke Privy gagal. Pastikan custom auth Supabase sudah diatur di dashboard Privy." : undefined),
    retry: () => { setPhase("idle"); setError(undefined); setAttempt((n) => n + 1); },
  };
  return <SignerCtx.Provider value={value}>{children}</SignerCtx.Provider>;
}
