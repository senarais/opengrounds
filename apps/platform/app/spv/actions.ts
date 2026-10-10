"use server";
import { requireArea } from "@/lib/auth";
import { guarded } from "@/lib/flow";
import { fundBuybackReserve } from "@/lib/flows/sellback";

import { approveAcquisitionDeal } from "@/lib/flows/series";

const BACK = "/spv";
export async function fundAction(fd: FormData) {
  const me = await requireArea("spv");
  await guarded(BACK, async () => { await fundBuybackReserve(String(fd.get("seriesId")), Math.floor(Number(fd.get("amount"))), me.email); return "Buyback reserve funded from simulated SPV capital."; });
}

export async function approveDealAction(fd: FormData) {
  const me = await requireArea("spv");
  await guarded(BACK, async () => {
    await approveAcquisitionDeal(String(fd.get("seriesId")), `spv:${me.email}`);
    return "Acquisition deal approved. The owner can now review and sign the rights transfer.";
  });
}
