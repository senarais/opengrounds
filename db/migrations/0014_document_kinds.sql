-- Jenis dokumen baru: bukti kepemilikan (tanah/bangunan milik sendiri) dan file data penjualan yang diunggah owner.
alter table platform.documents drop constraint if exists documents_kind_check;
alter table platform.documents add constraint documents_kind_check
  check (kind in ('lease','bank_statement','loan','covenant','consent_letter','tax','license','insurance','photo','ownership','sales_data','other'));
notify pgrst, 'reload schema';
