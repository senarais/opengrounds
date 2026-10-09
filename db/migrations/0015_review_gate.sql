-- Putusan review manusia SEBELUM kontrak dideploy: pengajuan yang ditolak tidak menghabiskan gas deploy.
alter table platform.series add column if not exists review_status text not null default 'pending' check (review_status in ('pending','approved','rejected'));
alter table platform.series add column if not exists review_by text;
alter table platform.series add column if not exists review_note text;
alter table platform.series add column if not exists reviewed_at timestamptz;
notify pgrst, 'reload schema';
