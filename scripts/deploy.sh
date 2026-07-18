#!/usr/bin/env bash
# Build the image locally and ship it to the server (the repo may be private, or
# the server has no git creds) — we copy the built image instead of building there.
#
# Usage:  ./scripts/deploy.sh
# Env:    KASSA_HOST (default: your-server), KASSA_REMOTE_DIR (default: kassa, under $HOME)
#         KASSA_HOST is an ssh target (host alias, or user@host).
set -euo pipefail

HOST="${KASSA_HOST:-your-server}"
REMOTE_DIR="${KASSA_REMOTE_DIR:-kassa}"
IMAGE="kassa:latest"

cd "$(dirname "$0")/.."

echo "▸ Building $IMAGE…"
docker build -t "$IMAGE" .

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "▸ Saving image…"
docker save "$IMAGE" | gzip > "$TMP/kassa-image.tar.gz"
echo "  $(du -h "$TMP/kassa-image.tar.gz" | cut -f1)"

echo "▸ Copying to $HOST…"
scp "$TMP/kassa-image.tar.gz" "$HOST:/tmp/kassa-image.tar.gz"

echo "▸ Loading + restarting on $HOST…"
ssh "$HOST" "docker load < /tmp/kassa-image.tar.gz && rm -f /tmp/kassa-image.tar.gz && cd ~/$REMOTE_DIR && docker compose up -d"

echo "▸ Health check…"
sleep 2
ssh "$HOST" "curl -fs http://localhost:3000/api/health" && echo
echo "✓ Deployed to $HOST."
