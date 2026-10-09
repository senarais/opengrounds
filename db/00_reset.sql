-- RESET TOTAL (lingkungan demo/uji saja). Menghapus SEMUA data aplikasi, skema `pos` dan `platform`, dan SEMUA akun login.
-- Tidak menghapus: kontrak di blockchain, file di Storage (pakai `pnpm --filter @venue-rwa/platform reset:storage`).
-- Urutan setup dari nol: 00_reset.sql → 01_pos.sql → 02_platform.sql → 03_access.sql.
begin;
drop schema if exists platform cascade;
drop schema if exists pos cascade;
delete from auth.users;
commit;
