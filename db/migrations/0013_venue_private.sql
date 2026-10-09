-- Data privat pengajuan owner: identitas badan usaha, pemilik manfaat, rekening tujuan, kontak, rincian utang dan sewa.
-- Hanya server (service_role) dan staf lewat server; tidak pernah masuk halaman penawaran.
create table if not exists platform.venue_private (
  venue_id   uuid primary key references platform.venues(id) on delete cascade,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
alter table platform.venue_private enable row level security;   -- tanpa policy
grant all on platform.venue_private to service_role;
notify pgrst, 'reload schema';
