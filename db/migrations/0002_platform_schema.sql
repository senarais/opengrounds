-- Platform tokenisasi. Tidak menyimpan KTP/selfie/data pribadi investor: hanya status KYC terikat wallet.

create schema if not exists platform;

create type platform.series_status as enum
  ('Draft','Verifying','Attested','Offering','Funded','Failed','Active','Closed');
create type platform.party_role as enum ('owner','investor','reviewer','auditor');

create table platform.users (
  id          uuid primary key default gen_random_uuid(),
  role        platform.party_role not null,
  display_name text not null,
  wallet      text check (wallet ~ '^0x[0-9a-fA-F]{40}$'),
  created_at  timestamptz not null default now()
);
create unique index users_wallet_unique on platform.users (lower(wallet)) where wallet is not null;

create table platform.kyc_status (
  wallet      text primary key check (wallet ~ '^0x[0-9a-fA-F]{40}$'),
  status      text not null check (status in ('pending','verified','rejected')),
  tier        smallint not null default 0,
  verified_at timestamptz,
  simulated   boolean not null default true,            -- demo: KYC mock, wajib berlabel
  vendor_ref  text                                      -- referensi vendor, bukan data identitas
);

create table platform.venues (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references platform.users(id),
  pos_venue_id text not null,                           -- id di Venue OS / connector
  name         text not null,
  sport        text not null,
  synthetic    boolean not null default false,
  created_at   timestamptz not null default now()
);

create table platform.documents (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references platform.venues(id),
  kind          text not null check (kind in ('lease','bank_statement','loan','covenant','consent_letter','tax','license','insurance','other')),
  storage_path  text not null,
  sha256        text not null,
  synthetic     boolean not null default true,
  uploaded_at   timestamptz not null default now()
);

create table platform.series (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid not null references platform.venues(id),
  status           platform.series_status not null default 'Draft',
  contract_address text check (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  token_address    text check (token_address ~ '^0x[0-9a-fA-F]{40}$'),
  chain_id         integer not null default 11155111,
  target           bigint not null check (target > 0),
  min_raise        bigint not null check (min_raise > 0),   -- Cara 1: gagal bila < min_raise
  unit_price       bigint not null check (unit_price > 0),
  share_bps        integer not null check (share_bps between 1 and 10000),
  tenor_days       integer not null check (tenor_days >= 30),
  related_party_label boolean not null default true,
  use_of_funds     text,                                    -- hanya pengungkapan, tidak dienforce
  created_at       timestamptz not null default now(),
  check (min_raise <= target),
  check (unit_price <= target)
);

create table platform.verification_runs (
  id             uuid primary key default gen_random_uuid(),
  series_id      uuid not null references platform.series(id),
  score          integer not null check (score between 0 and 10000),
  recommendation text not null check (recommendation in ('pass','fail')),
  gates          jsonb not null,                            -- hasil gerbang pass/fail deterministik
  evidence_root  text not null,
  ruleset_hash   text not null,
  reference_price bigint,
  max_price      bigint,
  created_at     timestamptz not null default now()
);

create table platform.attestations (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid not null references platform.series(id),
  run_id        uuid references platform.verification_runs(id),
  verdict       text not null check (verdict in ('pass','fail')),
  nonce         bigint not null,
  expiry        timestamptz not null,
  payload       jsonb not null,
  signatures    jsonb not null default '[]'::jsonb,         -- [{signer, sig}]
  submitted_tx  text,
  revoked_tx    text,
  created_at    timestamptz not null default now(),
  unique (series_id, nonce)
);

create table platform.purchases (
  id              uuid primary key default gen_random_uuid(),
  series_id       uuid not null references platform.series(id),
  wallet          text not null check (wallet ~ '^0x[0-9a-fA-F]{40}$'),
  units           bigint not null check (units > 0),
  amount          bigint not null check (amount > 0),
  payment_ref     text not null unique,
  related_party   boolean not null default false,           -- tidak dihitung ke min_raise
  simulated       boolean not null default true,
  custody_confirmed_at timestamptz,
  mint_tx         text,
  created_at      timestamptz not null default now()
);

create table platform.pool_periods (
  series_id     uuid not null references platform.series(id),
  period_id     bigint not null,
  pending_amount bigint not null default 0,                 -- akrual real-time (belum final)
  final_amount  bigint,                                     -- diposting setelah settlement + jendela refund
  report_hash   text,
  posted_tx     text,
  reconciled    boolean,
  primary key (series_id, period_id)
);

create table platform.redeem_requests (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid not null references platform.series(id),
  onchain_id    bigint,
  wallet        text not null check (wallet ~ '^0x[0-9a-fA-F]{40}$'),
  units         bigint not null check (units > 0),
  payout        bigint,
  status        text not null default 'pending' check (status in ('pending','approved','paid','failed','cancelled')),
  simulated     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table platform.recon_exceptions (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid references platform.series(id),
  pos_venue_id text not null,
  date        date not null,
  kind        text not null check (kind in ('unexplained_gap','cash_outside_system','fictitious_booking','hash_chain_broken')),
  amount      bigint not null,
  explained   boolean not null default false,
  note        text,
  created_at  timestamptz not null default now()
);

create table platform.custody_ledger (                      -- kustodian SIMULASI (mode A)
  id          bigint generated always as identity primary key,
  series_id   uuid not null references platform.series(id),
  account     text not null check (account in ('escrow','investor_pool','owner','redeem_payout','refund')),
  amount      bigint not null,
  ref         text,
  simulated   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table platform.audit_log (
  id          bigint generated always as identity primary key,
  actor       text not null,
  action      text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index purchases_series on platform.purchases (series_id);
create index recon_exceptions_open on platform.recon_exceptions (pos_venue_id, date) where not explained;
