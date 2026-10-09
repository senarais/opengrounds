-- 1) KYC nyata via Didit: sesi verifikasi per akun. Platform HANYA menyimpan status (tanpa KTP/selfie/hasil biometrik).
create table if not exists platform.kyc_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references platform.users(id) on delete cascade,
  wallet      text,
  session_id  text not null unique,
  url         text,
  status      text not null default 'Not Started',
  state       text not null default 'pending' check (state in ('pending','review','verified','rejected','expired')),
  event_id    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists kyc_sessions_user on platform.kyc_sessions (user_id, created_at desc);

-- 2) Connector sistem eksternal (CSV / API): sumber transaksi, referensi eksternal, kunci API per perusahaan
alter table pos.bookings add column if not exists source text not null default 'pos' check (source in ('pos','import','api'));
alter table pos.bookings add column if not exists external_ref text;
create unique index if not exists bookings_external_ref on pos.bookings (company_id, external_ref) where external_ref is not null;

create table if not exists pos.api_keys (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references pos.companies(id) on delete cascade,
  label        text not null,
  prefix       text not null,                    -- 8 karakter pertama (untuk dikenali; kunci utuh tidak disimpan)
  key_hash     text not null unique,             -- sha256 dari kunci
  created_by   uuid,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
alter table pos.api_keys enable row level security;   -- tanpa policy: hanya server (service_role)
grant all on pos.api_keys to service_role;

alter table platform.venues drop constraint if exists venues_data_source_check;
alter table platform.venues add constraint venues_data_source_check check (data_source in ('self_reported','connector','pos'));

-- 3) Perubahan harga = seri pengganti (harga di kontrak immutable): tautan ke seri lama dan masa tunggu
alter type platform.series_status add value if not exists 'Superseded';
alter table platform.series add column if not exists supersedes uuid references platform.series(id);
alter table platform.series add column if not exists open_after timestamptz;
alter table platform.series add column if not exists price_note text;

notify pgrst, 'reload schema';

-- Slot unik hanya berlaku untuk booking PoS; transaksi impor tidak punya slot nyata
drop index if exists pos.bookings_active_slot;
create unique index bookings_active_slot on pos.bookings (product_id, slot_start) where status in ('held','paid','completed') and source = 'pos';
notify pgrst, 'reload schema';
