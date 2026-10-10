import { randomBytes } from "node:crypto";
import { slugFor } from "@venue-rwa/shared";
import { platformDb, posDb } from "../db";
import { audit } from "../flow";
import { ownerOfVenue } from "./onboarding";

/**
 * Buat workspace PoS untuk venue yang disetujui: company + owner (akun login yang sama dengan akun platform pemohon),
 * plus produk awal dari daftar lapangan. Idempoten.
 */
export async function provisionPos(venueId: string): Promise<{ companyId: string; created: boolean }> {
  const pf = platformDb();
  const { data: venue } = await pf.from("venues").select("*").eq("id", venueId).single();
  if (venue.pos_company_id) return { companyId: venue.pos_company_id, created: false };
  const { data: owner } = await pf.from("users").select("*").eq("id", await ownerOfVenue(venueId)).single();
  if (!owner?.auth_user_id) throw new Error("The applicant needs a platform login before a PoS workspace can be created.");
  const pos = posDb();
  const { data: company, error } = await pos.from("companies").insert({ slug: slugFor(venue.name, randomBytes(2).toString("hex")), name: venue.name, status: "active", synthetic: false }).select("id").single();
  if (error) throw new Error(`PoS: ${error.message}`);
  const { error: me } = await pos.from("members").insert({ company_id: company!.id, user_id: owner.auth_user_id, role: "owner", display_name: owner.display_name });
  if (me) {
    await pos.from("companies").delete().eq("id", company!.id); // belum ada ledger: aman dihapus
    throw new Error(`PoS: ${me.message}`);
  }
  const facilities: { name: string; sport: string; pricePerHour: number }[] = venue.facilities ?? [];
  if (facilities.length) {
    const { error: pe } = await pos.from("products").insert(facilities.map((f) => ({
      company_id: company!.id, name: f.name, category: f.sport, open_hour: venue.open_hour, close_hour: venue.close_hour, session_minutes: 60, price: f.pricePerHour, active: true,
    })));
    if (pe) console.error("PoS: produk awal gagal dibuat:", pe.message);
  }
  await pf.from("venues").update({ pos_company_id: company!.id }).eq("id", venueId);
  await audit("platform", "pos.provision", { entity: "venues", entityId: venueId, after: { companyId: company!.id } });
  return { companyId: company!.id as string, created: true };
}
