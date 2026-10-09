-- Batas waktu akhir tiap periode pembukuan kantong (untuk menghitung akrual & finalisasi berikutnya).
alter table platform.pool_periods add column if not exists period_end timestamptz;
alter table platform.pool_periods add column if not exists eligible_revenue bigint;
