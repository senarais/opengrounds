-- Alur pengajuan owner: akun login, status pengajuan, data yang dilaporkan owner, seri per perusahaan.

-- Bersihkan sisa demo lama: satu kontrak hanya boleh dimiliki satu seri (pertahankan yang terbaru).
-- Baris yang sudah punya data turunan (verifikasi, attestation, pembelian, dst.) TIDAK dihapus.
delete from platform.series s
 using platform.series k
 where s.contract_address is not null
   and lower(s.contract_address) = lower(k.contract_address)
   and s.created_at < k.created_at
   and not exists (select 1 from platform.verification_runs  x where x.series_id = s.id)
   and not exists (select 1 from platform.attestations       x where x.series_id = s.id)
   and not exists (select 1 from platform.purchases          x where x.series_id = s.id)
   and not exists (select 1 from platform.pool_periods       x where x.series_id = s.id)
   and not exists (select 1 from platform.redeem_requests    x where x.series_id = s.id)
   and not exists (select 1 from platform.recon_exceptions   x where x.series_id = s.id)
   and not exists (select 1 from platform.custody_ledger     x where x.series_id = s.id);
-- venue tanpa seri dan tanpa dokumen (sisa dari baris yang baru dihapus)
delete from platform.venues v
 where not exists (select 1 from platform.series x where x.venue_id = v.id)
   and not exists (select 1 from platform.documents x where x.venue_id = v.id);

-- Akun platform terhubung ke Supabase Auth (pengguna yang sama juga bisa login ke PoS setelah disetujui).
alter table platform.users add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
alter table platform.users add column if not exists email text;
alter type platform.party_role add value if not exists 'operator';

-- Pengajuan baru belum punya workspace PoS (dibuat saat disetujui)
alter table platform.venues alter column pos_company_id drop not null;

-- Siklus pengajuan: applied → verifying → approved (attestation valid + akun PoS dibuat) → active (penawaran dibuka)
alter table platform.venues add column if not exists status text not null default 'applied'
  check (status in ('applied','verifying','approved','rejected','active'));
alter table platform.venues add column if not exists company_info jsonb;        -- kota, jenis olahraga, jumlah lapangan, dst.
alter table platform.venues add column if not exists reported_revenue jsonb;    -- omzet bulanan yang DILAPORKAN owner (belum terverifikasi gateway)
alter table platform.venues add column if not exists data_source text not null default 'self_reported'
  check (data_source in ('self_reported','pos'));                               -- 'pos' = diverifikasi dari data PoS/gateway

-- Seri per perusahaan (kontrak dideploy per pengajuan)
alter table platform.series add column if not exists name text;
alter table platform.series add column if not exists token_symbol text check (char_length(token_symbol) <= 5);
alter table platform.series add column if not exists deployed_tx text;
create unique index if not exists series_contract_unique on platform.series (lower(contract_address)) where contract_address is not null;

alter table platform.verification_runs add column if not exists data_source text not null default 'pos';

-- Dokumen yang diunggah owner (file di Supabase Storage bucket `documents`, privat)
alter table platform.documents add column if not exists original_name text;
alter table platform.documents add column if not exists size_bytes bigint;

-- Halaman penawaran (disclosure pack): isi lengkap disimpan, hash-nya masuk evidenceRoot attestation
alter table platform.venues add column if not exists disclosure jsonb;
alter table platform.venues add column if not exists disclosure_hash text;
alter table platform.verification_runs add column if not exists disclosure_hash text;
alter table platform.documents drop constraint if exists documents_kind_check;
alter table platform.documents add constraint documents_kind_check
  check (kind in ('lease','bank_statement','loan','covenant','consent_letter','tax','license','insurance','photo','other'));

-- Exception rekonsiliasi merujuk company PoS (bukan venue)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='platform' and table_name='recon_exceptions' and column_name='pos_venue_id') then
    alter table platform.recon_exceptions rename column pos_venue_id to pos_company_id;
  end if;
end $$;

notify pgrst, 'reload schema';
