#!/usr/bin/env bash
# Sekali jalan: bikin wallet OPERATOR (hot wallet testnet untuk server platform), beri role OPERATOR di Series,
# lalu danai operator dan 3 signer dengan sedikit Sepolia ETH dari deployer. Private key operator ditulis ke .env
# tanpa pernah dicetak.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; source "$ROOT/.env"; set +a
for v in SEPOLIA_RPC_URL DEPLOYER_ADDRESS SIGNER_1_ADDRESS SIGNER_2_ADDRESS SIGNER_3_ADDRESS; do
  [ -n "${!v:-}" ] || { echo "❌ $v kosong di .env"; exit 1; }
done
[ -f "$HOME/.foundry/keystores/deployer" ] || { echo "❌ keystore 'deployer' belum ada"; exit 1; }
SERIES=$(python3 -c "import json;print(json.load(open('packages/contracts/deployments/latest.json'))['Series'])")

if grep -qE '^OPERATOR_PRIVATE_KEY=.+' .env; then
  echo "→ Operator sudah ada di .env, dipakai ulang."
  set -a; source .env; set +a
else
  echo "→ Membuat wallet operator baru (key langsung ke .env, tidak dicetak)…"
  json=$(cast wallet new --json)
  OPERATOR_ADDRESS=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])[0]['address'])" "$json")
  OPERATOR_PRIVATE_KEY=$(python3 -c "import json,sys;print(json.loads(sys.argv[1])[0]['private_key'])" "$json")
  sed -i '' '/^OPERATOR_ADDRESS=/d;/^OPERATOR_PRIVATE_KEY=/d' .env
  printf '\n# Operator platform (hot wallet TESTNET, server only)\nOPERATOR_ADDRESS=%s\nOPERATOR_PRIVATE_KEY=%s\n' "$OPERATOR_ADDRESS" "$OPERATOR_PRIVATE_KEY" >> .env
  unset json
fi
echo "   operator: $OPERATOR_ADDRESS"

read -r -s -p "Password keystore 'deployer': " PW; echo
PWF=$(mktemp); chmod 600 "$PWF"; trap 'rm -f "$PWF"' EXIT; printf '%s' "$PW" > "$PWF"; unset PW
SEND=(cast send --account deployer --password-file "$PWF" --rpc-url "$SEPOLIA_RPC_URL")

ROLE=$(cast keccak "OPERATOR_ROLE")
if [ "$(cast call "$SERIES" 'hasRole(bytes32,address)(bool)' "$ROLE" "$OPERATOR_ADDRESS" --rpc-url "$SEPOLIA_RPC_URL")" = "true" ]; then
  echo "→ Role OPERATOR sudah diberikan."
else
  echo "→ Memberi role OPERATOR…"
  "${SEND[@]}" "$SERIES" 'grantRole(bytes32,address)' "$ROLE" "$OPERATOR_ADDRESS" >/dev/null
fi

fund () { # alamat jumlah
  local bal; bal=$(cast balance "$1" --rpc-url "$SEPOLIA_RPC_URL" --ether)
  if awk -v b="$bal" -v m="$2" 'BEGIN{exit !(b+0 >= m+0)}'; then echo "→ $1 sudah punya $bal ETH"; else
    echo "→ Kirim $2 ETH ke $1"; "${SEND[@]}" "$1" --value "${2}ether" >/dev/null; fi
}
fund "$OPERATOR_ADDRESS" 0.15
fund "$SIGNER_1_ADDRESS" 0.03
fund "$SIGNER_2_ADDRESS" 0.03
fund "$SIGNER_3_ADDRESS" 0.03

echo "→ Cek: operator punya role? $(cast call "$SERIES" 'hasRole(bytes32,address)(bool)' "$ROLE" "$OPERATOR_ADDRESS" --rpc-url "$SEPOLIA_RPC_URL")"
echo "✅ Selesai."
