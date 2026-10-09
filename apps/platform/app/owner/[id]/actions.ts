"use server";
import { requireOwner } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { getCtx, guarded } from "@/lib/flow";
import { currentSeriesOf, requestReprice } from "@/lib/flows/reprice";
import { ownerWithdraw } from "@/lib/flows/series";

/** Owner menarik dana yang sudah dirilis ke saldo owner (kustodian simulasi). Hanya untuk pengajuannya sendiri. */
export async function withdraw(fd: FormData) {
  const id = String(fd.get("id"));
  return guarded(`/owner/${id}`, async () => {
    const me = await requireOwner(`/owner/${id}`);
    const { data: venue } = await platformDb().from("venues").select("owner_id").eq("id", id).maybeSingle();
    if (!venue || venue.owner_id !== me.userId) throw new Error("Pengajuan tidak ditemukan");
    const ctx = await getCtx((await currentSeriesOf(id)).id);
    return ownerWithdraw(ctx, me.userId, Number(String(fd.get("amount") ?? "").replace(/\D/g, "")));
  });
}

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/\D/g, ""));

/** Owner mengajukan perubahan harga/target: membuat seri pengganti (harga di kontrak tidak bisa diubah). */
export async function reprice(fd: FormData) {
  const id = String(fd.get("id"));
  return guarded(`/owner/${id}`, async () => {
    const me = await requireOwner(`/owner/${id}`);
    const cur = await currentSeriesOf(id);
    const r = await requestReprice(cur.id, { userId: me.userId, email: me.email }, { unitPrice: num(fd.get("unitPrice")), target: num(fd.get("target")), minRaise: num(fd.get("minRaise")) });
    return `Perubahan diajukan sebagai seri pengganti. Verifikasi ulang selesai; menunggu attestation baru dari penandatangan.${r.coolingHours ? ` Masa tunggu ${r.coolingHours} jam karena harga naik.` : ""}`;
  });
}
