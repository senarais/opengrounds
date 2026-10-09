-- Undangan staf: penerima membuat kata sandinya sendiri lewat tautan sekali pakai, sehingga operator yang mengundang
-- TIDAK PERNAH mengetahui kata sandi orang lain (tidak bisa login sebagai reviewer lalu menyetujui sendiri).
create table if not exists platform.staff_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  display_name text not null,
  role        text not null check (role in ('operator','reviewer','auditor')),
  token_hash  text not null unique,           -- sha256 dari token; token utuh hanya tampil sekali
  invited_by  text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists staff_invites_email on platform.staff_invites (lower(email)) where used_at is null;
alter table platform.staff_invites enable row level security;   -- tanpa policy: hanya server
grant all on platform.staff_invites to service_role;
notify pgrst, 'reload schema';
