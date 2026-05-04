#!/bin/bash
# Production backup for yophon-board.
#
# Lives at /root/yophon-board-backup/backup.sh on the server, scheduled via cron:
#   47 */6 * * * /root/yophon-board-backup/backup.sh >> /var/log/yophon-board-backup.log 2>&1
#
# Uses VACUUM INTO for a consistent online snapshot. The backup repo is a separate
# git repo that force-pushes to its own origin/main and squashes history to the
# latest 30 commits.
set -euo pipefail

PATH=/root/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

DATA_DIR=/root/yophon-board/data
BACKUP_DIR=/root/yophon-board-backup
DB_SRC="$DATA_DIR/yophon-board.db"
DB_DST="$BACKUP_DIR/yophon-board.db"

log() {
  echo "[$(date -Is)] $*"
}

log "Backup started"

if [ ! -f "$DB_SRC" ]; then
  log "Database not found: $DB_SRC"
  exit 0
fi

log "Snapshotting via VACUUM INTO"
TMP_DST="$DB_DST.tmp"
rm -f "$TMP_DST"
DB_SRC_ENV="$DB_SRC" DB_DST_ENV="$TMP_DST" bun -e '
  import { Database } from "bun:sqlite";
  const src = new Database(process.env.DB_SRC_ENV, { readonly: true });
  const dst = process.env.DB_DST_ENV.replace(/'\''/g, "''");
  src.exec(`VACUUM INTO '\''${dst}'\''`);
  src.close();
'
mv -f "$TMP_DST" "$DB_DST"
log "Snapshot ready"

cd "$BACKUP_DIR"
git add -A
if git diff --cached --quiet; then
  log "No changes to backup"
  exit 0
fi

git commit -m "backup: $(date +%Y-%m-%d_%H:%M)"

TOTAL=$(git rev-list --count HEAD)
if [ "$TOTAL" -gt 30 ]; then
  git checkout --orphan temp
  git add -A
  git commit -m "backup: squashed to latest 30"
  git branch -D main 2>/dev/null || true
  git branch -m main
fi

git push origin main --force
log "Backup pushed"
