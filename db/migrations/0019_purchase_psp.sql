-- Pembelian investor lewat payment gateway (Xendit Invoice). Token baru di-mint setelah invoice terbukti PAID.
-- Baris lama (alur simulasi) otomatis berstatus 'minted'.
alter table platform.purchases add column if not exists status text not null default 'minted'
  check (status in ('pending','paid','minted','expired','mint_failed'));
alter table platform.purchases add column if not exists status_at timestamptz not null default now();
alter table platform.purchases add column if not exists psp_ref text;
alter table platform.purchases add column if not exists psp_url text;
alter table platform.purchases add column if not exists expires_at timestamptz;
alter table platform.purchases add column if not exists note text;
create unique index if not exists purchases_psp_ref on platform.purchases (psp_ref) where psp_ref is not null;
create index if not exists purchases_wallet_status on platform.purchases (wallet, status);
notify pgrst, 'reload schema';
