# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tiger shark identification and observation tracking system for marine biologists. Researchers photograph sharks underwater and the system auto-identifies individuals by their unique spot patterns near the mouth.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Python 3.13, FastAPI 0.133, SQLAlchemy 2.0, Alembic |
| Frontend | React 19, Vite 7, TypeScript 5.9, React Router 7 |
| Database | PostgreSQL 16 |
| File storage | MinIO (pinned release tag) |
| ML service | Python 3.13, FastAPI, NumPy, OpenCV, scikit-learn |
| Reverse proxy | nginx stable-alpine (1.28) |
| Auth | JWT via python-jose |

**System flow:** React SPA → nginx:80 → FastAPI backend:8000 → PostgreSQL + MinIO + ML service:8001

## Running the app

```bash
cp .env.example .env
docker-compose up -d
# App: http://localhost
# API docs: http://localhost:8000/docs
```

Key commands:
```bash
docker-compose build backend ml        # rebuild after requirements changes
docker-compose logs -f backend         # tail logs
docker-compose exec backend alembic upgrade head          # run migrations
docker-compose exec backend alembic revision --autogenerate -m "desc"  # new migration
```

## Domain Model

**Shark** — catalog entry for an identified individual
- `id`, `display_name`, `name_status` (`temporary` | `confirmed`), `created_at`
- `main_photo_id` FK → photos; `main_photo_url` injected at response time
- New sharks get a suggested temporary name from Harry Potter female characters

**Photo** — uploaded image stored in MinIO (JPEG/PNG only, max 50 MB)
- `processing_status`: `uploaded` → `processing` → `ready_for_validation` | `error` | `validated`
- `shark_bbox`, `zone_bbox` — normalised `{x,y,w,h}` 0–1; zone coords relative to shark crop
- `orientation` — `face_left` | `face_right`
- `auto_detected` — True while ML-suggested bboxes await user confirmation
- `top5_candidates` — JSON array of `{shark_id, display_name, score}`

**DiveSession** — groups photos and observations from one dive
- `started_at`, `ended_at`, `location_id`, `comment`
- Response includes `shark_count`, `queue_count`, `shark_thumbs`

**Observation** — journal entry for a shark encounter; always created as draft
- `confirmed_at=NULL` → draft; non-null → confirmed (irreversible, API returns 409 on edit)
- `exif_payload` injected from linked photo at GET time

**Location** — reference catalog of dive spots with lat/lon validation

**Video** — uploaded dive video; ML extracts shark frames automatically

## Architecture

### nginx routing (`infra/nginx/nginx.conf`)
- `resolver 127.0.0.11 valid=5s` — Docker DNS, re-resolves after container recreate
- `/photos/` → `minio:9000/sharks-photos/` (public read)
- `/api/` → `backend:8000/` (strips prefix)
- `/` → `frontend:5173` (WebSocket upgrade for Vite HMR)

### Backend (`backend/app/`)
```
config.py           ← pydantic-settings (DATABASE_URL, JWT_*, MINIO_*, ML_SERVICE_URL, photo_base_url)
database.py         ← engine (pool_size=10, max_overflow=20), SessionLocal, Base, get_db
main.py             ← FastAPI app; CORS for localhost/:3000/:5173
models/             ← User, Location, Shark, DiveSession, Photo, Observation, Video
auth/               ← bcrypt>=5 (no passlib), jwt.py, dependencies.py
storage/minio.py    ← singleton client; upload_file(), get_object_bytes(), get_presigned_url(), delete_file()
utils/photo.py      ← shared photo_url(photo) + enrich_photo(photo) — used by all routers
utils/exif.py       ← extract_exif(), parse_taken_at(), parse_gps()
routers/
  auth.py           ← POST /auth/login, /auth/logout
  locations.py      ← CRUD /locations (lat/lon validated with Field bounds)
  dive_sessions.py  ← CRUD /dive-sessions; list includes shark_count/queue_count/shark_thumbs
  photos.py         ← upload (PIL verify + 50MB limit), validate, annotate, delete; bg classification task
  videos.py         ← upload (Content-Length check), bg frame extraction with ThreadPoolExecutor(4)
  sharks.py         ← CRUD /sharks; GET includes first_seen/last_seen from observations
  observations.py   ← GET/PUT /observations; GET injects exif_payload from linked photo
  internal.py       ← /internal/users CRUD (IP-allowlisted: localhost + RFC-1918 only)
```

### ML service (`ml/`)
```
detector.py   ← auto_detect() background subtraction; detect_snout() fallback
embedder.py   ← 106-dim L2-norm vector (64-dim HSV hist + 10-dim LBP + 32-dim spatial)
store.py      ← EmbeddingStore: numpy .npy + JSON (NOT pickle); thread-safe singleton
classifier.py ← KNN cosine similarity, dedup per shark, top-5 above threshold
video.py      ← extract_shark_frames(); VIDEO_FRAME_INTERVAL env var; max 30 frames
main.py       ← POST /detect, /classify, /embeddings, /process-video; GET /health
```

### Frontend (`frontend/src/`)
```
api.ts          ← all API calls; 401 → clears token + redirects to /login
types.ts        ← TypeScript interfaces for all domain objects
auth.tsx        ← token context
components/
  Sidebar.tsx      ← uses GET /photos/validation-queue/count for badge
  Lightbox.tsx     ← onPrev/onNext + keyboard ←/→/Esc
  Modal.tsx, StatusBadge.tsx
pages/
  DiveSessions.tsx        ← list with shark thumbs, counts
  DiveSessionDetail.tsx   ← photo grid, video upload, edit form, location name
  ValidationQueue.tsx     ← keyboard nav, bbox overlays, candidate thumbnails
  PhotoDetail.tsx         ← 3-step annotation tool, ML pre-fill badge
  SharkDetail.tsx         ← first/last seen stats, all_photos strip with ★ main setter
  ObservationDetail.tsx   ← shark/session/location selectors, collapsible EXIF panel
  Sharks.tsx, Locations.tsx, Login.tsx
```

## Key conventions

- **Photo URL**: always go through `utils/photo.py:enrich_photo()` — never construct URLs inline
- **Background tasks**: use `SessionLocal()` directly (not `get_db()`); always `logger.exception()` on error
- **Migrations**: `server_default=sa.false()` required when adding NOT NULL bool to existing table
- **Observations**: confirmed_at non-null means locked — API enforces 409 on any update attempt
- **Validation flow**: `ready_for_validation` → user action → `validated`; error path → `error` status
- **Internal API**: `/internal/` routes use IP allowlist dependency, not JWT

## UI Specification

`prototype/` is the canonical UI spec — open `prototype/login.html` in a browser.
Design tokens: `--navy #1b3a5c` · `--blue #2d7dd2` · `--teal #0d9e93` · `--bg #f0f4f8`

## Fixed constraints (never change)
- No RBAC in MVP; top-5 candidates only; JPEG + PNG only; no data export
- Global confidence threshold (not per-shark); backups mandatory

## Documentation
Requirements in `docs/` (Russian): domain overview, use cases, acceptance criteria, fixed decisions, architecture, ROADMAP.
Deployment guide: `DEPLOY.md` — prerequisites, setup, backups, troubleshooting.
