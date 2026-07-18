#!/usr/bin/env bash
# Pull a consistent backup of the production SQLite database off the server.
#
# Uses better-sqlite3's online backup API inside the running container, which is
# WAL-safe (it captures committed WAL data — a plain file copy would not). The
# snapshot is streamed out over SSH; nothing sensitive is left on the server.
#
# Usage:  ./scripts/backup.sh [output-dir]      (default output dir: ./backups)
# Env:    KASSA_HOST (default: your-server), KASSA_CONTAINER (default: kassa)
#         KASSA_HOST is an ssh target (host alias, or user@host).
set -euo pipefail

HOST="${KASSA_HOST:-your-server}"
CONTAINER="${KASSA_CONTAINER:-kassa}"
OUT_DIR="${1:-backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/kassa-$STAMP.sqlite"

mkdir -p "$OUT_DIR"
echo "▸ Backing up $CONTAINER on $HOST…"

# Remote: make a snapshot inside the volume, stream it to stdout, then clean up.
# The node backup writes to stderr/exits silently; only the file bytes go to stdout.
ssh "$HOST" bash -s > "$OUT_FILE" <<REMOTE
set -e
docker exec $CONTAINER rm -f /data/.backup.sqlite
docker exec $CONTAINER node -e "const D=require('better-sqlite3');const db=new D('/data/kassa.sqlite');db.backup('/data/.backup.sqlite').then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})" 1>&2
docker exec $CONTAINER cat /data/.backup.sqlite
docker exec $CONTAINER rm -f /data/.backup.sqlite
REMOTE

# Sanity check: a valid SQLite file starts with "SQLite format 3".
if head -c 16 "$OUT_FILE" | grep -q "SQLite format 3"; then
  echo "✓ $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
else
  echo "✗ Backup looks invalid — removing $OUT_FILE" >&2
  rm -f "$OUT_FILE"
  exit 1
fi
