#!/usr/bin/env bash
# Deploy AssetAttestation + Series (+ SeriesToken) ke Sepolia. Bisa dijalankan dari folder mana saja.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/packages/contracts"
set -a; source "$ROOT/.env"; set +a

for v in SEPOLIA_RPC_URL DEPLOYER_ADDRESS SIGNER_1_ADDRESS SIGNER_2_ADDRESS SIGNER_3_ADDRESS; do
  [ -n "${!v:-}" ] || { echo "❌ $v masih kosong di $ROOT/.env"; exit 1; }
done

uniq_count=$(printf '%s\n' "$DEPLOYER_ADDRESS" "$SIGNER_1_ADDRESS" "$SIGNER_2_ADDRESS" "$SIGNER_3_ADDRESS" | tr 'A-F' 'a-f' | sort -u | wc -l | tr -d ' ')
[ "$uniq_count" = "4" ] || { echo "❌ DEPLOYER dan 3 SIGNER harus 4 alamat berbeda"; exit 1; }

if [ ! -f "${FOUNDRY_KEYSTORE_DIR:-$HOME/.foundry/keystores}/deployer" ]; then
  echo "❌ Keystore 'deployer' belum ada. Jalankan dulu:"
  echo "   cast wallet import deployer --interactive"
  exit 1
fi

echo "→ Cek koneksi Sepolia…"
chain=$(cast chain-id --rpc-url "$SEPOLIA_RPC_URL")
[ "$chain" = "11155111" ] || { echo "❌ RPC bukan Sepolia (chain id $chain)"; exit 1; }

bal=$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$SEPOLIA_RPC_URL" --ether)
echo "→ Saldo deployer $DEPLOYER_ADDRESS: $bal ETH"
awk -v b="$bal" 'BEGIN{exit !(b+0 > 0.01)}' || { echo "❌ Saldo kurang (butuh > 0.01 ETH). Isi dari faucet Sepolia dulu."; exit 1; }

echo "→ Build…"
forge build >/dev/null

echo "→ Simulasi (belum mengirim apa pun)…"
forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --sender "$DEPLOYER_ADDRESS" 2>&1 | grep -E "AssetAttestation|Series |SeriesToken|Error|Revert" || true

read -r -p "Lanjut deploy BENERAN ke Sepolia? (ketik 'ya') " ok
[ "$ok" = "ya" ] || { echo "Dibatalkan."; exit 0; }

VERIFY=()
[ -n "${ETHERSCAN_API_KEY:-}" ] && VERIFY=(--verify)

# Sepolia menghitung gas pembuatan kontrak jauh lebih besar dari simulasi lokal forge (~8x),
# jadi limit gas dinaikkan. Gas yang tidak terpakai dikembalikan.
forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --account deployer --sender "$DEPLOYER_ADDRESS" --broadcast --gas-estimate-multiplier 900 "${VERIFY[@]}"

echo
echo "✅ Selesai. Alamat tersimpan di packages/contracts/deployments/latest.json:"
cat deployments/latest.json; echo
