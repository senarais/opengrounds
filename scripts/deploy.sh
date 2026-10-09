#!/usr/bin/env bash
# Deploy AttestationRegistry ke Sepolia (sekali). Kontrak seri (VenueSeries + SeriesToken) dideploy backend per venue setelah KYB disetujui.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/packages/contracts"
set -a; source "$ROOT/.env"; set +a
# forge lewat WebSocket sering mencetak "alloy_transport_ws: failed to deserialize" dan bisa macet: pakai HTTPS di host yang sama
SEPOLIA_RPC_URL="$(printf %s "$SEPOLIA_RPC_URL" | sed -e "s#^wss:#https:#" -e "s#^ws:#http:#" -e "s#/ws/v3/#/v3/#")"

ATTESTOR_VERIFIER_ADDRESS="${ATTESTOR_VERIFIER_ADDRESS:-${SIGNER_3_ADDRESS:-}}"; export ATTESTOR_VERIFIER_ADDRESS
for v in SEPOLIA_RPC_URL DEPLOYER_ADDRESS OPERATOR_ADDRESS ATTESTOR_VERIFIER_ADDRESS; do
  [ -n "${!v:-}" ] || { echo "❌ $v masih kosong di $ROOT/.env"; exit 1; }
done

uniq_count=$(printf '%s\n' "${ATTESTOR_PLATFORM_ADDRESS:-$OPERATOR_ADDRESS}" "$ATTESTOR_VERIFIER_ADDRESS" | tr 'A-F' 'a-f' | sort -u | wc -l | tr -d ' ')
[ "$uniq_count" = "2" ] || { echo "❌ Slot PLATFORM dan VERIFIER harus alamat berbeda"; exit 1; }

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
forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --sender "$DEPLOYER_ADDRESS" 2>&1 | grep -E "AttestationRegistry|platform|verifier|admin|Error|Revert" || true

read -r -p "Lanjut deploy BENERAN ke Sepolia? (ketik 'ya') " ok
[ "$ok" = "ya" ] || { echo "Dibatalkan."; exit 0; }

VERIFY=()
[ -n "${ETHERSCAN_API_KEY:-}" ] && VERIFY=(--verify)

forge script script/Deploy.s.sol --rpc-url "$SEPOLIA_RPC_URL" --account deployer --sender "$DEPLOYER_ADDRESS" --broadcast --gas-estimate-multiplier 900 "${VERIFY[@]}"

echo
echo "✅ Selesai. Alamat tersimpan di packages/contracts/deployments/latest.json:"
cat deployments/latest.json; echo
