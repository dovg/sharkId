# SharkID — Deployment Guide

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- At least 4 GB RAM (ML service builds an ONNX model during image build)
- Ports available: **80** (app), 5433 (Postgres), 9000/9001 (MinIO)

## 1. Clone and configure

```bash
git clone <repository-url> sharks
cd sharks
cp .env.example .env
```

Edit `.env` and set **real secrets** for production:

| Variable | What to change |
|----------|---------------|
| `POSTGRES_PASSWORD` | Strong random password |
| `MINIO_ROOT_PASSWORD` | Strong random password |
| `JWT_SECRET` | Random string, at least 32 characters |
| `PHOTO_BASE_URL` | `http://<your-domain>/photos` |
| `ML_CONFIDENCE_THRESHOLD` | `0.5` is a good default; lower = more candidates |
| `VIDEO_FRAME_INTERVAL` | Seconds between sampled frames (default `0.5`) |

## 2. Build frontend

```bash
docker run --rm -v ./frontend:/app -v ./frontend-dist:/dist -w /app node:22-alpine \
  sh -c "npm ci && VITE_API_URL=/api npx vite build --outDir /dist"
```

The built files are served by nginx from `frontend-dist/`.

## 3. Build and start services

```bash
docker compose build
docker compose up -d
```

First build takes 5–10 minutes (ML service exports the EfficientNet-B0 ONNX model).

## 4. Run database migrations

```bash
docker compose exec backend alembic upgrade head
```

This creates all tables and extensions. Migrations are idempotent — safe to re-run.

## 5. Create the first admin user

There is no registration UI. Bootstrap the admin from the command line:

```bash
docker compose exec backend python -c "
from app.database import SessionLocal
from app.models.user import User
from app.auth.hashing import hash_password

db = SessionLocal()
user = User(
    email='admin@example.com',
    password_hash=hash_password('CHANGE_ME'),
    role='admin'
)
db.add(user)
db.commit()
print(f'Created admin: {user.email}')
db.close()
"
```

Replace `admin@example.com` and `CHANGE_ME` with real values. After login, use the Users page to create additional accounts.

## 6. Verify

| Check | URL |
|-------|-----|
| App | http://localhost |
| API docs | http://localhost/api/docs |
| MinIO console | http://localhost:9001 |
| Backend health | http://localhost/api/health |
| ML health | http://localhost:8001/health |

```bash
# Quick health check from terminal
docker compose ps                          # all services "Up (healthy)"
curl -sf http://localhost/api/health       # {"status":"ok"}
curl -sf http://localhost:8001/health      # {"status":"ok"}
```

## 7. Routine operations

### View logs

```bash
docker compose logs -f backend     # backend only
docker compose logs -f ml          # ML service only
docker compose logs -f              # all services
```

### Rebuild after code changes

```bash
docker compose build backend ml    # rebuild changed services
docker compose up -d               # restart with new images
```

### Apply new migrations

```bash
docker compose exec backend alembic upgrade head
```

### Create a new migration

```bash
docker compose exec backend alembic revision --autogenerate -m "description"
```

## 8. Backups

Two scripts are provided in `scripts/`. Both read credentials from `.env`.

### Database backup

```bash
bash scripts/backup-db.sh
```

Saves a gzipped SQL dump to `backups/db/sharks_YYYYMMDD_HHMMSS.sql.gz`.

### Photo backup (MinIO)

```bash
bash scripts/backup-minio.sh
```

Mirrors the `sharks-photos` bucket to `backups/minio/`.

### Restore database from backup

```bash
gunzip -c backups/db/sharks_XXXXXXXX_XXXXXX.sql.gz \
  | docker compose exec -T db psql -U sharks sharks
```

## 9. Updating to a new version

```bash
git pull
docker run --rm -v ./frontend:/app -v ./frontend-dist:/dist -w /app node:22-alpine sh -c "npm ci && VITE_API_URL=/api npx vite build --outDir /dist"
docker compose build
docker compose up -d
docker compose exec backend alembic upgrade head
```

## 10. Stopping and cleanup

```bash
docker compose down              # stop all services, keep data
docker compose down -v           # stop and DELETE all data (volumes)
```

## Architecture overview

```
Browser ──► nginx:80
              ├── /photos/*  ──► MinIO:9000   (static photo files)
              ├── /api/*     ──► Backend:8000  (FastAPI REST API)
              └── /*         ──► frontend-dist/ (pre-built React SPA)

Backend:8000 ──► PostgreSQL:5432  (data)
             ──► MinIO:9000       (file storage)
             ──► ML:8001          (shark detection & classification)
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port 80 already in use | Stop the conflicting service or change nginx port in `docker-compose.yml` |
| ML build fails (out of memory) | Ensure at least 4 GB RAM available for Docker |
| `502 Bad Gateway` after restart | Wait 10–15 s for backend/ML health checks to pass; check `docker compose ps` |
| Photos not loading | Verify `PHOTO_BASE_URL` matches your domain; check MinIO is healthy |
| Migration fails | Check `docker compose logs backend` for details; ensure DB is reachable |
| Forgot admin password | Create a new admin user with the bootstrap command from step 5 |
