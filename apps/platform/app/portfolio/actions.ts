"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireInvestor } from "@/lib/auth";
import { guarded } from "@/lib/flow";
import { requestWithdrawal } from "@/lib/flows/cash";
import { mockKyc, registerBankAccount, startDiditKyc } from "@/lib/flows/investor";
import { cancelOrder } from "@/lib/flows/orders";
import { cancelSellBack } from "@/lib/flows/sellback";
import { diditConfig } from "@/lib/didit";

const BACK = "/portfolio";

export async function startKycAction() {
  const me = await requireInvestor();
  await guarded(BACK, async () => {
    const h = await headers();
    const url = await startDiditKyc(me.userId, me.wallet, `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`);
    // guarded always redirects; propagate this redirect before its default return path.
    redirect(url);
  });
}
export async function mockKycAction(fd: FormData) {
  const me = await requireInvestor();
  await guarded(BACK, async () => { await mockKyc(me.userId, me.wallet, String(fd.get("name") ?? "")); return "Mock KYC complete · sandbox simulation, not real identity verification."; });
}
export async function saveBankAction(fd: FormData) {
  const me = await requireInvestor();
  await guarded(BACK, () => registerBankAccount(me.userId, { bank: String(fd.get("bank") ?? ""), accountNumber: String(fd.get("number") ?? "").replace(/\D/g, ""), holderName: String(fd.get("holder") ?? "") }));
}
export async function withdrawAction(fd: FormData) {
  const me = await requireInvestor();
  await guarded(BACK, async () => { await requestWithdrawal(me.userId, Math.floor(Number(fd.get("amount")))); return "Withdrawal submitted to your verified account · sandbox simulation."; });
}
export async function cancelOrderAction(fd: FormData) {
  const me = await requireInvestor();
  await guarded(BACK, async () => { await cancelOrder(me.userId, String(fd.get("id"))); return "Order cancelled."; });
}
export async function cancelSellBackAction(fd: FormData) {
  const me = await requireInvestor();
  await guarded(BACK, async () => { await cancelSellBack(me.userId, String(fd.get("id"))); return "Sell-back request cancelled."; });
}
export const kycIsReal = async () => diditConfig().configured;
