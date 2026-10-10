/**
 * Katalog data: satu sumber kebenaran untuk "apa yang kami minta, untuk apa, siapa yang melihat, dan ke mana perginya".
 * Dipakai oleh form pengajuan (catatan per bagian) dan halaman /kebijakan-data. Isi HARUS mencerminkan perilaku kode yang sebenarnya.
 */
export type Visibility = "public" | "kyc_investor" | "staff" | "owner_only" | "never";

export interface DataItem {
  id: string;
  label: string;
  purpose: string;
  /** Siapa yang boleh melihat. */
  visibility: Visibility;
  /** Dikirim ke model AI? "teks diredaksi" = hanya teks dokumen setelah NIK/rekening/telepon/email disamarkan. */
  ai: "tidak" | "teks diredaksi";
  where: string;
  /** Wajib untuk pengajuan, atau opsional. */
  required: boolean;
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: "Public",
  kyc_investor: "KYC-verified investors & staff",
  staff: "Verification staff only",
  owner_only: "Owner & their PoS team",
  never: "Not stored by Open Grounds",
};

export const DATA_CATALOG: DataItem[] = [
  { id: "venue_photos", label: "Submitted venue photos and attributed demo illustrations", purpose: "Show the submitted venue. Demo reference images are labeled and are not venue evidence.", visibility: "public", ai: "tidak", where: "Product/review gallery; private storage with signed photo links lasting one hour", required: false },
  { id: "profile", label: "Venue profile: name, city, province, sports, courts, dimensions, surface, rates, hours, use of proceeds", purpose: "Help investors assess venue capacity and revenue context.", visibility: "public", ai: "tidak", where: "Product page; profile hash is bound to ACQUISITION_CLOSED attestation", required: true },
  { id: "financial_summary", label: "Monthly financial summary: gross revenue, distributable net profit (D), digital payment share", purpose: "D12 is used in valuation; inputs and outputs are disclosed to investors (PRD §4.1).", visibility: "public", ai: "tidak", where: "Product page", required: true },
  { id: "valuation", label: "Valuation: reviewer-entered asset value, D12, r, V, implied yield, X, token supply, reference price", purpose: "Explain how the reference price is calculated.", visibility: "public", ai: "tidak", where: "Product page + contract (valuation, supply, and reference price)", required: true },
  { id: "land_public", label: "Land status: self-owned, title type, and whether pledged · no certificate number", purpose: "Only self-owned land qualifies; disclose encumbrance risk.", visibility: "public", ai: "tidak", where: "Product page", required: true },
  { id: "address", label: "Exact venue address", purpose: "Help confirm the venue exists without disclosing its precise address publicly.", visibility: "kyc_investor", ai: "tidak", where: "Product page · KYC-verified investors", required: true },
  { id: "periods", label: "Monthly waterfall: gross revenue, refunds, expenses, tax, fees, reserves, D, per-token distribution", purpose: "Investors can inspect figures signed by the platform and owner; the contract recalculates them.", visibility: "public", ai: "tidak", where: "Product page + contract (waterfall figures and evidence hash)", required: false },
  { id: "venue_ledger", label: "Venue PoS ledger entries: time, type, amount, payment settlement status", purpose: "Period revenue source, reconcilable to on-chain evidence hashes.", visibility: "staff", ai: "tidak", where: "pos.ledger_entries; customer identities are not stored, only hashes", required: false },
  { id: "documents", label: "KYB documents: company deed, NIB, NPWP, land title, permits, statements, financials, tax, debt, insurance", purpose: "Evidence for human reviewers and advisory AI extraction/cross-checks.", visibility: "staff", ai: "teks diredaksi", where: "Private storage; signed links expire after five minutes; venue photos may be public", required: true },
  { id: "identity", label: "Company identity: legal name, NIB, NPWP, deed, KBLI, directors, commissioners, signatory, contacts", purpose: "KYB checks the business and authorized representatives.", visibility: "staff", ai: "tidak", where: "platform.organizations · server access only", required: true },
  { id: "ubo", label: "Beneficial owners at 25% or more: name, ownership share, national ID · masked to last four digits", purpose: "KYB/AML identifies who controls the business.", visibility: "staff", ai: "tidak", where: "platform.beneficial_owners", required: true },
  { id: "land", label: "Land title details: number, holder, title type, mortgage status, building permits", purpose: "Verify self-owned land and assess encumbrance risk.", visibility: "staff", ai: "teks diredaksi", where: "platform.venue_land", required: true },
  { id: "finance", label: "Financial and debt details: monthly waterfall inputs, bank credits, outstanding debt, lender, covenants", purpose: "Calculate D12 and assess claims on venue profit.", visibility: "staff", ai: "tidak", where: "platform.venue_financials, platform.organizations.debt", required: true },
  { id: "payout", label: "Owner payout account: bank, account holder, account number · masked and hashed", purpose: "Receive acquisition funds and daily payment splits; holder name must match the business.", visibility: "staff", ai: "tidak", where: "platform.owner_bank_accounts", required: true },
  { id: "investor", label: "Investor account: email, Privy wallet address, KYC status", purpose: "Link tokens to one investor account and wallet. Only allowlist status reaches chain.", visibility: "staff", ai: "tidak", where: "platform.users, platform.kyc_records", required: true },
  { id: "kyc_name", label: "Investor full name from KYC", purpose: "Match the bank account holder with the verified investor before the first purchase.", visibility: "staff", ai: "tidak", where: "platform.kyc_records", required: true },
  { id: "investor_bank", label: "Investor bank account: bank, holder, masked/hashed number, name match, replacement hold", purpose: "Withdrawals go only to an account held by the investor.", visibility: "staff", ai: "tidak", where: "platform.investor_bank_accounts", required: true },
  { id: "investor_ledger", label: "Investor balance and activity: distributions, withdrawals, reinvestments, buybacks", purpose: "Track the investor’s simulated distribution-account balance.", visibility: "staff", ai: "tidak", where: "platform.investor_ledger · append-only; investors see their own entries", required: true },
  { id: "kyc", label: "Investor identity documents · national ID and selfie", purpose: "Identity verification is performed by Didit. Open Grounds does not store these documents.", visibility: "never", ai: "tidak", where: "KYC provider only; platform receives status and name", required: true },
  { id: "customers", label: "Venue PoS customer data", purpose: "PoS stores only a hashed reference and short label to prevent fictitious bookings.", visibility: "owner_only", ai: "tidak", where: "PoS · isolated by company", required: false },
  { id: "onchain", label: "On-chain data: wallet addresses, allowlist/freeze status, token lots, waterfall figures, evidence hashes", purpose: "The chain enforces rules. Names, IDs, bank accounts, and documents never go on-chain.", visibility: "public", ai: "tidak", where: "Sepolia · public and permanent", required: true },
];

export const itemsFor = (...ids: string[]) => DATA_CATALOG.filter((d) => ids.includes(d.id));
