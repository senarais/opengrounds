"use server";
import { requireArea } from "@/lib/auth";
import { guarded } from "@/lib/flow";
import { fundBuybackReserve } from "@/lib/flows/sellback";
import { approveAcquisition } from "@/lib/flows/series";

const BACK = "/spv";
export async function approveAction(fd: FormData) {
  const me = await requireArea("spv");
  await guarded(BACK, () => approveAcquisition(String(fd.get("seriesId")), me.email, String(fd.get("note") ?? "")));
}
export async function fundAction(fd: FormData) {
  const me = await requireArea("spv");
  await guarded(BACK, async () => { await fundBuybackReserve(String(fd.get("seriesId")), Math.floor(Number(fd.get("amount"))), me.email); return "Cadangan buyback diisi dari modal SPV (simulasi)."; });
}
