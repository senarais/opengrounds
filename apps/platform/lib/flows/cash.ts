import { platformDb } from "../db";
import { audit, moveCash } from "../flow";
import { activeBankAccount } from "./investor";

/**
 * Saldo investor (§3.6.3): ledger append-only di luar chain. Uangnya ada di rekening distribusi (simulasi), milik investor.
 * Penarikan: Requested → Screened (AML, mock) → Sent → Settled, atau Failed (saldo kembali lewat entri pembalik).
 * Gagal di sisi investor tidak pernah membuat seri Overdue.
 */
export const WITHDRAW_STATUS_LABEL: Record<string, string> = { Requested: "Diajukan", Screened: "Lolos pemeriksaan", Sent: "Dikirim ke bank", Settled: "Sampai di rekening", Failed: "Gagal (saldo dikembalikan)" };

export async function balanceOf(userId: string): Promise<number> {
  const { data } = await platformDb().from("investor_ledger").select("amount").eq("user_id", userId);
  return (data ?? []).reduce((a, r) => a + Number(r.amount), 0);
}

export async function ledgerOf(userId: string, limit = 50) {
  const { data } = await platformDb().from("investor_ledger").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  return data ?? [];
}

export async function withdrawalsOf(userId: string) {
  const { data } = await platformDb().from("withdrawals").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
  return data ?? [];
}

/** Ajukan penarikan ke rekening terdaftar. Saldo langsung didebit (dana ditahan selama proses). */
export async function requestWithdrawal(userId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < 10_000) throw new Error("Minimal penarikan Rp10.000");
  const bank = await activeBankAccount(userId);
  if (!bank) throw new Error("Daftarkan rekening bank atas nama Anda dulu");
  if (bank.status === "cooling_off") throw new Error(`Rekening baru diganti; penarikan dibuka ${new Date(bank.cooling_until).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`);
  if ((await balanceOf(userId)) < amount) throw new Error("Saldo tidak cukup");
  const pf = platformDb();
  const { data: w, error } = await pf.from("withdrawals").insert({ user_id: userId, bank_account_id: bank.id, amount, status: "Requested" }).select("id").single();
  if (error) throw new Error(error.message);
  await pf.from("investor_ledger").insert({ user_id: userId, kind: "withdrawal", amount: -amount, ref: `withdrawal:${w!.id}` });
  await audit(userId, "withdrawal.request", { entity: "withdrawals", entityId: w!.id, after: { amount } });
  // demo: pemeriksaan AML dan pengiriman disimulasikan langsung (berlabel); operator dapat menandai gagal
  await advanceWithdrawal(w!.id, "platform");
  return w!.id as string;
}

/** Majukan satu langkah (disbursement ke Xendit bila aktif, atau mock). */
export async function advanceWithdrawal(id: string, actor: string) {
  const pf = platformDb();
  const { data: w } = await pf.from("withdrawals").select("*, investor_bank_accounts(*)").eq("id", id).single();
  let psp_ref = w.psp_ref ?? `mock_disb_${id.slice(0, 8)}`;
  
  if (w.status === "Requested" && process.env.XENDIT_SECRET_KEY) {
    const auth = "Basic " + Buffer.from(`${process.env.XENDIT_SECRET_KEY}:`).toString("base64");
    const bankData = Array.isArray(w.investor_bank_accounts) ? w.investor_bank_accounts[0] : w.investor_bank_accounts;
    const res = await fetch("https://api.xendit.co/disbursements", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        external_id: `withdraw-${id}`,
        amount: w.amount,
        bank_code: "BCA", // Mocked to BCA for testing
        account_holder_name: bankData?.holder_name || "John Doe",
        account_number: bankData?.account_number || "1234567890",
        description: "Penarikan Dana Portofolio"
      })
    });
    if (res.ok) {
      const data = await res.json();
      psp_ref = data.id;
    } else {
      console.error("Xendit disbursement failed", await res.text());
    }
  }

  const next: Record<string, string> = { Requested: "Screened", Screened: "Sent", Sent: "Settled" };
  let status = w.status as string;
  while (next[status]) {
    status = next[status]!;
    await pf.from("withdrawals").update({ status, psp_ref, updated_at: new Date().toISOString() }).eq("id", id);
    if (status === "Settled") await moveCash(null, `withdrawal-${id}`, [["distribution", -Number(w.amount)]]);
  }
  await audit(actor, "withdrawal.settled", { entity: "withdrawals", entityId: id });
}

/** Tandai gagal (rekening salah, ditolak bank, hit AML): saldo dikembalikan lewat entri pembalik. */
export async function failWithdrawal(id: string, actor: string, reason: string) {
  const pf = platformDb();
  const { data: w } = await pf.from("withdrawals").select("*").eq("id", id).single();
  if (!w || w.status === "Failed") throw new Error("Penarikan tidak bisa ditandai gagal");
  await pf.from("withdrawals").update({ status: "Failed", failure_reason: reason, updated_at: new Date().toISOString() }).eq("id", id);
  await pf.from("investor_ledger").insert({ user_id: w.user_id, kind: "withdrawal_reversal", amount: Number(w.amount), ref: `withdrawal-reversal:${id}` });
  if (w.status === "Settled") await moveCash(null, `withdrawal-reversal-${id}`, [["distribution", Number(w.amount)]]);
  await audit(actor, "withdrawal.failed", { entity: "withdrawals", entityId: id, before: { status: w.status }, after: { reason } });
}
