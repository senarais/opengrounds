"use client";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { prepareApprovalAction } from "./actions";

/** MetaMask signs the server-built review statement before approval is saved. */
export function SignedApproveButton({ disabled, className }: { disabled: boolean; className: string }) {
  const { pending } = useFormStatus();
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  async function approve(button: HTMLButtonElement) {
    const form = button.form;
    if (!form || !form.reportValidity()) return;
    setError("");
    try {
      if (!window.ethereum) throw new Error("MetaMask not found. Install or enable it, then try again.");
      setStage("Connecting MetaMask…");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      const account = accounts[0];
      if (!account) throw new Error("Select an account in MetaMask.");
      const fd = new FormData(form);
      fd.set("reviewWallet", account);
      setStage("Preparing signature…");
      const challenge = await prepareApprovalAction(fd);
      if (challenge.signer && account.toLowerCase() !== challenge.signer.toLowerCase()) throw new Error(`Select the registered reviewer wallet: ${challenge.signer}. The chosen MetaMask account does not match.`);
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${challenge.chainId.toString(16)}` }] });
      setStage("Confirm the signature in MetaMask…");
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
      if (String(new FormData(form).get("assetValue")) !== String(fd.get("assetValue")) || String(new FormData(form).get("note")) !== String(fd.get("note"))) throw new Error("Form values changed while the wallet was open. Review them and sign again.");
      setStage("Saving approval…");
      const submitter = form.querySelector<HTMLButtonElement>("[data-signed-submit]");
      if (!submitter) throw new Error("Approval form is unavailable. Reload the page.");
      form.requestSubmit(submitter);
    } catch (e: unknown) {
      const err = e as { code?: number; message?: string };
      setError(err.code === 4001 ? "Signature or connection cancelled. The application is not approved." : err.message ?? "Signature failed. The application is not approved.");
    } finally { setStage(""); }
  }
  return <>
    <button type="button" className={className} disabled={disabled || pending || !!stage} onClick={(e) => {
      // The visible button only opens the wallet; the hidden submitter carries the signed decision.
      e.preventDefault(); void approve(e.currentTarget);
    }} aria-busy={!!stage || pending}>{stage || (pending ? "Saving decision…" : "Approve & sign")}</button>
    <button type="submit" name="decision" value="APPROVED" data-signed-submit hidden tabIndex={-1} aria-hidden="true" />
    {error && <p className="msg err" role="alert">{error}</p>}
    <p className="small muted">MetaMask signs the review statement. Approval is saved after signature verification.</p>
  </>;
}
