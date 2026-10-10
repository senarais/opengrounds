"use server";
import { requireOwner } from "@/lib/auth";
import { guarded } from "@/lib/flow";
import { latestCase, resubmitCase } from "@/lib/flows/kyb";
import { ownerOfVenue } from "@/lib/flows/onboarding";
import { disputePeriod, submitExpense, syncTopup } from "@/lib/flows/periods";
import { platformDb } from "@/lib/db";

async function mine(venueId: string) {
  const me = await requireOwner();
  if ((await ownerOfVenue(venueId)) !== me.userId) throw new Error("This venue does not belong to your account.");
  return me;
}
const back = (id: string) => `/owner/${id}`;

export async function resubmitAction(fd: FormData) {
  const id = String(fd.get("venueId"));
  await guarded(back(id), async () => { const me = await mine(id); const kc = await latestCase(id); await resubmitCase(kc!.id, me.email); return "Application resubmitted for review."; });
}
export async function expenseAction(fd: FormData) {
  const id = String(fd.get("venueId")), seriesId = String(fd.get("seriesId"));
  await guarded(back(id), async () => { const me = await mine(id); return submitExpense(seriesId, me.email, { category: String(fd.get("category")), amount: Math.floor(Number(fd.get("amount"))), note: String(fd.get("note") ?? "") }); });
}
export async function disputeAction(fd: FormData) {
  const id = String(fd.get("venueId"));
  await guarded(back(id), async () => { const me = await mine(id); return disputePeriod(String(fd.get("seriesId")), Number(fd.get("periodNo")), me.email, String(fd.get("reason") ?? "")); });
}
export async function topupSyncAction(fd: FormData) {
  const id = String(fd.get("venueId"));
  await guarded(back(id), async () => { await mine(id); const r = await syncTopup(String(fd.get("seriesId")), Number(fd.get("periodNo"))); return r === "paid" ? "Payment received. Investor balances have been credited." : `Payment not received yet (${r}).`; });
}
export async function removeExpenseAction(fd: FormData) {
  const id = String(fd.get("venueId"));
  await guarded(back(id), async () => { await mine(id); await platformDb().from("expense_items").delete().eq("id", String(fd.get("id"))).eq("status", "pending"); return "Expense removed."; });
}
