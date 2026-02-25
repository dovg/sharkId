# Roadmap

## ✅ Phase 1 — Infrastructure & Project Skeleton

1. ✅ Create monorepo structure: `backend/`, `frontend/`, `ml/`, `infra/`
2. ✅ Write `docker-compose.yml` with services: FastAPI, PostgreSQL, MinIO, ML service, nginx
3. ✅ Configure environment variables and `.env.example`
4. ✅ Set up PostgreSQL with initial empty schema, run via Docker
5. ✅ Set up MinIO bucket and access credentials
6. ✅ Verify all services start and communicate

## ✅ Phase 2 — HTML UI Prototype

7. ✅ Create `prototype/` directory with plain HTML/CSS/JS files, no build step
8. ✅ Login page
9. ✅ Location catalog page: list, search, add form
10. ✅ Dive sessions list and create session form
11. ✅ Dive session detail: photo upload area, photo grid with mock status badges
12. ✅ Validation queue page: candidate card with top-5 list, action buttons
13. ✅ Create new shark modal: suggested name field, accept/override controls
14. ✅ Shark catalog page: list, search, shark card with profile photos
15. ✅ Observation detail: editable fields, confirm button
16. ✅ Review prototype — design tokens established: `--navy #1b3a5c`, `--blue #2d7dd2`, `--teal #0d9e93`, `--bg #f0f4f8`

> **Note:** `prototype/` was deleted after production frontend was completed.

## ✅ Phase 3 — Backend: Core

17. ✅ Initialize FastAPI project (uv + requirements.txt)
18. ✅ Set up Alembic for database migrations
19. ✅ Implement authentication: User model, JWT issue/validate, session expiry
20. ✅ Create DB models: `Location`, `Shark`, `Photo`, `DiveSession`, `Observation`
21. ✅ Write and apply initial Alembic migration
22. ✅ Implement MinIO client wrapper (upload, get URL, delete)

## ✅ Phase 4 — Backend: REST API

23. ✅ `POST /auth/login`, `POST /auth/logout`
24. ✅ `GET/POST/PUT/DELETE /locations`
25. ✅ `GET/POST/PUT/DELETE /dive-sessions`
26. ✅ `POST /dive-sessions/{id}/photos` — upload, PIL validation, MinIO, bg classification
27. ✅ `GET /photos/{id}` — photo detail with processing status and top-5 candidates
28. ✅ `GET /photos/validation-queue` + `GET /photos/validation-queue/count`
29. ✅ `POST /photos/{id}/validate` — confirm / select / create shark / unlink
30. ✅ `GET/POST/PUT/DELETE /sharks`; `GET /sharks/suggest-name`
31. ✅ `GET /sharks/{id}` — first_seen/last_seen from observations
32. ✅ `GET/PUT /observations/{id}` — draft edit and confirmation (409 if confirmed)

## ✅ Phase 5 — ML Service

33. ✅ Set up Python ML service (FastAPI)
34. ✅ Implement snout region detection (`detector.py`: background subtraction + fallback)
35. ✅ Implement 106-dim embedding (64-dim HSV + 10-dim LBP + 32-dim spatial)
36. ✅ Implement KNN cosine similarity search (`classifier.py`)
37. ✅ Return top-5 candidates above `ML_CONFIDENCE_THRESHOLD`
38. ✅ Expose `POST /detect`, `POST /classify`, `POST /embeddings`, `GET /health`
39. ✅ `EmbeddingStore`: numpy `.npy` + JSON (thread-safe singleton, not pickle)
40. ✅ Integrate ML call into backend photo upload pipeline (background task)

## ✅ Phase 6 — Frontend

41. ✅ React 19 + Vite 7 + TypeScript 5.9 + React Router 7
42. ✅ Auth guard (redirect to /login if no valid token)
43. ✅ Login page
44. ✅ Location catalog: list, search, add/edit/delete
45. ✅ Dive sessions: list, create (location, dates, comment)
46. ✅ Dive session detail: photo upload, photo grid with processing status
47. ✅ Validation queue: bbox overlays, top-5 with thumbnails, keyboard navigation
48. ✅ Create new shark: Harry Potter female character name suggestion
49. ✅ Shark catalog: list, search; default/start page (`/`)
50. ✅ Shark card: profile photo, first/last seen, all photos strip, ★ main setter
51. ✅ Observation detail: editable draft, confirm button, collapsible EXIF panel

## ✅ Phase 6.1 — nginx & Reverse Proxy

- ✅ nginx stable-alpine as single entry point on port 80
- ✅ Docker DNS resolver (`127.0.0.11`) for container re-resolution
- ✅ `/photos/` → MinIO public read (no auth)
- ✅ `/api/` → backend (prefix stripped)
- ✅ `/` → Vite frontend (WebSocket HMR)
- ✅ `client_max_body_size 500m` for video uploads

## ✅ Phase 6.2 — Photo Annotation Pipeline

- ✅ `POST /photos/{id}/annotate` — 3-step bbox annotation (shark → zone → orientation)
- ✅ `auto_detected` flag; ML pre-fills bbox; user can correct or accept
- ✅ After manual annotation → ML reclassifies with new bboxes
- ✅ Frontend: 3-step annotation UI with SVG draw canvas; ML pre-fill badge

## ✅ Phase 6.3 — Video Pipeline

- ✅ `Video` model + `POST /dive-sessions/{id}/videos`
- ✅ Content-Length validation (≤ 500 MB); supported: MP4, MOV, AVI, MKV, WebM
- ✅ Background frame extraction: `ThreadPoolExecutor(4)`; `VIDEO_FRAME_INTERVAL`; max 30 frames
- ✅ Each extracted frame → Photo record + classification pipeline
- ✅ Frontend: video upload, processing status display, polling/auto-refresh, delete

## ✅ Phase 6.4 — Audit Log

- ✅ `AuditLog` model: action, resource_type, resource_id, detail (JSON), ip_address, user_email (denormalised)
- ✅ `utils/audit.py:log_event()` called before `db.commit()` in every mutating endpoint
- ✅ `GET /audit-log` — filtering by resource_type/resource_id; load-more pagination (require_editor)
- ✅ `EventHistory` component on Shark/Photo/DiveSession/Observation detail pages
- ✅ Global AuditLog page in sidebar

## ✅ Phase 6.5 — RBAC (3 roles)

- ✅ `role` column on User (`viewer` | `editor` | `admin`); existing users → `editor`; new users → `viewer`
- ✅ `require_editor` / `require_admin` FastAPI dependencies; 403 on insufficient role
- ✅ `TokenResponse` includes `role` and `email` on login
- ✅ `GET/POST/PUT/DELETE /users` (admin only); `GET /users/me`
- ✅ Self-delete guard (409 if admin deletes own account)
- ✅ `/internal/users` endpoint removed; replaced by JWT-protected `/users`
- ✅ Frontend: `AuthCtx` stores role + email; role-based nav in Sidebar
- ✅ All action buttons removed from DOM (not disabled) for viewer role
- ✅ Admin-only `/users` page with inline role editor, password reset, add/delete user

## ✅ Phase 6.6 — Dark Theme

- ✅ FOUC-prevention inline script in `index.html` sets `data-theme` before CSS loads
- ✅ `[data-theme="dark"]` token block in `global.css` overrides all CSS custom properties
- ✅ Hardcoded-colour overrides for status chips, alerts, banners, dropzone, image placeholders
- ✅ `useTheme()` hook in `hooks.ts`; persists preference in `localStorage` (`sharkid-theme`)
- ✅ Toggle switch (☀️/🌙) in sidebar footer; defaults to OS `prefers-color-scheme`

## ✅ Phase 7 — Backup & Operations

52. ✅ Write PostgreSQL backup script (`scripts/backup-db.sh` — pg_dump → gzip)
53. ✅ Write MinIO snapshot/sync script (`scripts/backup-minio.sh` — mc mirror via Docker)
54. ✅ Document restore procedure (`docs/RESTORE.md`)
55. ✅ Healthcheck endpoints — `GET /health` on ML service; backend `/health` implemented
56. ✅ Docker restart policies — `restart: unless-stopped` on all services

## Phase 8 — Testing & Hardening

57. Backend: unit tests for auth, entity CRUD, validation logic
58. Backend: integration tests for photo upload → classification → validation flow
59. ML service: test classification pipeline with sample shark photos
60. Frontend: manual end-to-end walkthrough of all use cases (UC-01 to UC-13)
61. Verify acceptance criteria from `docs/03_user_stories_acceptance.md`
62. Load realistic dataset, tune global confidence threshold

## Phase 9 — Production Deployment

63. Choose deployment target (VPS, self-hosted server, cloud VM)
64. Configure HTTPS (Let's Encrypt or internal CA)
65. Set up production environment variables and secrets management
66. Deploy all services via Docker Compose
67. Run full smoke test in production environment
68. Enable and verify backup schedules
