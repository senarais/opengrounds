-- PoS (Venue OS): multi-tenant per perusahaan. Semua data memuat company_id; pengguna hanya MEMBACA data perusahaannya (RLS),
-- semua tulis lewat server (service_role) yang menurunkan company_id dari sesi. Ledger append-only dan berantai hash.

create schema if not exists pos;

create type pos.booking_status as enum ('held','paid','cancelled','completed','refunded');
create type pos.payment_status as enum ('pending','settled','failed','expired','refunded');
create type pos.ledger_type    as enum ('sale','refund','fee','tax','chargeback');
create type pos.member_role    as enum ('owner','admin','cashier');

create table pos.companies (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  status      text not null default 'active' check (status in ('pending','active','suspended')),
  synthetic   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table pos.members (
  company_id   uuid not null references pos.companies(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         pos.member_role not null default 'admin',
  display_name text,
  created_at   timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index members_user on pos.members (user_id);

-- Produk = lapangan yang dibooking; sesi = potongan tetap antara jam buka dan tutup.
create table pos.products (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references pos.companies(id) on delete cascade,
  name             text not null,
  category         text not null default 'lainnya',
  open_hour        smallint not null check (open_hour between 0 and 23),
  close_hour       smallint not null check (close_hour between 1 and 24),
  session_minutes  integer  not null check (session_minutes between 15 and 480),
  price            bigint   not null check (price > 0),
  peak_price       bigint   check (peak_price > 0),
  peak_start_hour  smallint check (peak_start_hour between 0 and 23),
  peak_end_hour    smallint check (peak_end_hour between 1 and 24),
  active           boolean  not null default true,
  created_at       timestamptz not null default now(),
  check (close_hour > open_hour),
  check ((peak_price is null) = (peak_start_hour is null) and (peak_price is null) = (peak_end_hour is null))
);
create index products_company on pos.products (company_id);

create table pos.bookings (
  id              text primary key,
  company_id      uuid not null references pos.companies(id) on delete cascade,
  product_id      uuid not null references pos.products(id),
  slot_start      timestamptz not null,
  slot_end        timestamptz not null,
  status          pos.booking_status not null default 'held',
  customer_ref    text not null check (customer_ref ~ '^0x[0-9a-fA-F]{64}$'),  -- hash, bukan data pribadi
  customer_label  text,
  amount          bigint not null check (amount > 0),
  hold_expires_at timestamptz,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  -- Pembayaran wajib lewat gateway; nilai lain hanya untuk riwayat yang diimpor saat onboarding.
  payment_method  text not null default 'gateway' check (payment_method in ('gateway','cash','qris_sendiri')),
  source          text not null default 'pos' check (source in ('pos','import','api')),
  external_ref    text,
  check (slot_end > slot_start)
);
create unique index bookings_active_slot on pos.bookings (product_id, slot_start) where status in ('held','paid','completed') and source = 'pos';
create index bookings_company_time on pos.bookings (company_id, slot_start);
create unique index bookings_external_ref on pos.bookings (company_id, external_ref) where external_ref is not null;

create table pos.payments (
  id           text primary key,
  company_id   uuid not null references pos.companies(id) on delete cascade,
  booking_id   text not null unique references pos.bookings(id),
  psp_ref      text not null unique,
  pay_token    text not null unique,
  status       pos.payment_status not null default 'pending',
  gross        bigint not null check (gross > 0),
  fee          bigint not null default 0 check (fee >= 0),
  expires_at   timestamptz,
  settled_at   timestamptz,
  simulated    boolean not null default true,
  provider     text not null default 'simulated' check (provider in ('simulated','xendit')),
  checkout_url text,
  created_at   timestamptz not null default now()
);
create index payments_company on pos.payments (company_id, status);

create table pos.ledger_entries (
  seq         bigint generated always as identity primary key,
  id          text not null unique,
  company_id  uuid not null references pos.companies(id) on delete cascade,
  type        pos.ledger_type not null,
  amount      bigint not null,
  booking_id  text references pos.bookings(id),
  created_at  timestamptz not null,
  prev_hash   text not null check (prev_hash ~ '^0x[0-9a-fA-F]{64}$'),
  hash        text not null unique check (hash ~ '^0x[0-9a-fA-F]{64}$'),
  check ((type in ('refund','chargeback') and amount < 0) or (type not in ('refund','chargeback')))
);
create index ledger_company_time on pos.ledger_entries (company_id, created_at);
create unique index ledger_chain_unique on pos.ledger_entries (company_id, prev_hash);

create function pos.block_ledger_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'ledger_entries bersifat append-only (% ditolak)', tg_op;
end $$;
create trigger ledger_no_update   before update   on pos.ledger_entries for each row       execute function pos.block_ledger_mutation();
create trigger ledger_no_delete   before delete   on pos.ledger_entries for each row       execute function pos.block_ledger_mutation();
create trigger ledger_no_truncate before truncate on pos.ledger_entries for each statement execute function pos.block_ledger_mutation();

create table pos.approvals (
  id            text primary key,
  company_id    uuid not null references pos.companies(id) on delete cascade,
  entry_id      text not null references pos.ledger_entries(id),
  kind          text not null check (kind in ('discount','void')),
  requested_by  uuid not null,
  approved_by   uuid,
  reason        text not null check (length(reason) > 0),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  check (approved_by is null or approved_by <> requested_by)
);

create table pos.daily_roots (
  company_id    uuid not null references pos.companies(id) on delete cascade,
  date          date not null,
  merkle_root   text not null check (merkle_root ~ '^0x[0-9a-fA-F]{64}$'),
  entry_count   integer not null check (entry_count >= 0),
  anchored_tx   text,
  cosigner_sig  text,
  created_at    timestamptz not null default now(),
  primary key (company_id, date)
);

create table pos.api_keys (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references pos.companies(id) on delete cascade,
  label        text not null,
  prefix       text not null,
  key_hash     text not null unique,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create function pos.is_member(cid uuid) returns boolean language sql stable security definer set search_path = pos, public as $$
  select exists (select 1 from pos.members m where m.company_id = cid and m.user_id = auth.uid())
$$;
