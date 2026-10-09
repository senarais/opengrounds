-- Lapisan AI dokumen: hasil ekstraksi per dokumen + laporan konsistensi per pengajuan (AI hanya menilai; aturan yang memutuskan).
alter table platform.documents add column if not exists extraction jsonb;           -- bidang hasil ekstraksi (tervalidasi kutipan)
alter table platform.documents add column if not exists extraction_status text      -- pending | ok | partial | unreadable | failed
  check (extraction_status in ('pending','ok','partial','unreadable','failed'));
alter table platform.documents add column if not exists extraction_note text;
alter table platform.venues add column if not exists ai_report jsonb;               -- {checks, analyzedAt, model}
alter table platform.venues add column if not exists ai_status text not null default 'none'
  check (ai_status in ('none','running','done','failed'));

-- Exception yang sudah dijelaskan staf (tidak lagi menahan rilis dana)
alter table platform.recon_exceptions add column if not exists explained_by text;
alter table platform.recon_exceptions add column if not exists explanation text;
alter table platform.recon_exceptions add column if not exists explained_at timestamptz;

-- Penarikan dana oleh owner (kustodian simulasi)
create table if not exists platform.owner_payouts (
  id          bigint generated always as identity primary key,
  series_id   uuid not null references platform.series(id),
  amount      bigint not null check (amount > 0),
  requested_by uuid references platform.users(id),
  simulated   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Refund investor saat penawaran gagal
alter table platform.purchases add column if not exists refunded_at timestamptz;
alter table platform.purchases add column if not exists refund_tx text;

notify pgrst, 'reload schema';
