#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups/db"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/sharks_${TIMESTAMP}.sql.gz"

# Load environment variables
set -a
# shellcheck source=../.env
source "$PROJECT_DIR/.env"
set +a

mkdir -p "$BACKUP_DIR"

echo "Backing up database '$POSTGRES_DB'..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" exec -T db \
    pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
    | gzip > "$FILE"

SIZE="$(du -h "$FILE" | cut -f1)"
echo "Saved: $FILE ($SIZE)"
