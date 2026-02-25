#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups/minio"
MC_IMAGE="minio/mc:RELEASE.2025-08-13T08-35-41Z"

# Load environment variables
set -a
# shellcheck source=../.env
source "$PROJECT_DIR/.env"
set +a

# Derive Docker Compose network name from project directory basename
PROJECT_NAME="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]')"
NETWORK="${PROJECT_NAME}_default"

mkdir -p "$BACKUP_DIR"

echo "Mirroring MinIO bucket '$MINIO_BUCKET' to $BACKUP_DIR ..."
docker run --rm \
    --network "$NETWORK" \
    -v "$BACKUP_DIR:/backup" \
    "$MC_IMAGE" \
    sh -c "mc alias set local http://minio:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' \
        && mc mirror local/$MINIO_BUCKET /backup/"

echo "Done. Files saved to: $BACKUP_DIR"
