#!/usr/bin/env bash
# Deploy or update on ryn-main: pull the repo, build the image on the host, roll the container.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose -f deploy/docker-compose.yml build --pull
docker compose -f deploy/docker-compose.yml up -d
for i in $(seq 1 30); do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' tc-web 2>/dev/null)" = "healthy" ]; then echo "tc-web healthy"; exit 0; fi
  sleep 2
done
echo "tc-web did not become healthy; logs:"; docker logs --tail 50 tc-web; exit 1
