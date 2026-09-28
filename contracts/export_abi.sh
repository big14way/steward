#!/usr/bin/env bash
# Export contract ABIs from forge artifacts into contracts/abi/ (read by agent/chain.py, api/signer.py, the SDK).
set -euo pipefail
cd "$(dirname "$0")"
forge build --silent
mkdir -p abi
for c in AllowanceManager AuditLog YieldSweeper MockUSYC; do
  forge inspect "$c" abi --json > "abi/$c.json"
  echo "abi/$c.json ($(wc -c < "abi/$c.json") bytes)"
done
