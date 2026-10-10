"use server";
import { requireArea } from "@/lib/auth";
import { guarded } from "@/lib/flow";
import { fundBuybackReserve } from "@/lib/flows/sellback";

const BACK = "/spv";
export async function fundAction(fd: FormData) {
  const me = await requireArea("spv");
  await guarded(BACK, async () => { await fundBuybackReserve(String(fd.get("seriesId")), Math.floor(Number(fd.get("amount"))), me.email); return "Buyback reserve funded from simulated SPV capital."; });
}
