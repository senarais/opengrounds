#!/usr/bin/env bash
# Uji end-to-end tanpa browser di chain lokal (anvil) dengan kunci uji publik. Tidak menyentuh Sepolia.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/local-chain.sh" >/dev/null
trap 'pkill -f "anvil --port 8545" 2>/dev/null || true' EXIT
ATT=$(python3 -c "import json;print(json.load(open('$ROOT/packages/contracts/deployments/local.json'))['AssetAttestation'])")
export SEPOLIA_RPC_URL=http://127.0.0.1:8545 CHAIN_ID=31337 ATTESTATION_ADDRESS="$ATT"
# kunci uji diturunkan dari mnemonic bawaan anvil (publik): indeks 1-3 = signer, indeks 4 = operator
MN="test test test test test test test test test test test junk"
key() { cast wallet private-key --mnemonic "$MN" --mnemonic-index "$1"; }
export OPERATOR_PRIVATE_KEY=$(key 4) SIGNER_1_PRIVATE_KEY=$(key 1) SIGNER_2_PRIVATE_KEY=$(key 2) SIGNER_3_PRIVATE_KEY=$(key 3)
cd "$ROOT/apps/platform" && pnpm exec tsx --env-file=../../.env scripts/e2e-local.ts
