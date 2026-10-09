#!/usr/bin/env bash
# Sekali jalan: bikin wallet OPERATOR (hot wallet testnet untuk backend platform: CONTROLLER/ADMIN seri + slot PLATFORM + bayar gas),
# lalu danai dari deployer. Private key operator ditulis ke .env tanpa pernah dicetak.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; source "$ROOT/.env"; set +a
for v in SEPOLIA_RPC_URL DEPLOYER_ADDRESS; do
  [ -n "${!v:-}" ] || { echo "❌ $v kosong di .env"; exit 1; }
done
[ -f "$HOME/.foundry/keystores/deployer" ] || { echo "❌ keystore 'deployer' belum ada"; exit 1; }

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

fund () { # alamat jumlah
  local bal; bal=$(cast balance "$1" --rpc-url "$SEPOLIA_RPC_URL" --ether)
  if awk -v b="$bal" -v m="$2" 'BEGIN{exit !(b+0 >= m+0)}'; then echo "→ $1 sudah punya $bal ETH"; else
    echo "→ Kirim $2 ETH ke $1"; "${SEND[@]}" "$1" --value "${2}ether" >/dev/null; fi
}
# operator membayar gas deploy VenueSeries per venue + semua transaksi alokasi/posting
fund "$OPERATOR_ADDRESS" 0.3
[ -n "${ATTESTOR_VERIFIER_ADDRESS:-}" ] && fund "$ATTESTOR_VERIFIER_ADDRESS" 0.02 || echo "ℹ️  ATTESTOR_VERIFIER_ADDRESS kosong: isi dengan wallet verifier independen sebelum deploy."
echo "✅ Selesai."
