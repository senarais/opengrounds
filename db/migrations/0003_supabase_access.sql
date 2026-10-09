-- Akses Supabase API (supabase-js) ke skema kustom `pos` dan `platform`.
-- WAJIB juga: Dashboard > Project Settings > API > "Exposed schemas" tambahkan `pos` dan `platform`
-- (atau jalankan 2 baris ALTER ROLE di bawah, lalu NOTIFY).

-- 1) expose lewat PostgREST
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, pos, platform';
notify pgrst, 'reload config';

-- 2) izin skema
grant usage on schema pos, platform to anon, authenticated, service_role;

-- 3) service_role (kunci server) boleh semuanya; RLS dilewati oleh service_role
grant all on all tables    in schema pos, platform to service_role;
grant all on all sequences in schema pos, platform to service_role;
grant execute on all functions in schema pos, platform to service_role;
alter default privileges in schema pos, platform grant all on tables    to service_role;
alter default privileges in schema pos, platform grant all on sequences to service_role;

-- 4) RLS aktif di SEMUA tabel: tanpa policy = anon/authenticated ditolak
do $$
declare r record;
begin
  for r in select schemaname, tablename from pg_tables where schemaname in ('pos','platform') loop
    execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);
  end loop;
end $$;

-- 5) anon hanya boleh BACA data publik/demo (penawaran, venue sintetis, root harian)
grant select on pos.venues, pos.courts, pos.daily_roots, platform.series to anon, authenticated;

create policy anon_read_pos_venues  on pos.venues       for select to anon, authenticated using (true);
create policy anon_read_pos_courts  on pos.courts       for select to anon, authenticated using (true);
create policy anon_read_daily_roots on pos.daily_roots  for select to anon, authenticated using (true);
-- hanya seri yang sudah dipublikasikan ke investor
create policy anon_read_series on platform.series for select to anon, authenticated
  using (status in ('Offering','Funded','Active','Closed','Failed'));

-- Tidak ada policy tulis untuk anon/authenticated: semua tulis lewat server (service_role).
-- Tabel sensitif (kyc_status, purchases, redeem_requests, custody_ledger, audit_log, ledger_entries, payments)
-- sengaja TANPA policy => tidak terbaca dari browser.
