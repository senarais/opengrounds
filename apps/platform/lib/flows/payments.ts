import { platformDb } from "../db";
import { orderByPspRef, settleOrder } from "./orders";
import { syncTopup } from "./periods";

/**
 * Satu pintu untuk webhook pembayaran (Xendit atau sandbox): cari tagihannya (pesanan token atau kekurangan true-up owner),
 * lalu baca ulang status dari penyedia. Isi webhook tidak dipercaya untuk status. Idempoten.
 */
export async function onChargePaid(pspRef: string) {
  const orderId = await orderByPspRef(pspRef);
  if (orderId) return settleOrder(orderId);
  const { data: per } = await platformDb().from("revenue_periods").select("series_id, period_no").eq("topup_psp_ref", pspRef).maybeSingle();
  if (per) return syncTopup(per.series_id, per.period_no);
  return "unknown";
}
