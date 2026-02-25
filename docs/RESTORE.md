# Restore Procedures

This document covers restoring SharkID from backups produced by `scripts/backup-db.sh`
and `scripts/backup-minio.sh`.

---

## 1. Locate the latest backup

```bash
# Most recent DB dump
ls -lt backups/db/ | head -5

# Most recent MinIO snapshot (directory listing)
ls -lh backups/minio/
```

---

## 2. Verify backup integrity before restoring

```bash
# Verify gzip integrity (no extraction)
gzip -t backups/db/sharks_YYYYMMDD_HHMMSS.sql.gz && echo "OK"

# Preview first few SQL statements
gunzip -c backups/db/sharks_YYYYMMDD_HHMMSS.sql.gz | head -20
```

---

## 3. Restore the PostgreSQL database

> **Warning:** this drops the existing database — all current data will be lost.

```bash
# 1. Stop services that write to the DB
docker compose stop backend ml

# 2. Drop and recreate the database
docker compose exec db psql -U sharks -c "DROP DATABASE sharks;"
docker compose exec db psql -U sharks -c "CREATE DATABASE sharks;"

# 3. Restore from the dump
gunzip -c backups/db/sharks_YYYYMMDD_HHMMSS.sql.gz \
    | docker compose exec -T db psql -U sharks sharks

# 4. Bring services back up
docker compose start backend ml
```

---

## 4. Restore MinIO files

```bash
PROJECT_DIR="$(pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]')"
NETWORK="${PROJECT_NAME}_default"

# Load credentials
source .env

# 1. Ensure MinIO is running
docker compose up -d minio
docker compose exec minio mc ready local   # wait until healthy

# 2. Mirror backup into the bucket
docker run --rm \
    --network "$NETWORK" \
    -v "$PROJECT_DIR/backups/minio:/backup" \
    minio/mc:RELEASE.2025-08-13T08-35-41Z \
    sh -c "mc alias set local http://minio:9000 '$MINIO_ROOT_USER' '$MINIO_ROOT_PASSWORD' \
        && mc mirror /backup/ local/$MINIO_BUCKET"
```

---

## 5. Post-restore smoke test

```bash
# Health checks
curl -sf http://localhost/api/health && echo "backend OK"
curl -sf http://localhost:8001/health  && echo "ml OK"

# Spot-check: list sharks via API (requires a valid JWT)
curl -sf -H "Authorization: Bearer <token>" http://localhost/api/sharks | python3 -m json.tool | head -30
```
