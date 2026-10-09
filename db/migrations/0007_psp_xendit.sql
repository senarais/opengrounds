-- Tagihan bisa berasal dari adapter simulasi atau Xendit (test/production). Simpan URL checkout dari PSP.
alter table pos.payments add column if not exists provider text not null default 'simulated' check (provider in ('simulated','xendit'));
alter table pos.payments add column if not exists checkout_url text;
notify pgrst, 'reload schema';
