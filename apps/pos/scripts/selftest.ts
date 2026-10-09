/**
 * Uji PoS multi-tenant pada company uji TERPISAH (unik per run). Mencakup: sesi, tagihan otomatis, settlement idempoten,
 * hold kedaluwarsa, refund negatif, append-only, rekonsiliasi fraud, Merkle, dan ISOLASI ANTAR COMPANY (termasuk RLS).
 */
import { createClient } from "@supabase/supabase-js";
import type { Hex } from "viem";
import { computeDailyRoot, createSupabasePosSource } from "@venue-rwa/connectors";
import { DEMO_SALT, ZERO_HASH, customerRef, ledgerEntryHash, serviceClient, verifyHashChain } from "@venue-rwa/shared";
import { reconcile } from "@venue-rwa/verification";
import { cancelBooking, createBooking, refundBooking, settlePayment } from "../lib/pos";

const RUN = Date.now().toString(36);
const db = serviceClient("pos");
const ok = (c: boolean, m: string) => { console.log((c ? "✓ " : "✗ ") + m); if (!c) process.exitCode = 1; };
const PW = `Test-${RUN}-pw!`;


/** Uji saja: sisipkan penjualan TANPA settlement PSP (booking fiktif berulang + tunai) untuk menguji rekonsiliasi. */
async function insertUnsettledSales(companyId: string, productId: string) {
  const { data: last } = await db.from("ledger_entries").select("hash").eq("company_id", companyId).order("seq", { ascending: false }).limit(1).maybeSingle();
  let prev = (last?.hash as Hex | undefined) ?? ZERO_HASH;
  const ghost = customerRef("ghost-customer", DEMO_SALT);
  const bookings: any[] = []; const rows: any[] = [];
  for (let i = 0; i < 7; i++) {
    const id = `bk_unsettled_${RUN}_${i}`;
    const slot = new Date(Date.UTC(2032, 0, 1 + i, 3, 30));
    bookings.push({ id, company_id: companyId, product_id: productId, slot_start: slot.toISOString(), slot_end: new Date(slot.getTime() + 3_600_000).toISOString(), status: "completed", customer_ref: i < 5 ? ghost : customerRef(`cash-${i}`, DEMO_SALT), customer_label: "Uji", amount: 250000 });
    const base = { id: `le_unsettled_${RUN}_${i}`, companyId, type: "sale" as const, amount: 250000, bookingId: id, createdAt: new Date().toISOString() };
    const hash = ledgerEntryHash(prev, base);
    rows.push({ id: base.id, company_id: companyId, type: "sale", amount: 250000, booking_id: id, created_at: base.createdAt, prev_hash: prev, hash });
    prev = hash;
  }
  const { error } = await db.from("bookings").insert(bookings); if (error) throw new Error(error.message);
  const { error: le } = await db.from("ledger_entries").insert(rows); if (le) throw new Error(le.message);
}

async function mkCompany(tag: string) {
  const { data: u, error: ue } = await db.auth.admin.createUser({ email: `st-${tag}-${RUN}@selftest.local`, password: PW, email_confirm: true });
  if (ue) throw new Error(ue.message);
  const { data: c, error: ce } = await db.from("companies").insert({ slug: `selftest-${tag}-${RUN}`, name: `Uji ${tag} (SINTETIS)`, synthetic: true }).select("id").single();
  if (ce) throw new Error(ce.message);
  await db.from("members").insert({ company_id: c!.id, user_id: u.user.id, role: "owner", display_name: `Admin ${tag}` });
  const { data: p, error: pe } = await db.from("products").insert({ company_id: c!.id, name: `Basket ${tag}`, category: "basket", open_hour: 7, close_hour: 22, session_minutes: 60, price: 180000, peak_price: 250000, peak_start_hour: 17, peak_end_hour: 21 }).select("id").single();
  if (pe) throw new Error(pe.message);
  return { id: c!.id as string, userId: u.user.id as string, email: `st-${tag}-${RUN}@selftest.local`, productId: p!.id as string };
}

async function main() {
  const A = await mkCompany("a");
  const B = await mkCompany("b");
  const day = new Date(); day.setUTCDate(day.getUTCDate() + 3 + Math.floor(Math.random() * 300));
  const date = new Date(day.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

  // ---- sesi & tagihan otomatis
  const b1 = await createBooking(db, A.id, { productId: A.productId, date, sessionIndex: 11, customerLabel: "Budi" }); // Sesi 11 = 17:00
  ok(b1.amount === 250000 && b1.sessionIndex === 11, `Sesi 11 (17:00) memakai harga peak: ${b1.amount}`);
  const { data: pay1 } = await db.from("payments").select("*").eq("booking_id", b1.bookingId).single();
  ok(pay1?.status === "pending" && pay1.pay_token === b1.payToken && Number(pay1.gross) === 250000, "tagihan terbit otomatis (pending) dengan tautan bayar");
  let dup = ""; try { await createBooking(db, A.id, { productId: A.productId, date, sessionIndex: 11, customerLabel: "X" }); } catch (e: any) { dup = e.message; }
  ok(dup === "Sesi itu sudah dipesan", "sesi ganda ditolak");
  let bad = ""; try { await createBooking(db, A.id, { productId: A.productId, date, sessionIndex: 99, customerLabel: "X" }); } catch (e: any) { bad = e.message; }
  ok(bad.includes("Sesi tidak ada"), "sesi di luar jam operasional ditolak");

  // ---- settlement idempoten
  const s1 = await settlePayment(db, { payToken: b1.payToken });
  ok(!s1.already && s1.amount === 250000, "settlement dari 'webhook' → booking paid");
  const s2 = await settlePayment(db, { pspRef: pay1!.psp_ref });
  ok(s2.already, "settlement kedua idempoten (tidak menggandakan ledger)");
  const src = createSupabasePosSource(db);
  let ea = await src.listEntries(A.id, new Date(0), new Date(Date.now() + 60_000));
  ok(ea.length === 3 && ea.map((e) => e.type).sort().join() === "fee,sale,tax", `ledger 3 entri tepat sekali: ${ea.map((e) => e.type).join(",")}`);

  // ---- hold kedaluwarsa
  const b2 = await createBooking(db, A.id, { productId: A.productId, date, sessionIndex: 2, customerLabel: "Sari" });
  await db.from("payments").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("booking_id", b2.bookingId);
  let exp = ""; try { await settlePayment(db, { payToken: b2.payToken }); } catch (e: any) { exp = e.message; }
  const { data: bk2 } = await db.from("bookings").select("status").eq("id", b2.bookingId).single();
  ok(exp.includes("kedaluwarsa") && bk2?.status === "cancelled", "bayar setelah hold habis ditolak dan booking dibatalkan");

  // ---- refund & cancel & append-only
  await refundBooking(db, A.id, b1.bookingId);
  ea = await src.listEntries(A.id, new Date(0), new Date(Date.now() + 60_000));
  ok(ea.some((e) => e.type === "refund" && e.amount === -250000), "refund = entri NEGATIF baru");
  const b3 = await createBooking(db, A.id, { productId: A.productId, date, sessionIndex: 4, customerLabel: "Andi" });
  await cancelBooking(db, A.id, b3.bookingId);
  const { data: p3 } = await db.from("payments").select("status").eq("booking_id", b3.bookingId).single();
  ok(p3?.status === "failed", "batal booking menutup tagihan");
  ok(!!(await db.from("ledger_entries").delete().eq("company_id", A.id)).error, "DELETE ledger ditolak database");
  ok(!!(await db.from("ledger_entries").update({ amount: 1 }).eq("company_id", A.id)).error, "UPDATE ledger ditolak database");

  // ---- fraud & rekonsiliasi & rantai & root
  await insertUnsettledSales(A.id, A.productId);
  ea = await src.listEntries(A.id, new Date(0), new Date(Date.now() + 60_000));
  ok(verifyHashChain(ea.map((e) => ({ ...e, prevHash: e.prevHash as Hex, hash: e.hash as Hex })), ZERO_HASH) === -1, `rantai hash utuh dari genesis (${ea.length} entri)`);
  const settled = await src.listSettledPayments(A.id, new Date(0), new Date(Date.now() + 86_400_000));
  const { data: bks } = await db.from("bookings").select("id, customer_ref").eq("company_id", A.id);
  const rec = reconcile({ companyId: A.id, entries: ea, settled, customerRefs: new Map((bks ?? []).map((r) => [r.id, r.customer_ref])) });
  const kinds = rec.exceptions.map((e) => e.kind);
  ok(kinds.includes("fictitious_booking") && kinds.includes("cash_outside_system"), `rekonsiliasi menangkap fraud: ${kinds.join(", ")}`);
  const today = new Date().toISOString().slice(0, 10);
  const r1 = await computeDailyRoot(db, A.id, today), r2 = await computeDailyRoot(db, A.id, today);
  ok(r1.root === r2.root && r1.count === ea.length, `root harian reprodusibel (${r1.count} entri)`);
  const v = await src.verifyEntry(ea.find((e) => e.type === "sale")!.id);
  ok(v.ok, `bukti Merkle valid (${v.proof.length} langkah)`);

  // ---- ISOLASI ANTAR COMPANY
  let cross = ""; try { await createBooking(db, B.id, { productId: A.productId, date, sessionIndex: 3, customerLabel: "Penyusup" }); } catch (e: any) { cross = e.message; }
  ok(cross.includes("tidak ditemukan"), "company B tidak bisa membooking produk company A");
  await settlePayment(db, { payToken: (await createBooking(db, B.id, { productId: B.productId, date, sessionIndex: 3, customerLabel: "Citra" })).payToken });
  const eb = await src.listEntries(B.id, new Date(0), new Date(Date.now() + 60_000));
  ok(eb.length === 3 && eb[0]!.prevHash === ZERO_HASH, "rantai ledger company B mandiri (mulai dari genesis, tidak tercampur A)");
  ok(ea.every((e) => e.companyId === A.id) && eb.every((e) => e.companyId === B.id), "entri ledger terpisah per company");

  // RLS: login sebagai admin A dengan anon key
  const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { db: { schema: "pos" }, auth: { persistSession: false } });
  const login = await anon.auth.signInWithPassword({ email: A.email, password: PW });
  ok(!login.error, "login Supabase Auth admin A");
  const mine = await anon.from("bookings").select("company_id");
  ok(!mine.error && mine.data!.length > 0 && mine.data!.every((r) => r.company_id === A.id), `RLS: admin A hanya melihat booking company A (${mine.data?.length} baris)`);
  const peek = await anon.from("products").select("id").eq("company_id", B.id);
  ok(!peek.error && peek.data!.length === 0, "RLS: admin A tidak bisa melihat produk company B");
  const peekLedger = await anon.from("ledger_entries").select("id").eq("company_id", B.id);
  ok(!peekLedger.error && peekLedger.data!.length === 0, "RLS: admin A tidak bisa melihat ledger company B");
  const write = await anon.from("products").update({ price: 1 }).eq("id", A.productId);
  const { data: still } = await db.from("products").select("price").eq("id", A.productId).single();
  ok(Number(still?.price) === 180000, `RLS: pengguna tidak bisa menulis langsung (${write.error?.message ?? "0 baris terubah"})`);
  const anonOut = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { db: { schema: "pos" }, auth: { persistSession: false } });
  const noAuth = await anonOut.from("bookings").select("id").limit(1);
  ok(!!noAuth.error || (noAuth.data?.length ?? 0) === 0, "tanpa login: tidak ada data terbaca");

  await db.auth.admin.deleteUser(A.userId); await db.auth.admin.deleteUser(B.userId);
}
main().catch((e) => { console.error(e); process.exit(1); });
