#!/usr/bin/env sh
# Back up the PostGIS database to ./backups/<name>.dump (pg_dump custom format).
# Run from the repo root (Git Bash / WSL / Linux):  sh backend/scripts/backup.sh [name]
set -eu

NAME="${1:-service_platform_$(date +%Y%m%d_%H%M%S)}"
mkdir -p backups
docker compose exec -T db pg_dump -U postgres -d service_platform -Fc --no-owner > "backups/${NAME}.dump"
echo "Backup written to backups/${NAME}.dump ($(wc -c < "backups/${NAME}.dump") bytes)"
