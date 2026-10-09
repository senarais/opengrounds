"use server";
import { requireOwner } from "@/lib/auth";
import { platformDb } from "@/lib/db";
import { getCtx, guarded } from "@/lib/flow";
import { currentSeriesOf } from "@/lib/flows/reprice";
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

/** Syarat penawaran dikunci sejak pengajuan: perubahan harga, target, atau minimum tidak diterima. */
export async function reprice(fd: FormData) {
  const id = String(fd.get("id"));
  return guarded(`/owner/${id}`, async () => {
    await requireOwner(`/owner/${id}`);
    throw new Error("Syarat penawaran (jumlah token, harga, persen omzet, tenor, minimum) dikunci sejak pengajuan dan tidak bisa diubah.");
  });
}
