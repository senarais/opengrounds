"use client";
import { createContext, useContext } from "react";

/** Penandatangan investor/owner: wallet embedded Privy (dibuat otomatis, kuncinya disimpan Privy). */
export interface InvestorSigner {
  address: string;
  signTypedData(typedJson: string): Promise<string>;
  signMessage(message: string): Promise<string>;
}
export interface SignerState {
  /** Privy dikonfigurasi (NEXT_PUBLIC_PRIVY_APP_ID terisi) dan pengguna adalah investor atau owner. */
  enabled: boolean;
  status: "off" | "loading" | "linking" | "ready" | "error";
  signer: InvestorSigner | null;
  error?: string;
  retry(): void;
}
export const SignerCtx = createContext<SignerState>({ enabled: false, status: "off", signer: null, retry() {} });
export const useInvestorSigner = () => useContext(SignerCtx);
