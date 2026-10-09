-- Metode pembayaran booking: gateway (terverifikasi settlement PSP) vs dicatat manual di luar jalur (tunai / QRIS statis milik sendiri).
-- Penjualan di luar jalur dicatat jujur di ledger tetapi TIDAK dihitung sebagai omzet terverifikasi; rasio cakupan menjadi gerbang kebijakan.
alter table pos.bookings add column if not exists payment_method text not null default 'gateway'
  check (payment_method in ('gateway','cash','qris_sendiri'));
notify pgrst, 'reload schema';
