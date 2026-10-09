-- Akses Supabase API ke skema `pos` dan `platform`. WAJIB juga: Dashboard > Project Settings > API > Exposed schemas
-- tambahkan `pos` dan `platform` (atau baris ALTER ROLE di bawah).
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, pos, platform';
notify pgrst, 'reload config';

grant usage on schema pos, platform to anon, authenticated, service_role;
grant all on all tables    in schema pos, platform to service_role;
grant all on all sequences in schema pos, platform to service_role;
grant execute on all functions in schema pos, platform to service_role;
grant execute on function pos.is_member(uuid) to authenticated;
alter default privileges in schema pos, platform grant all on tables    to service_role;
alter default privileges in schema pos, platform grant all on sequences to service_role;

-- RLS aktif di SEMUA tabel. Tanpa policy = browser (anon/authenticated) ditolak; server memakai service_role.
do $$
declare r record;
begin
  for r in select schemaname, tablename from pg_tables where schemaname in ('pos', 'platform') loop
    execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);
  end loop;
end $$;

-- PoS: anggota hanya MEMBACA data perusahaannya. Semua tulis lewat server.
grant select on pos.companies, pos.members, pos.products, pos.bookings, pos.payments, pos.ledger_entries, pos.approvals, pos.daily_roots
  to authenticated;
create policy members_self   on pos.members        for select to authenticated using (user_id = auth.uid());
create policy companies_read on pos.companies      for select to authenticated using (pos.is_member(id));
create policy products_read  on pos.products       for select to authenticated using (pos.is_member(company_id));
create policy bookings_read  on pos.bookings       for select to authenticated using (pos.is_member(company_id));
create policy payments_read  on pos.payments       for select to authenticated using (pos.is_member(company_id));
create policy ledger_read    on pos.ledger_entries for select to authenticated using (pos.is_member(company_id));
create policy approvals_read on pos.approvals      for select to authenticated using (pos.is_member(company_id));
create policy roots_read     on pos.daily_roots    for select to authenticated using (pos.is_member(company_id));

notify pgrst, 'reload schema';
