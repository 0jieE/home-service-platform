#!/usr/bin/env sh
# Restore a dump made by backup.sh into the service_platform database (replaces current data).
# Run from the repo root:  sh backend/scripts/restore.sh backups/<name>.dump
set -eu

FILE="${1:?usage: restore.sh backups/<name>.dump}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

echo "Stopping app services so nothing writes during the restore..."
docker compose stop web worker beat

docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'service_platform' AND pid <> pg_backend_pid();" >/dev/null
docker compose exec -T db dropdb -U postgres --if-exists service_platform
docker compose exec -T db createdb -U postgres service_platform
docker compose exec -T db pg_restore -U postgres -d service_platform --no-owner --exit-on-error < "$FILE"

docker compose start web worker beat
echo "Restored $FILE"
