-- Venue OS (POS). Postgres. Semua uang = integer rupiah.
-- Dijalankan manual oleh Nuza. Aman diulang? TIDAK (tanpa IF NOT EXISTS pada tipe); jalankan sekali.

create schema if not exists pos;

create type pos.booking_status as enum ('held','paid','cancelled','completed','refunded');
create type pos.payment_status as enum ('pending','settled','failed','refunded');
create type pos.ledger_type as enum ('sale','refund','fee','tax','chargeback');

create table pos.venues (
  id            text primary key,
  name          text not null,
  sport         text not null check (sport in ('futsal','badminton','padel')),
  open_hour     smallint not null check (open_hour between 0 and 23),
  close_hour    smallint not null check (close_hour between 1 and 24),
  synthetic     boolean not null default false,       -- data sintetis wajib berlabel
  created_at    timestamptz not null default now()
);

create table pos.courts (
  id              text primary key,
  venue_id        text not null references pos.venues(id),
  name            text not null,
  peak_price      bigint not null check (peak_price > 0),
  offpeak_price   bigint not null check (offpeak_price > 0),
  peak_start_hour smallint not null default 17,
  peak_end_hour   smallint not null default 22
);

create table pos.bookings (
  id            text primary key,
  court_id      text not null references pos.courts(id),
  slot_start    timestamptz not null,
  slot_end      timestamptz not null,
  status        pos.booking_status not null default 'held',
  customer_ref  text not null check (customer_ref ~ '^0x[0-9a-fA-F]{64}$'),  -- hash, bukan data pribadi
  amount        bigint not null check (amount > 0),
  hold_expires_at timestamptz,                          -- hold 10 menit
  created_at    timestamptz not null default now(),
  check (slot_end > slot_start)
);
-- satu slot aktif per court (held/paid/completed memblokir slot)
create unique index bookings_active_slot
  on pos.bookings (court_id, slot_start)
  where status in ('held','paid','completed');

create table pos.payments (
  id          text primary key,
  booking_id  text not null references pos.bookings(id),
  psp_ref     text not null unique,
  status      pos.payment_status not null default 'pending',
  gross       bigint not null check (gross > 0),
  fee         bigint not null default 0 check (fee >= 0),
  settled_at  timestamptz,
  simulated   boolean not null default true,
  raw_webhook jsonb
);

-- Ledger append-only: hash menyambung ke entri sebelumnya per venue.
create table pos.ledger_entries (
  seq         bigint generated always as identity primary key,
  id          text not null unique,
  venue_id    text not null references pos.venues(id),
  type        pos.ledger_type not null,
  amount      bigint not null,                          -- negatif untuk refund/chargeback
  booking_id  text references pos.bookings(id),
  created_at  timestamptz not null,
  prev_hash   text not null check (prev_hash ~ '^0x[0-9a-fA-F]{64}$'),
  hash        text not null unique check (hash ~ '^0x[0-9a-fA-F]{64}$'),
  check ((type in ('refund','chargeback') and amount < 0) or (type not in ('refund','chargeback')))
);
create index ledger_entries_venue_time on pos.ledger_entries (venue_id, created_at);

create function pos.block_ledger_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'ledger_entries bersifat append-only (% ditolak)', tg_op;
end $$;

create trigger ledger_no_update before update on pos.ledger_entries
  for each row execute function pos.block_ledger_mutation();
create trigger ledger_no_delete before delete on pos.ledger_entries
  for each row execute function pos.block_ledger_mutation();
create trigger ledger_no_truncate before truncate on pos.ledger_entries
  for each statement execute function pos.block_ledger_mutation();

-- Diskon/void butuh persetujuan kedua (requested_by <> approved_by).
create table pos.approvals (
  id            text primary key,
  entry_id      text not null references pos.ledger_entries(id),
  kind          text not null check (kind in ('discount','void')),
  requested_by  text not null,
  approved_by   text,
  reason        text not null check (length(reason) > 0),
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  check (approved_by is null or approved_by <> requested_by)
);

create table pos.daily_roots (
  venue_id      text not null references pos.venues(id),
  date          date not null,
  merkle_root   text not null check (merkle_root ~ '^0x[0-9a-fA-F]{64}$'),
  entry_count   integer not null check (entry_count >= 0),
  anchored_tx   text,
  cosigner_sig  text,
  created_at    timestamptz not null default now(),
  primary key (venue_id, date)
);

comment on table pos.ledger_entries is 'Append-only. Refund = entri negatif baru. Jangan pernah edit entri lama.';
