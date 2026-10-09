"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { prepareApprovalAction } from "./actions";

/** Approval uses MetaMask; only submit the server action after the user signs the server-built statement. */
export function SignedApproveButton({ disabled, className }: { disabled: boolean; className: string }) {
  const { pending } = useFormStatus();
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  async function approve(button: HTMLButtonElement) {
    const form = button.form;
    if (!form || !form.reportValidity()) return;
    setError("");
    try {
      if (!window.ethereum) throw new Error("MetaMask tidak ditemukan. Pasang atau aktifkan MetaMask lalu coba lagi.");
      setStage("Menghubungkan MetaMask…");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const account = accounts[0];
      if (!account) throw new Error("Pilih akun di MetaMask.");
      const fd = new FormData(form);
      fd.set("reviewWallet", account);
      setStage("Menyiapkan tanda tangan…");
      const challenge = await prepareApprovalAction(fd);
      if (challenge.signer && account.toLowerCase() !== challenge.signer.toLowerCase()) throw new Error(`Pilih wallet reviewer terdaftar: ${challenge.signer}. Akun MetaMask yang dipilih berbeda.`);
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${challenge.chainId.toString(16)}` }] });
      setStage("Konfirmasi tanda tangan di MetaMask…");
      const signature = await window.ethereum.request({ method: "eth_signTypedData_v4", params: [account, challenge.typed] }) as string;
      // Use the exact form values that were signed even if the inputs changed while the wallet was open.
      const before = form.querySelectorAll('input[data-review-proof]');
      before.forEach((el) => el.remove());
      const signedValues: Record<string, string> = { reviewSignature: signature, reviewDeadline: challenge.deadline, reviewWallet: account };
      for (const [name, value] of Object.entries(signedValues)) {
        const input = document.createElement("input");
        input.type = "hidden"; input.name = name; input.value = value; input.dataset.reviewProof = "true";
        form.appendChild(input);
      }
      if (String(new FormData(form).get("assetValue")) !== String(fd.get("assetValue")) || String(new FormData(form).get("note")) !== String(fd.get("note"))) throw new Error("Isian berubah saat wallet terbuka. Periksa kembali lalu tanda tangani ulang.");
      setStage("Menyimpan persetujuan…");
      const submitter = form.querySelector<HTMLButtonElement>("[data-signed-submit]");
      if (!submitter) throw new Error("Form persetujuan tidak tersedia. Muat ulang halaman.");
      form.requestSubmit(submitter);
    } catch (e: unknown) {
      const err = e as { code?: number; message?: string };
      setError(err.code === 4001 ? "Tanda tangan atau koneksi dibatalkan. Pengajuan belum disetujui." : err.message ?? "Tanda tangan gagal. Pengajuan belum disetujui.");
    } finally { setStage(""); }
  }
  return <>
    <button type="button" className={className} disabled={disabled || pending || !!stage} onClick={(e) => {
      // The visible button only opens the wallet; the hidden submitter carries the signed decision.
      e.preventDefault(); void approve(e.currentTarget);
    }} aria-busy={!!stage || pending}>{stage || (pending ? "Memproses keputusan…" : "Setujui & tanda tangani")}</button>
    <button type="submit" name="decision" value="APPROVED" data-signed-submit hidden tabIndex={-1} aria-hidden="true" />
    {error && <p className="msg err" role="alert">{error}</p>}
    <p className="small muted">MetaMask akan meminta tanda tangan review tanpa biaya gas. Persetujuan disimpan setelah tanda tangan terverifikasi.</p>
  </>;
}
