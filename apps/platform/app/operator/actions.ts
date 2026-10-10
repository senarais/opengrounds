"use server";
import { requireArea } from "@/lib/auth";
import { guarded } from "@/lib/flow";
import { forcedTransfer, proposeValuation, setFrozen } from "@/lib/flows/admin";
import { advanceWithdrawal, failWithdrawal } from "@/lib/flows/cash";
import { checkDeadlines, closePeriod, postPeriod, reviewExpense, syncTopup } from "@/lib/flows/periods";
import { runSellBackWindow } from "@/lib/flows/sellback";

const BACK = "/operator";
const sid = (fd: FormData) => String(fd.get("seriesId"));
const op = async () => (await requireArea("operator")).email;

export async function closePeriodAction(fd: FormData) { const a = await op(); await guarded(BACK, () => closePeriod(sid(fd), a)); }
export async function postPeriodAction(fd: FormData) { await op(); await guarded(BACK, () => postPeriod(sid(fd), Number(fd.get("periodNo")))); }
export async function topupAction(fd: FormData) { await op(); await guarded(BACK, async () => { const r = await syncTopup(sid(fd), Number(fd.get("periodNo"))); return r === "paid" ? "Payment received. Investor balances credited." : `Payment not received yet (${r}).`; }); }
export async function deadlinesAction(fd: FormData) { await op(); await guarded(BACK, async () => { const r = await checkDeadlines(sid(fd)); return r.length ? r.join("; ") : "No deadlines have passed."; }); }
export async function windowAction(fd: FormData) { const a = await op(); await guarded(BACK, () => runSellBackWindow(sid(fd), a)); }
export async function freezeAction(fd: FormData) { const a = await op(); await guarded(BACK, () => setFrozen(sid(fd), String(fd.get("wallet")), fd.get("frozen") === "1", a, String(fd.get("reason") ?? ""))); }
export async function forceAction(fd: FormData) { const a = await op(); await guarded(BACK, () => forcedTransfer(sid(fd), String(fd.get("from")), String(fd.get("to")), Math.floor(Number(fd.get("tokens"))), a, String(fd.get("reason") ?? ""))); }
export async function valuationAction(fd: FormData) { const a = await op(); await guarded(BACK, () => proposeValuation(sid(fd), Math.floor(Number(fd.get("valuation"))), String(fd.get("reason") ?? ""), a)); }
export async function expenseReviewAction(fd: FormData) { const a = await op(); await guarded(BACK, async () => { await reviewExpense(String(fd.get("id")), a, fd.get("approve") === "1", String(fd.get("note") ?? "")); return "Expense review saved."; }); }
export async function withdrawalAction(fd: FormData) {
  const a = await op();
  await guarded(BACK, async () => {
    if (fd.get("fail")) { await failWithdrawal(String(fd.get("id")), a, String(fd.get("reason") || "declined by bank")); return "Withdrawal marked failed; investor balance returned."; }
    await advanceWithdrawal(String(fd.get("id")), a); return "Withdrawal advanced.";
  });
}
