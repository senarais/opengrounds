# Kontrak (Foundry, Solidity 0.8.28, OpenZeppelin v5.1)

`packages/contracts`. Tes: `forge test` (69 tes: 16 attestation, 5 token, 39 Series, 9 invarian).

## AssetAttestation
Registry EIP-712 bersama. Penandatangan (3) immutable, tanpa admin/upgrade.

| Kasus | Tanda tangan |
|---|---|
| Verdict Pass, AI setuju | 2 dari 3, alamat **terurut naik** |
| Verdict Pass membatalkan AI "Fail" | **3 dari 3** + `overrideReasonHash != 0` |
| Verdict Fail (veto) | 1 |
| Cabut (`revoke`) | 1 penandatangan, kapan saja |

Terikat ke alamat `series`; nonce per series (replay + supersede = attestation baru, mis. ganti harga); expiry maks 90 hari. Menyimpan `maxPrice`, `maxShareBps`, dan `maxTotalShareBps` lintas seri per asset (`lockShare` / `releaseShare`).

## SeriesToken
ERC-20, `decimals = 0`, simbol ≤ 5 karakter. Mint hanya ke alamat allowlist (KYC), burn hanya oleh Series, **transfer selalu terkunci**. Dibuat oleh konstruktor Series.

## Series
Status on-chain: `Draft → Offering → Funded | Failed → Active → Closed` (Verifying/Attested hidup di platform).

- `openOffering`: wajib attestation valid dan `unitPrice ≤ maxPrice`.
- `recordPurchase`: operator, setelah kustodian konfirmasi; attestation harus masih valid; pembelian pihak terkait tidak masuk `countedRaise`.
- `closeOffering` (siapa pun): waktu habis / terjual habis / attestation tak valid. **Cara 1**: `countedRaise ≥ minRaise` → Funded (suplai terkunci) else Failed (`refund` membakar token, event memicu kustodian).
- `releaseTranche1` (50%): Funded + attestation valid. `releaseTranche2`: periode 1 terekonsiliasi bersih, tanpa exception auditor, attestation valid.
- `postPool`: P naik per periode berurutan; ditolak bila Closed/tanpa suplai/lewat tenor.
- Redeem: `requestRedeem` (atau `requestRedeemFor` dengan tanda tangan holder) → `approveRedeem` (FIFO, kunci `payout = floor(k·(P−R)/S)`, `R+=payout`, `S−=k`) → `confirmRedeem` (burn) atau `failRedeem` (balik). Semua token terbakar → Closed.
- `endTenor`: Closed, split mati; sisa kantong tetap bisa ditebus proporsional.
- `anchorRoot`: root harian POS dengan tanda tangan EIP-712 auditor, write-once.
- Admin: `DEFAULT_ADMIN_ROLE` (deployer) hanya kelola OPERATOR dan `pause` (tidak memblokir refund/redeem request). **Diungkapkan**: operator = platform; ini kepercayaan Mode A.

## Invarian (fuzz, 256 runs × 64 kedalaman)
redeemed ≤ pool · pembayaran dibulatkan ke bawah · suplai ≤ cap · tidak ada mint tanpa attestation valid · tidak ada rilis tanpa syarat (dan ≤ raised) · Closed tidak menerima split · suplai token = S + token redeem-disetujui · akuntansi refund · kuota persen lintas seri.

Harness divalidasi dengan **mutation test** (8 mutasi: hapus cek attestation di mint / tahap 1, lewati cap, tahap 2 tanpa periode bersih, refund tanpa burn, postPool saat Closed, S tidak dikurangi, pembulatan ke atas), semuanya tertangkap.

## Belum dikerjakan / batasan
- Mode B (stablecoin) tidak ada. Uang riil off-chain.
- Operator tunggal tepercaya; produksi butuh kustodian berlisensi dan pemisahan peran.
- Belum ada audit eksternal.
