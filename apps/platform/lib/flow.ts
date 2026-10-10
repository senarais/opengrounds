import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Address } from "viem";
import { platformDb } from "./db";
import { friendlyError } from "./operator";

export type Account = "escrow" | "spv_pocket" | "spv_capital" | "owner" | "venue_reserve" | "buyback_reserve" | "distribution" | "spv_ops" | "platform_ops";

/** Append-only audit trail. */
export async function audit(actor: string, action: string, a: { entity?: string; entityId?: string; before?: unknown; after?: unknown; detail?: unknown } = {}) {
  await platformDb().from("audit_log").insert({ actor, action, entity: a.entity ?? null, entity_id: a.entityId ?? null, before: a.before ?? null, after: a.after ?? null, detail: a.detail ?? null });
}

/**
 * Buku rekening simulasi (§8.4). Satu gerak uang = beberapa baris bertanda (keluar negatif, masuk positif) dengan ref yang sama.
 * Idempoten per (akun, ref): pemanggilan ulang tidak menggandakan.
 */
export async function moveCash(seriesId: string | null, ref: string, legs: [Account, number][]) {
  const pf = platformDb();
  const { data: existing } = await pf.from("cash_ledger").select("account").eq("ref", ref);
  const done = new Set((existing ?? []).map((r) => r.account));
  const rows = legs.filter(([acc, amt]) => amt !== 0 && !done.has(acc)).map(([account, amount]) => ({ series_id: seriesId, account, amount, ref, simulated: true }));
  if (rows.length) {
    const { error } = await pf.from("cash_ledger").insert(rows);
    if (error) throw new Error(`cash_ledger: ${error.message}`);
  }
}

export async function cashBalance(seriesId: string, account: Account): Promise<number> {
  const { data } = await platformDb().from("cash_ledger").select("amount").eq("series_id", seriesId).eq("account", account);
  return (data ?? []).reduce((a, r) => a + Number(r.amount), 0);
}

export async function getSeries(id: string) {
  const pf = platformDb();
  const { data: series } = await pf.from("series").select("*").eq("id", id).maybeSingle();
  if (!series) throw new Error("Series not found.");
  const { data: venue } = await pf.from("venues").select("*").eq("id", series.venue_id).single();
  return { series, venue, address: series.contract_address as Address | null };
}
export type SeriesCtx = Awaited<ReturnType<typeof getSeries>>;

export function needContract(ctx: SeriesCtx): Address {
  if (!ctx.address) throw new Error("Series contract is not deployed yet.");
  return ctx.address;
}

/** Bungkus server action: tangkap error → redirect dengan pesan; sukses → revalidate + pesan. `back` boleh memuat query. */
export async function guarded(back: string, fn: () => Promise<string | void>): Promise<never> {
  const [path, query = ""] = back.split("?");
  const keep = new URLSearchParams(query);
  keep.delete("ok"); keep.delete("err");
  let ok: string | undefined;
  let err: string | undefined;
  try {
    ok = (await fn()) || undefined;
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    err = friendlyError(e);
  }
  if (err) keep.set("err", err); else if (ok) keep.set("ok", ok);
  revalidatePath(path!);
  const qs = keep.toString();
  redirect(qs ? `${path}?${qs}` : path!);
}

/** Untuk route handler JSON. */
export async function jsonGuard(fn: () => Promise<unknown>) {
  try {
    return Response.json(await fn());
  } catch (e: any) {
    return Response.json({ error: friendlyError(e) }, { status: 400 });
  }
}
