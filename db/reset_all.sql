-- RESET TOTAL (hanya untuk lingkungan demo/uji!). Menghapus SEMUA data aplikasi dan SEMUA akun login.
--   * PoS: perusahaan, anggota, produk, booking, tagihan, ledger, hash harian
--   * Platform: pengajuan, seri, verifikasi, attestation (catatan DB), pembelian, kantong, redeem, dokumen (catatan), KYC mock, log audit
--   * Akun login (Supabase Auth): owner, staf, admin PoS
-- TIDAK menghapus: kontrak di blockchain (tidak bisa dihapus), file di Storage (pakai `pnpm --filter @venue-rwa/platform reset:storage`).
-- Ledger append-only dijaga trigger; reset mematikannya sementara di dalam transaksi ini.
begin;

alter table pos.ledger_entries disable trigger user;
truncate pos.approvals, pos.daily_roots, pos.payments, pos.ledger_entries, pos.bookings, pos.products, pos.members, pos.companies cascade;
alter table pos.ledger_entries enable trigger user;

truncate platform.audit_log, platform.custody_ledger, platform.recon_exceptions, platform.redeem_requests,
         platform.pool_periods, platform.purchases, platform.attestations, platform.verification_runs,
         platform.series, platform.documents, platform.venues, platform.kyc_status, platform.users cascade;

delete from auth.users;

commit;
