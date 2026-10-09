-- Suara review wajib ditandatangani wallet Signer yang sesuai peran (operator: signer 1/2, auditor: signer 3). Disimpan sebagai bukti.
alter table platform.review_votes add column if not exists voter_wallet text;
alter table platform.review_votes add column if not exists signed_message text;
alter table platform.review_votes add column if not exists signature text;
notify pgrst, 'reload schema';
