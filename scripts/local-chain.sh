#!/usr/bin/env bash
# Chain lokal (anvil) untuk menguji alur on-chain tanpa Sepolia & tanpa kunci asli.
# Memakai kunci anvil yang PUBLIK; jangan pernah dipakai di jaringan sungguhan.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/packages/contracts"
MN="test test test test test test test test test test test junk"
K0=$(cast wallet private-key --mnemonic "$MN" --mnemonic-index 0)
addr() { cast wallet address --mnemonic "$MN" --mnemonic-index "$1"; }
A0=$(addr 0); A1=$(addr 1); A2=$(addr 2); A3=$(addr 3); A4=$(addr 4)
pkill -f "anvil --port 8545" 2>/dev/null || true; sleep 1
anvil --port 8545 --silent > /tmp/anvil.log 2>&1 &
for i in $(seq 1 20); do cast chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1 && break; sleep 0.5; done
DEPLOYER_ADDRESS=$A0 SIGNER_1_ADDRESS=$A1 SIGNER_2_ADDRESS=$A2 SIGNER_3_ADDRESS=$A3 OPERATOR_ADDRESS=$A4 DEPLOY_OUT=local \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --private-key $K0 --sender $A0 --broadcast >/tmp/local-deploy.log 2>&1 || { tail -20 /tmp/local-deploy.log; exit 1; }
cat deployments/local.json; echo
