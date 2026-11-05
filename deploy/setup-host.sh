#!/usr/bin/env bash
# One-time host setup on ryn-main (run as the deploy user). Idempotent; prints every step.
# 1. an internal Docker network `tc` that only the Trench Crusade container and kamal-proxy join
# 2. attach kamal-proxy to it so it can reach tc-web:3001 without tc-web joining the kamal network
# 3. register the host route in kamal-proxy with automatic TLS
set -euo pipefail
HOST_NAME="${TC_HOST:-tc.rynfin.org}"
PROXY="${KAMAL_PROXY_CONTAINER:-kamal-proxy}"

docker ps --format '{{.Names}}' | grep -qx "$PROXY" || { echo "kamal-proxy container '$PROXY' is not running"; exit 1; }
docker network inspect tc >/dev/null 2>&1 || { echo "+ docker network create --internal tc"; docker network create --internal tc; }
docker network inspect tc -f '{{range .Containers}}{{.Name}} {{end}}' | grep -qw "$PROXY" || { echo "+ docker network connect tc $PROXY"; docker network connect tc "$PROXY"; }
echo "+ kamal-proxy deploy trench-crusade --target tc-web:3001 --host $HOST_NAME --tls --health-check-path /api/health"
docker exec "$PROXY" kamal-proxy deploy trench-crusade --target tc-web:3001 --host "$HOST_NAME" --tls --health-check-path /api/health
docker exec "$PROXY" kamal-proxy list
