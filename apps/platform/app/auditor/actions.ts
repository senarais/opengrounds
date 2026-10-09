"use server";
import { requireArea } from "@/lib/auth";
import { computeMissingRoots, explainException } from "@/lib/flows/series";
import { getCtx, guarded } from "@/lib/flow";

const backOf = (fd: FormData) => `/auditor?s=${String(fd.get("s"))}`;
const ctxOf = async (fd: FormData) => { await requireArea("auditor"); return getCtx(String(fd.get("s"))); };

export async function computeRoots(fd: FormData) { return guarded(backOf(fd), async () => computeMissingRoots(await ctxOf(fd))); }

export async function explain(fd: FormData) {
  return guarded(backOf(fd), async () => {
    const me = await requireArea("auditor");
    return explainException(await getCtx(String(fd.get("s"))), String(fd.get("id")), me.email, String(fd.get("explanation") ?? ""));
  });
}
