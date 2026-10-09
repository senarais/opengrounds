-- Patch tanpa reset: menyamakan database yang sudah terlanjur memakai 02_platform.sql versi lama dengan versi terbaru
-- (role reviewer/spv, kolom persetujuan SPV, kolom debt/integrations/submitted_by, tabel mock_charges, dan lainnya).
-- Aman dijalankan berulang. Bila Anda menjalankan 00_reset + 01 + 02 + 03 terbaru, patch ini TIDAK perlu.
do $$ begin
  alter type platform.party_role add value if not exists 'spv';
exception when others then null; end $$;

-- peran lama 'auditor' menjadi 'reviewer'
alter table platform.staff_invites drop constraint if exists staff_invites_role_check;
update platform.staff_invites set role = 'reviewer' where role = 'auditor';
update platform.users set role = 'reviewer' where role::text = 'auditor';
alter table platform.staff_invites add constraint staff_invites_role_check check (role in ('operator', 'reviewer', 'spv'));

alter table platform.series add column if not exists spv_approved_by text;
alter table platform.series add column if not exists spv_approved_at timestamptz;
alter table platform.series add column if not exists spv_note text;
alter table platform.venues add column if not exists submitted_by text;

-- ---------------------------------------------------------------------------------------------
-- Penyesuaian skema yang menyusul setelah 02_platform.sql pertama (aman diulang)
alter table platform.organizations add column if not exists debt jsonb not null default '{}';
alter table platform.venues add column if not exists integrations jsonb not null default '{}';

alter table platform.cash_ledger drop constraint if exists cash_ledger_account_check;
alter table platform.cash_ledger add constraint cash_ledger_account_check check (account in (
  'escrow', 'spv_pocket', 'spv_capital', 'owner', 'venue_reserve', 'buyback_reserve', 'distribution', 'spv_ops', 'platform_ops'));

alter table platform.revenue_periods drop constraint if exists revenue_periods_status_check;
alter table platform.revenue_periods add constraint revenue_periods_status_check check (status in ('awaiting_owner', 'disputed', 'posted', 'awaiting_topup', 'paid'));
alter table platform.revenue_periods alter column status set default 'awaiting_owner';
alter table platform.revenue_periods add column if not exists topup_psp_ref text;
alter table platform.revenue_periods add column if not exists topup_url text;
create unique index if not exists revenue_periods_topup_psp_ref on platform.revenue_periods (topup_psp_ref);

create table if not exists platform.mock_charges (
  ref          text primary key,
  amount       bigint not null check (amount > 0),
  description  text not null,
  status       text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  expires_at   timestamptz not null,
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);
alter table platform.mock_charges enable row level security;
grant all on platform.mock_charges to service_role;

alter table platform.split_events add column if not exists settled_at timestamptz;
update platform.split_events set settled_at = created_at where settled_at is null;
alter table platform.split_events alter column settled_at set not null;

alter table platform.orders add column if not exists claimed_at timestamptz;

alter table platform.sellback_requests alter column signature drop not null;
alter table platform.sellback_requests drop constraint if exists sellback_requests_status_check;
alter table platform.sellback_requests add constraint sellback_requests_status_check check (status in ('AwaitingSignature', 'Queued', 'Executed', 'Cancelled', 'Expired', 'Failed'));
alter table platform.sellback_requests alter column status set default 'AwaitingSignature';

notify pgrst, 'reload schema';
