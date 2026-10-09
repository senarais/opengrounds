"use server";
import { requireArea } from "@/lib/auth";
import * as f from "@/lib/flows/series";
import { getCtx, guarded } from "@/lib/flow";

const backOf = (fd: FormData) => `/operator?s=${String(fd.get("s"))}`;
const ctxOf = async (fd: FormData) => { await requireArea("operator"); return getCtx(String(fd.get("s"))); };
const idOf = (fd: FormData) => BigInt(String(fd.get("id")));

export async function deploy(fd: FormData) {
  return guarded(backOf(fd), async () => {
    const me = await requireArea("operator");
    const r = await f.deploySeries(await getCtx(String(fd.get("s"))), me.email);
    return `Kontrak seri dideploy: ${r.series.slice(0, 10)}… (token ${r.token.slice(0, 10)}…). Reviewer sekarang bisa membuat attestation.`;
  });
}
export async function openOffering(fd: FormData) { return guarded(backOf(fd), async () => f.openOffering(await ctxOf(fd))); }
export async function closeOffering(fd: FormData) { return guarded(backOf(fd), async () => f.closeOffering(await ctxOf(fd))); }
export async function releaseTranche(fd: FormData) { return guarded(backOf(fd), async () => f.releaseTranche(await ctxOf(fd), Number(fd.get("n")) === 2 ? 2 : 1)); }
export async function finalizePeriod(fd: FormData) { return guarded(backOf(fd), async () => f.finalizePeriod(await ctxOf(fd))); }
export async function reconcilePeriod(fd: FormData) { return guarded(backOf(fd), async () => f.reconcilePeriod(await ctxOf(fd))); }
export async function approveRedeem(fd: FormData) { return guarded(backOf(fd), async () => f.approveRedeem(await ctxOf(fd), idOf(fd))); }
export async function confirmRedeem(fd: FormData) { return guarded(backOf(fd), async () => f.confirmRedeem(await ctxOf(fd), idOf(fd))); }
export async function failRedeem(fd: FormData) { return guarded(backOf(fd), async () => f.failRedeem(await ctxOf(fd), idOf(fd))); }
export async function endTenor(fd: FormData) { return guarded(backOf(fd), async () => f.endTenor(await ctxOf(fd))); }
export async function confirmClean(fd: FormData) { return guarded(backOf(fd), async () => f.confirmPeriodClean(await ctxOf(fd))); }
