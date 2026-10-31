#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  printf '%s\n' 'Gere o .env com python3 scripts/setup-deploy.py antes de publicar.' >&2
  exit 1
fi

tag="${1:-$(cat .deploy-release 2>/dev/null || printf latest)}"
if [[ ! "$tag" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  printf '%s\n' 'Tag de imagem inválida.' >&2
  exit 1
fi
export IMAGE_TAG="$tag"
compose=(docker compose --env-file .env -f compose.deploy.yaml)
"${compose[@]}" config --quiet
"${compose[@]}" pull
"${compose[@]}" up -d --wait --wait-timeout 180 web
printf '%s\n' "$IMAGE_TAG" > .deploy-release
"${compose[@]}" ps
