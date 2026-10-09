import { randomBytes } from "node:crypto";
import { slugFor } from "@venue-rwa/shared";
import { posDb } from "../db";
import { audit, type Ctx } from "../flow";

/**
 * Buat workspace PoS untuk perusahaan yang disetujui: company + owner (akun login yang sama dengan akun platform pemohon).
 * Idempoten: bila workspace sudah ada, tidak membuat ulang.
 */
export async function provisionPos(ctx: Ctx): Promise<{ companyId: string; created: boolean }> {
  if (ctx.companyId) return { companyId: ctx.companyId, created: false };
  const { data: owner } = await ctx.pf.from("users").select("*").eq("id", ctx.venue.owner_id).single();
  if (!owner?.auth_user_id) throw new Error("Pemohon belum punya akun login; workspace PoS tidak bisa dibuat.");
  const pos = posDb();
  const { data: company, error } = await pos.from("companies").insert({ slug: slugFor(ctx.venue.name, randomBytes(2).toString("hex")), name: ctx.venue.name, status: "active", synthetic: false }).select("id").single();
  if (error) throw new Error(`PoS: ${error.message}`);
  const { error: me } = await pos.from("members").insert({ company_id: company!.id, user_id: owner.auth_user_id, role: "owner", display_name: owner.display_name });
  if (me) {
    await pos.from("companies").delete().eq("id", company!.id); // belum ada ledger: aman dihapus
    throw new Error(`PoS: ${me.message}`);
  }
  // produk awal dari daftar lapangan yang diisi owner (bisa diubah di PoS)
  const prof = ctx.venue.disclosure?.public?.profile;
  const facilities: { name: string; sport: string; pricePerHour: number }[] = prof?.facilities ?? [];
  if (facilities.length) {
    const { error: pe } = await pos.from("products").insert(facilities.map((f) => ({
      company_id: company!.id, name: f.name, category: f.sport, open_hour: prof.openHour, close_hour: prof.closeHour, session_minutes: 60, price: f.pricePerHour, active: true,
    })));
    if (pe) console.error("PoS: produk awal gagal dibuat:", pe.message);
  }
  await ctx.pf.from("venues").update({ pos_company_id: company!.id, status: "approved" }).eq("id", ctx.venue.id);
  await audit("platform", "pos.provision", { venue: ctx.venue.name, companyId: company!.id });
  return { companyId: company!.id as string, created: true };
}
