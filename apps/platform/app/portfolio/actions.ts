"use server";
import { getAddress } from "viem";
import { requireInvestor } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { diditConfig } from "@/lib/didit";
import * as inv from "@/lib/flows/investor";
import { startKyc } from "@/lib/flows/kyc";
import { startPurchase } from "@/lib/flows/payment";
import { xenditConfigured } from "@/lib/psp";
import { refundHolder } from "@/lib/flows/series";
import { getCtx, guarded } from "@/lib/flow";

const backOf = (fd: FormData, d: string) => String(fd.get("back") || d);

/** KYC nyata via Didit: buat sesi lalu arahkan pengguna ke halaman verifikasi Didit. */
export async function startDidit() {
  let url: string;
  try {
    const me = await requireInvestor();
    const h = await headers();
    url = await startKyc({ userId: me.userId, wallet: me.wallet }, `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`);
  } catch (e: any) {
    redirect(`/portfolio?err=${encodeURIComponent(e?.message ?? String(e))}`);
  }
  redirect(url);
}

/** KYC MOCK untuk wallet milik akun yang login (simulasi, dilabeli). */
export async function kyc(fd: FormData) {
  return guarded(backOf(fd, "/portfolio"), async () => {
    const me = await requireInvestor();
    if (diditConfig().configured) throw new Error("KYC mock dimatikan karena Didit sudah dikonfigurasi");
    if (!me.wallet) throw new Error("Hubungkan wallet dulu");
    await inv.mockKyc(me.wallet);
    return "KYC MOCK lolos (simulasi). Platform hanya menyimpan status terikat wallet, bukan KTP/selfie.";
  });
}

/**
 * Beli token. Dengan PSP_MODE=xendit: buat tagihan di payment gateway lalu arahkan investor ke halaman bayar Xendit;
 * token di-mint setelah gateway mengonfirmasi PAID (lihat settlePurchase). Tanpa itu: alur simulasi lama (rupiah simulasi, langsung mint).
 */
export async function buy(fd: FormData) {
  if (!xenditConfigured()) {
    return guarded(backOf(fd, "/offering"), async () => {
      const me = await requireInvestor();
      if (!me.wallet) throw new Error("Hubungkan wallet dulu di halaman Portofolio");
      return inv.buy(await getCtx(String(fd.get("s"))), getAddress(me.wallet), Number(fd.get("units")));
    });
  }
  const back = backOf(fd, "/offering");
  const fail = (m: string): never => redirect(`${back}${back.includes("?") ? "&" : "?"}err=${encodeURIComponent(m)}`);
  let url: string;
  try {
    const me = await requireInvestor();
    if (!me.wallet) throw new Error("Wallet Anda belum siap. Buka Portofolio sebentar, lalu coba lagi.");
    const h = await headers();
    const base = process.env.PLATFORM_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    url = (await startPurchase(await getCtx(String(fd.get("s"))), getAddress(me.wallet), Number(fd.get("units")), base)).url;
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    return fail(e?.message ?? String(e));
  }
  redirect(url);
}

/** Refund penuh untuk investor yang membeli di seri yang gagal (token milik wallet akun yang login). */
export async function refund(fd: FormData) {
  return guarded(backOf(fd, "/portfolio"), async () => {
    const me = await requireInvestor();
    if (!me.wallet) throw new Error("Hubungkan wallet dulu");
    return refundHolder(await getCtx(String(fd.get("s"))), getAddress(me.wallet));
  });
}
