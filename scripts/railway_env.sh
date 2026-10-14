#!/bin/sh
# Push every KEY=VALUE line of an env file to a Railway service as variables (no deploy). Values never hit the shell history.
#   scripts/railway_env.sh api-mainnet api/.env.mainnet
set -e
svc=$1; file=$2
args=""
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue;; esac
  set -- "$@" --set "$line"
done < "$file"
shift 2
railway variables --service "$svc" --skip-deploys "$@"
