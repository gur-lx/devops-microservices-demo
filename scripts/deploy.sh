#!/usr/bin/env bash
# Run this ON the deployment server, inside $DEPLOY_PATH,
# after docker-compose.yml (the prod one) and .env are in place.
# Usage: ./deploy.sh
set -euo pipefail

if [ ! -f .env ]; then
  echo "Missing .env (copy from .env.example and set REGISTRY/IMAGE_TAG)" >&2
  exit 1
fi

docker compose pull
docker compose up -d --remove-orphans
docker image prune -f

echo "Deployed. Current containers:"
docker compose ps
