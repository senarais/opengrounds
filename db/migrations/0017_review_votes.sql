-- Review butuh DUA pihak: satu operator (tim) dan satu auditor (independen). Satu penolakan dari siapa pun menghentikan pengajuan (veto mudah).
create table if not exists platform.review_votes (
  id          uuid primary key default gen_random_uuid(),
  series_id   uuid not null references platform.series(id) on delete cascade,
  voter_email text not null,
  voter_role  text not null check (voter_role in ('operator','auditor')),
  decision    text not null check (decision in ('approved','rejected')),
  note        text,
  created_at  timestamptz not null default now(),
  unique (series_id, voter_email)
);
alter table platform.review_votes enable row level security;   -- tanpa policy: hanya server
grant all on platform.review_votes to service_role;
notify pgrst, 'reload schema';
