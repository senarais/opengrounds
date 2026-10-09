-- Catatan kirim token antar pemegang ber-KYC (sumber kebenaran tetap event on-chain TokensMoved; tabel ini untuk tampilan).
create table if not exists platform.token_transfers (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid not null references platform.series(id) on delete cascade,
  from_wallet text not null,
  to_wallet   text not null,
  units       bigint not null check (units > 0),
  tx          text,
  created_at  timestamptz not null default now()
);
create index if not exists token_transfers_series on platform.token_transfers (series_id, created_at desc);
alter table platform.token_transfers enable row level security;   -- tanpa policy: hanya server
grant all on platform.token_transfers to service_role;
notify pgrst, 'reload schema';
