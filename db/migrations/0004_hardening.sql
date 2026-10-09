-- Rantai ledger tidak boleh bercabang: satu entri per (venue, prev_hash).
create unique index if not exists ledger_entries_chain_unique on pos.ledger_entries (venue_id, prev_hash);

-- Dosier owner (hasil ekstraksi dokumen / input pengajuan) disimpan di venue platform.
alter table platform.venues add column if not exists dossier jsonb;

-- Tanda tangan attestation dikumpulkan satu per penandatangan sebelum dikirim on-chain.
create unique index if not exists attestations_series_nonce on platform.attestations (series_id, nonce);
