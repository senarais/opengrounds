import { keccak256, stringToBytes, toHex, type Address, type Hex } from "viem";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AppClient } from "@venue-rwa/shared";
import type { SeriesRef } from "./chain";
import { platformDb } from "./db";
import { friendlyError } from "./operator";

/** Konteks satu seri (satu pengajuan perusahaan). `ref` null bila kontrak seri belum dideploy. */
export interface Ctx {
  pf: AppClient;
  venue: any;
  series: any;
  ref: SeriesRef | null;
  companyId: string | null; // company PoS (null sebelum disetujui)
}

function toCtx(pf: AppClient, venue: any, series: any): Ctx {
  const ref = series.contract_address && series.token_address ? { series: series.contract_address as Address, token: series.token_address as Address } : null;
  return { pf, venue, series, ref, companyId: venue.pos_company_id ?? null };
}

/** Ambil konteks seri berdasarkan id; tanpa id → seri terbaru yang sudah punya kontrak. */
export async function getCtx(seriesId?: string | null): Promise<Ctx> {
  const pf = platformDb();
  let q = pf.from("series").select("*");
  q = seriesId ? q.eq("id", seriesId) : q.not("contract_address", "is", null).order("created_at", { ascending: false }).limit(1);
  const { data } = await q;
  const series = data?.[0];
  if (!series) throw new Error(seriesId ? "Seri tidak ditemukan" : "Belum ada seri yang dideploy");
  const { data: venue } = await pf.from("venues").select("*").eq("id", series.venue_id).single();
  return toCtx(pf, venue, series);
}

/**
 * Konteks untuk halaman staf: tanpa id → pengajuan terbaru (aktif, belum digantikan) MESKI kontraknya belum dideploy.
 * (getCtx tanpa id hanya mengambil seri yang sudah punya kontrak, sehingga operator tidak bisa membuka halaman untuk men-deploy pengajuan pertama.)
 */
export async function getStaffCtx(seriesId?: string | null): Promise<Ctx> {
  if (seriesId) return getCtx(seriesId);
  const { data } = await platformDb().from("series").select("id").neq("status", "Superseded").order("created_at", { ascending: false }).limit(1);
  if (!data?.[0]) throw new Error("Belum ada pengajuan");
  return getCtx(data[0].id);
}

/** Kontrak harus sudah ada untuk aksi on-chain. */
export function chainRef(ctx: Ctx): SeriesRef {
  if (!ctx.ref) throw new Error("Kontrak seri belum dideploy. Deploy dulu dari konsol Operator.");
  return ctx.ref;
}

export function needCompany(ctx: Ctx): string {
  if (!ctx.companyId) throw new Error("Perusahaan belum punya workspace PoS (dibuat saat attestation disetujui).");
  return ctx.companyId;
}

export async function listSeries() {
  const pf = platformDb();
  const { data: series } = await pf.from("series").select("*").neq("status", "Superseded").order("created_at", { ascending: false });
  const { data: venues } = await pf.from("venues").select("id, name, status, pos_company_id, data_source");
  const byId = new Map((venues ?? []).map((v) => [v.id, v]));
  return (series ?? []).map((s) => ({ series: s, venue: byId.get(s.venue_id) as any }));
}

export async function audit(actor: string, action: string, detail: object = {}) {
  await platformDb().from("audit_log").insert({ actor, action, detail });
}

export const refOf = (s: string): Hex => keccak256(toHex(stringToBytes(s)));

/** Bungkus server action: tangkap error → redirect dengan pesan; sukses → revalidate + pesan. `back` boleh memuat query (?s=...). */
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
