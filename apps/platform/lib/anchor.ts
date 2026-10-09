import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { publicClient, seriesAbi } from "./chain";
import { dailyRootTypes, dayNum, seriesDomain } from "./eip712";
import { posDb } from "./db";
import { computeDailyRoot } from "@venue-rwa/connectors";
import { operatorSend } from "./operator";

export async function rootFor(companyId: string, date: string) {
  const db = posDb();
  const { data } = await db.from("daily_roots").select("*").eq("company_id", companyId).eq("date", date).maybeSingle();
  if (data) return { root: data.merkle_root as Hex, count: data.entry_count as number, anchored: data.anchored_tx as string | null };
  const r = await computeDailyRoot(db, companyId, date);
  return { root: r.root, count: r.count, anchored: null };
}

export const rootMessage = (series: Address, date: string, root: Hex, count: number) => ({ series, day: dayNum(date), root, count });

/** Verifikasi co-sign auditor (pihak independen) lalu anchor root harian on-chain. */
export async function anchorDay(ref: { series: Address; companyId: string }, date: string, signer: string, signature: Hex) {
  const { root, count, anchored } = await rootFor(ref.companyId, date);
  if (anchored) throw new Error("Root hari ini sudah di-anchor");
  if (count === 0) throw new Error("Tidak ada entri pada tanggal itu");
  const auditor = (await publicClient.readContract({ address: ref.series, abi: seriesAbi, functionName: "auditor" })) as Address;
  const rec = await recoverTypedDataAddress({ domain: seriesDomain(ref.series) as any, types: dailyRootTypes as any, primaryType: "DailyRoot", message: rootMessage(ref.series, date, root, count) as any, signature });
  if (rec.toLowerCase() !== auditor.toLowerCase() || rec.toLowerCase() !== signer.toLowerCase()) throw new Error("Hanya pihak independen (auditor) yang boleh co-sign root harian");
  const tx = await operatorSend(ref.series, seriesAbi as any, "anchorRoot", [dayNum(date), root, count, signature]);
  await posDb().from("daily_roots").update({ anchored_tx: tx, cosigner_sig: signature }).eq("company_id", ref.companyId).eq("date", date);
  return { tx, root, count };
}
