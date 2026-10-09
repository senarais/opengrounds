"use server";
import { redirect } from "next/navigation";
import { admin } from "@/lib/supabase";
import { settlePayment, syncPayment } from "@/lib/pos";

/** Mensimulasikan PSP: pelanggan membayar, lalu PSP memanggil webhook settlement. Memakai fungsi settle yang sama dengan webhook. */
export async function simulatePay(fd: FormData) {
  const token = String(fd.get("token"));
  let err: string | undefined;
  try { await settlePayment(admin(), { payToken: token }); } catch (e: any) { err = e?.message ?? String(e); }
  redirect(`/pay/${token}${err ? `?err=${encodeURIComponent(err)}` : ""}`);
}

/** "Saya sudah membayar": tarik status dari PSP lalu proses settlement bila sudah PAID. */
export async function syncPay(fd: FormData) {
  const token = String(fd.get("token"));
  let err: string | undefined;
  try { await syncPayment(admin(), token); } catch (e: any) { err = e?.message ?? String(e); }
  redirect(`/pay/${token}${err ? `?err=${encodeURIComponent(err)}` : ""}`);
}
