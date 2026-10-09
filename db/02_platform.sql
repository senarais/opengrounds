-- Platform Open Grounds (PRD v4.1 §8.5). Semua akses lewat server (service_role); tabel di sini tanpa policy untuk browser.
-- Prinsip: data pribadi tidak pernah ke chain; ledger dan audit append-only (koreksi lewat entri pembalik); rupiah
-- disimulasikan di `cash_ledger` per rekening (§8.4) dan dilabeli di UI.

create schema if not exists platform;

create type platform.party_role as enum ('owner', 'investor', 'operator', 'reviewer', 'spv');
create type platform.kyb_status as enum
  ('DRAFT', 'SUBMITTED', 'AUTOMATED_CHECK', 'NEEDS_INFO', 'IN_REVIEW', 'APPROVED', 'REJECTED');
create type platform.series_status as enum
  ('Draft', 'Verified', 'Active', 'Disputed', 'Overdue', 'Defaulted', 'Liquidating', 'Closed');

-- ---------------------------------------------------------------- akun
create table platform.users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  email         text,
  role          platform.party_role not null,
  display_name  text not null,
  wallet        text check (wallet ~ '^0x[0-9a-fA-F]{40}$'),     -- dompet Privy (owner dan investor)
  created_at    timestamptz not null default now()
);
create unique index users_wallet_unique on platform.users (lower(wallet)) where wallet is not null;

create table platform.staff_invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  display_name text not null,
  role         text not null check (role in ('operator', 'reviewer', 'spv')),
  token_hash   text not null unique,
  invited_by   text not null,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- organisasi dan venue (KYB)
create table platform.organizations (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null references platform.users(id),
  legal_name         text not null,
  nib                text not null,
  npwp               text not null,
  deed_number        text not null,
  deed_date          date not null,
  registered_address text not null,
  kbli               text not null,
  directors          jsonb not null default '[]',      -- [{name, title}]
  commissioners      jsonb not null default '[]',
  signatory_name     text not null,
  signatory_title    text not null,
  contact_email      text not null,
  contact_phone      text not null,
  debt               jsonb not null default '{}',   -- {outstanding, monthlyInstallment, lender, covenantRestricts} (sensitif)
  created_at         timestamptz not null default now()
);

-- Pemilik manfaat ≥25% (identitas disamarkan; dokumen identitas tidak disimpan di tabel ini)
create table platform.beneficial_owners (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references platform.organizations(id) on delete cascade,
  full_name       text not null,
  ownership_pct   numeric(5, 2) not null check (ownership_pct > 0 and ownership_pct <= 100),
  id_number_masked text,
  created_at      timestamptz not null default now()
);

create table platform.venues (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references platform.organizations(id),
  name            text not null,
  sports          text[] not null,
  address         text not null,
  city            text not null,
  province        text not null,
  lat             numeric(9, 6),
  lng             numeric(9, 6),
  courts          integer not null check (courts > 0),
  open_hour       smallint not null check (open_hour between 0 and 23),
  close_hour      smallint not null check (close_hour between 1 and 24),
  facilities      jsonb not null default '[]',      -- [{name, sport, lengthM, widthM, surface, indoor, pricePerHour}]
  operating_since date,
  digital_share_pct numeric(5, 2),                  -- porsi pendapatan digital menurut data onboarding (gerbang ≥90%)
  offered_stake_bps integer not null check (offered_stake_bps between 1 and 10000), -- X yang ditawarkan owner
  use_of_funds    text,
  integrations    jsonb not null default '{}',      -- {gatewayOnly, bankDataAccess}
  submitted_by    text,                             -- email pengaju; 'spv:<email>' bila Grounds mengajukan atas nama owner
  public_profile  jsonb,                            -- isi halaman produk publik
  public_profile_hash text,
  pos_company_id  uuid,                             -- workspace PoS (dibuat setelah KYB disetujui)
  created_at      timestamptz not null default now()
);

-- Lahan: gerbang "tanah milik sendiri" (§2.3). Data sensitif, hanya staf.
create table platform.venue_land (
  venue_id           uuid primary key references platform.venues(id) on delete cascade,
  owned              boolean not null,
  right_type         text not null,                 -- SHM, HGB, …
  certificate_number text not null,
  holder_name        text not null,
  encumbered         boolean not null,              -- sedang dijaminkan
  encumbrance_consent boolean not null default false,
  permits            jsonb not null default '[]',
  appraised_value_idr bigint,                       -- V_aset (input reviewer dari dokumen, berlabel)
  created_at         timestamptz not null default now()
);

-- Rekening tujuan owner (sensitif)
create table platform.owner_bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references platform.organizations(id) on delete cascade,
  bank            text not null,
  account_masked  text not null,
  account_hash    text not null,
  holder_name     text not null,
  name_matches    boolean not null,
  created_at      timestamptz not null default now()
);

create table platform.documents (
  id                uuid primary key default gen_random_uuid(),
  venue_id          uuid not null references platform.venues(id) on delete cascade,
  kind              text not null check (kind in (
                      'deed', 'nib', 'npwp', 'land_certificate', 'permit', 'bank_statement', 'financial_report',
                      'sales_data', 'tax', 'debt', 'insurance', 'photo', 'other')),
  storage_path      text not null,
  sha256            text not null,
  original_name     text,
  size_bytes        bigint,
  version           integer not null default 1,
  extraction        jsonb,
  extraction_status text check (extraction_status in ('pending', 'ok', 'partial', 'unreadable', 'failed')),
  extraction_note   text,
  uploaded_at       timestamptz not null default now()
);
create index documents_venue on platform.documents (venue_id);

-- Riwayat keuangan onboarding (12 bulan): sumber D12. `source` menandai asal data.
create table platform.venue_financials (
  venue_id   uuid not null references platform.venues(id) on delete cascade,
  month      date not null,                         -- hari pertama bulan
  gross      bigint not null,
  refunds    bigint not null default 0,
  opex       bigint not null default 0,
  tax        bigint not null default 0,
  operator_fee bigint not null default 0,
  reserve    bigint not null default 0,
  platform_fee bigint not null default 0,
  digital_gross bigint not null default 0,
  bank_credits bigint,                              -- total kredit rekening koran bulan itu (rekonsiliasi)
  source     text not null check (source in ('upload', 'pos', 'import')),
  primary key (venue_id, month)
);

create table platform.kyb_cases (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references platform.venues(id) on delete cascade,
  status        platform.kyb_status not null default 'DRAFT',
  gate_result   jsonb,                              -- hasil gerbang data wajib dan hard-stop
  risk_summary  jsonb,                              -- ringkasan agen indikator risiko (advisory)
  decided_by    text,
  decision_note text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index kyb_cases_venue on platform.kyb_cases (venue_id, created_at desc);

-- Temuan agen AI (kontrak output §8.3/PRD v3 §10.3). Selalu requires_human_review.
create table platform.kyb_findings (
  id                 uuid primary key default gen_random_uuid(),
  case_id            uuid not null references platform.kyb_cases(id) on delete cascade,
  agent              text not null check (agent in ('extraction', 'cross_check', 'reconciliation', 'risk')),
  check_type         text not null,
  finding_code       text not null,
  severity           text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  finding_text       text not null,
  field_paths        text[] not null default '{}',
  source_refs        jsonb not null default '[]',
  verified           boolean not null default false,   -- false = UNVERIFIED (tanpa bukti)
  requires_human_review boolean not null default true check (requires_human_review),
  model_version      text,
  source_sha256      text[],
  disposition        text check (disposition in ('accepted', 'overridden', 'request_info', 'rejected')),
  disposition_reason text,
  disposed_by        text,
  created_at         timestamptz not null default now()
);
create index kyb_findings_case on platform.kyb_findings (case_id);

create table platform.valuations (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references platform.venues(id) on delete cascade,
  v_aset         bigint not null,
  d12            bigint not null,
  r_bps          integer not null,
  v_income       bigint not null,
  v              bigint not null,
  y_bps          integer not null,
  in_band        boolean not null,
  stake_bps      integer not null,
  token_price    bigint not null,
  supply         bigint not null,
  ref_price      bigint not null,
  inputs         jsonb not null,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by     text,
  decision_note  text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- seri dan attestation
create table platform.series (
  id                    uuid primary key default gen_random_uuid(),
  venue_id              uuid not null references platform.venues(id),
  valuation_id          uuid references platform.valuations(id),
  status                platform.series_status not null default 'Draft',
  name                  text not null,
  symbol                text not null check (char_length(symbol) <= 6),
  stake_bps             integer not null,
  spv_fee_bps           integer not null,
  max_opex_bps          integer not null,
  sellback_discount_bps integer not null,
  max_holding_bps       integer not null,
  lock_seconds          integer not null,
  payout_window_seconds integer not null,
  default_grace_seconds integer not null,
  owner_sign_window_seconds integer not null,
  split_bps             integer not null,           -- s: persen omzet ke kantong SPV
  supply                bigint,
  ref_price             bigint,
  valuation_idr         bigint,
  owner_wallet          text,                       -- slot COUNTERPARTY
  spv_approved_by       text,                       -- Grounds (SPV) menyetujui pembelian hak sebelum platform menandatangani
  spv_approved_at       timestamptz,
  spv_note              text,
  contract_address      text unique check (contract_address ~ '^0x[0-9a-fA-F]{40}$'),
  token_address         text check (token_address ~ '^0x[0-9a-fA-F]{40}$'),
  chain_id              integer not null default 11155111,
  deployed_tx           text,
  activated_tx          text,
  created_at            timestamptz not null default now()
);

create table platform.attestations (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid not null references platform.series(id) on delete cascade,
  kind          text not null check (kind in ('ACQUISITION_CLOSED', 'REVENUE_PERIOD', 'VALUATION_UPDATE')),
  ref_id        numeric not null,
  payload       jsonb not null,
  payload_hash  text not null,
  evidence_hash text not null,
  deadline      timestamptz not null,
  signatures    jsonb not null default '[]',        -- [{slot, signer, sig}]
  status        text not null default 'collecting' check (status in ('collecting', 'submitted', 'expired', 'failed')),
  tx_hash       text,
  created_at    timestamptz not null default now(),
  unique (series_id, kind, ref_id)
);

-- ---------------------------------------------------------------- investor
create table platform.kyc_records (
  user_id      uuid primary key references platform.users(id) on delete cascade,
  wallet       text,
  status       text not null check (status in ('pending', 'verified', 'rejected')),
  full_name    text,                                -- untuk pencocokan nama rekening (sensitif)
  provider     text not null check (provider in ('didit', 'mock')),
  vendor_ref   text,
  verified_at  timestamptz,
  updated_at   timestamptz not null default now()
);

create table platform.kyc_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references platform.users(id) on delete cascade,
  wallet      text,
  session_id  text not null unique,
  url         text,
  status      text not null default 'Not Started',
  state       text not null default 'pending' check (state in ('pending', 'review', 'verified', 'rejected', 'expired')),
  event_id    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table platform.investor_bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references platform.users(id) on delete cascade,
  bank           text not null,
  account_masked text not null,
  account_hash   text not null,
  holder_name    text not null,
  name_matches   boolean not null,
  status         text not null check (status in ('verified', 'rejected', 'cooling_off', 'replaced')),
  cooling_until  timestamptz,
  created_at     timestamptz not null default now()
);
create index investor_bank_user on platform.investor_bank_accounts (user_id, created_at desc);

-- Pesanan beli: investor menandatangani (EIP-712) sebelum bayar; dieksekusi on-chain setelah rupiah masuk.
create table platform.orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      bigint generated always as identity unique,   -- orderId on-chain
  series_id     uuid not null references platform.series(id),
  user_id       uuid not null references platform.users(id),
  wallet        text not null,
  tokens        bigint not null check (tokens > 0),
  amount_idr    bigint not null check (amount_idr > 0),
  ref_price     bigint not null,
  funding       text not null check (funding in ('payment', 'balance')),   -- bayar baru atau reinvest dari saldo
  status        text not null default 'AWAITING_SIGNATURE' check (status in
                  ('AWAITING_SIGNATURE', 'AWAITING_PAYMENT', 'PAID', 'ALLOCATED', 'EXPIRED', 'CANCELLED', 'FAILED')),
  signature     text,
  deadline      timestamptz not null,
  psp_ref       text unique,
  psp_url       text,
  paid_at       timestamptz,
  claimed_at    timestamptz,                      -- satu pemanggil yang mengeksekusi allocate (cegah kirim ganda)
  allocated_tx  text,
  note          text,
  status_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index orders_user on platform.orders (user_id, created_at desc);
create index orders_series_status on platform.orders (series_id, status);

-- Saldo investor (rupiah, di luar chain): append-only, koreksi lewat entri pembalik.
create table platform.investor_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references platform.users(id),
  series_id   uuid references platform.series(id),
  kind        text not null check (kind in ('distribution', 'withdrawal', 'withdrawal_reversal', 'reinvest', 'sellback', 'adjustment')),
  amount      bigint not null,
  ref         text not null,
  period_no   integer,
  created_at  timestamptz not null default now(),
  unique (kind, ref)
);
create index investor_ledger_user on platform.investor_ledger (user_id, created_at desc);

create table platform.withdrawals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references platform.users(id),
  bank_account_id uuid not null references platform.investor_bank_accounts(id),
  amount          bigint not null check (amount > 0),
  fee             bigint not null default 0,
  status          text not null default 'Requested' check (status in ('Requested', 'Screened', 'Sent', 'Settled', 'Failed')),
  failure_reason  text,
  psp_ref         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table platform.sellback_requests (
  id           uuid primary key default gen_random_uuid(),
  request_no   bigint generated always as identity unique,   -- requestId on-chain
  series_id    uuid not null references platform.series(id),
  user_id      uuid not null references platform.users(id),
  wallet       text not null,
  tokens       bigint not null check (tokens > 0),
  amount_idr   bigint not null,
  signature    text,
  deadline     timestamptz not null,
  status       text not null default 'AwaitingSignature' check (status in ('AwaitingSignature', 'Queued', 'Executed', 'Cancelled', 'Expired', 'Failed')),
  executed_tx  text,
  note         text,
  created_at   timestamptz not null default now()
);
create index sellback_queue on platform.sellback_requests (series_id, status, created_at);

-- ---------------------------------------------------------------- operasi bulanan
create table platform.revenue_periods (
  id              uuid primary key default gen_random_uuid(),
  series_id       uuid not null references platform.series(id),
  period_no       integer not null,
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  gross           bigint not null,
  refunds         bigint not null,
  opex            bigint not null,
  tax             bigint not null,
  operator_fee    bigint not null,
  reserve         bigint not null,
  platform_fee    bigint not null,
  distributable   bigint not null,
  p_spv           bigint not null,
  f_spv           bigint not null,
  p_inv           bigint not null,
  owed_idr        bigint,
  paid_idr        bigint not null default 0,
  pocket_collected bigint not null default 0,       -- isi kantong SPV dari split harian
  true_up         bigint not null default 0,        -- + kelebihan dikembalikan ke owner, − kekurangan dilengkapi owner
  evidence        jsonb not null,
  evidence_hash   text not null,
  status          text not null default 'awaiting_owner' check (status in ('awaiting_owner', 'disputed', 'posted', 'awaiting_topup', 'paid')),
  owner_deadline  timestamptz,
  topup_psp_ref   text unique,                      -- kekurangan true-up yang dibayar owner lewat gateway
  topup_url       text,
  posted_tx       text,
  payout_root     text,
  payout_tx       text,
  created_at      timestamptz not null default now(),
  unique (series_id, period_no)
);

-- Bukti biaya operasional per periode (dibatasi plafon dan ditinjau reviewer)
create table platform.expense_items (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid not null references platform.series(id),
  period_no     integer not null,
  category      text not null,
  amount        bigint not null check (amount > 0),
  document_id   uuid references platform.documents(id),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by   text,
  note          text,
  created_at    timestamptz not null default now()
);

-- Split di sumber (mock xenPlatform): satu baris per pembayaran booking yang settle
create table platform.split_events (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid not null references platform.series(id),
  pos_payment_id text not null unique,
  gross         bigint not null,
  spv_amount    bigint not null,
  owner_amount  bigint not null,
  settled_at    timestamptz not null,               -- waktu pembayaran booking settle (menentukan periode)
  simulated     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Tagihan MockPaymentProvider (sandbox, berlabel): dipakai bila Xendit tidak dikonfigurasi dan untuk split venue (xenPlatform belum aktif).
create table platform.mock_charges (
  ref          text primary key,
  amount       bigint not null check (amount > 0),
  description  text not null,
  status       text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  expires_at   timestamptz not null,
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- Rekening (§8.4), disimulasikan: setiap gerak uang = baris berpasangan/bertanda di buku yang tepat.
create table platform.cash_ledger (
  id          bigint generated always as identity primary key,
  series_id   uuid references platform.series(id),
  account     text not null check (account in (
                'escrow', 'spv_pocket', 'spv_capital', 'owner', 'venue_reserve', 'buyback_reserve', 'distribution', 'spv_ops', 'platform_ops')),
  amount      bigint not null,
  ref         text not null,
  simulated   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index cash_ledger_series on platform.cash_ledger (series_id, account);

create table platform.disputes (
  id           uuid primary key default gen_random_uuid(),
  series_id    uuid not null references platform.series(id),
  item_ref     text not null,
  item_type    text not null check (item_type in ('period', 'order')),
  reason       text not null,
  raised_by    text not null,
  status       text not null default 'open' check (status in ('open', 'resolved')),
  resolution   text,
  raise_tx     text,
  resolve_tx   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

-- Jejak audit: siapa, apa, sebelum/sesudah. Append-only.
create table platform.audit_log (
  id          bigint generated always as identity primary key,
  actor       text not null,
  action      text not null,
  entity      text,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create function platform.block_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% bersifat append-only (% ditolak)', tg_table_name, tg_op;
end $$;
create trigger investor_ledger_no_update before update or delete on platform.investor_ledger for each row execute function platform.block_mutation();
create trigger cash_ledger_no_update     before update or delete on platform.cash_ledger     for each row execute function platform.block_mutation();
create trigger audit_log_no_update       before update or delete on platform.audit_log       for each row execute function platform.block_mutation();
