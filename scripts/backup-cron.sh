#!/usr/bin/env bash
# Server-local backup, meant to run from cron ON the host running the container
# (no SSH). Writes a WAL-safe snapshot to $KASSA_BACKUP_DIR and rotates old ones.
#
# Cron example (daily 03:30):
#   30 3 * * * $HOME/kassa/backup-cron.sh >> $HOME/kassa-backups/backup.log 2>&1
#
# Env: KASSA_CONTAINER (default kassa), KASSA_BACKUP_DIR (default ~/kassa-backups),
#      KASSA_BACKUP_KEEP (default 14 most recent).
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

CONTAINER="${KASSA_CONTAINER:-kassa}"
OUT_DIR="${KASSA_BACKUP_DIR:-$HOME/kassa-backups}"
KEEP="${KASSA_BACKUP_KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$OUT_DIR/kassa-$STAMP.sqlite"

mkdir -p "$OUT_DIR"

docker exec "$CONTAINER" rm -f /data/.backup.sqlite
docker exec "$CONTAINER" node -e "const D=require('better-sqlite3');const db=new D('/data/kassa.sqlite');db.backup('/data/.backup.sqlite').then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"
docker exec "$CONTAINER" cat /data/.backup.sqlite > "$OUT"
docker exec "$CONTAINER" rm -f /data/.backup.sqlite

# Validate the SQLite header before trusting / rotating.
if ! head -c 16 "$OUT" | grep -q "SQLite format 3"; then
  echo "$(date -Is) ERROR: invalid backup, removing $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

# Rotate: keep only the newest $KEEP snapshots.
ls -1t "$OUT_DIR"/kassa-*.sqlite 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "$(date -Is) OK: $OUT ($(du -h "$OUT" | cut -f1)); kept newest $KEEP"
