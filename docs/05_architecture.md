# Архитектура системы

## Стек (фиксированные версии)

| Компонент | Технология |
|-----------|------------|
| Backend | Python 3.13, FastAPI 0.133, SQLAlchemy 2.0, Alembic 1.18, uvicorn 0.41 |
| Frontend | React 19, Vite 7, TypeScript 5.9, React Router 7 |
| БД | PostgreSQL 16 |
| Хранилище файлов | MinIO `RELEASE.2025-10-15T17-29-55Z` |
| ML-сервис | Python 3.13, FastAPI, NumPy, OpenCV, scikit-learn |
| Reverse proxy | nginx stable-alpine (1.28) |
| Авторизация | JWT (python-jose), bcrypt ≥ 5 |

---

## Топология сервисов (docker-compose)

| Сервис | Внутренний адрес | Хостовый порт |
|--------|-----------------|---------------|
| db (postgres:16) | db:5432 | 5433 |
| minio | minio:9000 | 9000, 9001 |
| minio-init (mc) | — | — (init-контейнер) |
| backend (FastAPI) | backend:8000 | 127.0.0.1:8000 |
| ml (FastAPI) | ml:8001 | 8001 |
| frontend (Vite) | frontend:5173 | 5173 |
| nginx | — | **80** (точка входа) |

**Единственная публичная точка входа — nginx:80.**
API: `http://localhost/api/` → backend:8000
Файлы: `http://localhost/photos/` → minio:9000/sharks-photos/

---

## Логическая схема

```
Browser
  └── nginx:80
        ├── /api/   → backend:8000   → PostgreSQL
        │                            → MinIO (upload/delete)
        │                            → ML service:8001 (bg tasks)
        ├── /photos/ → MinIO:9000/sharks-photos/   (публичное чтение)
        └── /       → frontend:5173 (Vite dev, WebSocket HMR)
```

---

## nginx (`infra/nginx/nginx.conf`)

- `resolver 127.0.0.11 valid=5s ipv6=off` + `set $var` — Docker DNS с переразрешением после рестарта контейнеров
- `/api/` → `http://$backend/` (regex-локация, стрипает `/api`)
- `/photos/` → `http://$minio:9000/sharks-photos/` (публичное чтение без auth)
- `/` → `http://$frontend:5173` (WebSocket upgrade для Vite HMR)
- `client_max_body_size 500m` (для загрузки видео)
- `/internal/` **не проксируется** на backend (доступен напрямую на порту 127.0.0.1:8000 с хоста)

---

## Backend (`backend/app/`)

```
config.py           ← pydantic-settings (DATABASE_URL, JWT_*, MINIO_*, ML_SERVICE_URL, PHOTO_BASE_URL)
database.py         ← engine (pool_size=10, max_overflow=20), SessionLocal, Base, get_db
main.py             ← FastAPI app; CORS: localhost/:3000/:5173; регистрация роутеров
models/
  user.py           ← User (id, email, password_hash, role, created_at)
  location.py       ← Location
  shark.py          ← Shark (display_name, name_status, main_photo_id)
  dive_session.py   ← DiveSession
  photo.py          ← Photo (processing_status, bbox, orientation, auto_detected, top5_candidates)
  observation.py    ← Observation (confirmed_at=NULL → черновик)
  video.py          ← Video (processing_status, frames_extracted)
  audit_log.py      ← AuditLog (action, resource_type, resource_id, detail, ip_address)
auth/
  jwt.py            ← create_access_token, decode_token
  dependencies.py   ← get_current_user, require_editor, require_admin, require_role()
storage/minio.py    ← singleton client; upload_file(), get_object_bytes(), get_presigned_url(), delete_file()
utils/
  photo.py          ← photo_url(photo), enrich_photo(photo) — используется во всех роутерах
  audit.py          ← log_event(db, user, action, resource_type, resource_id, detail, request)
  exif.py           ← extract_exif(), parse_taken_at(), parse_gps()
routers/
  auth.py           ← POST /auth/login, /auth/logout
  users.py          ← GET/POST/PUT/DELETE /users (require_admin); GET /users/me
  locations.py      ← CRUD /locations (lat/lon через Field bounds)
  dive_sessions.py  ← CRUD /dive-sessions; list включает shark_count/queue_count/shark_thumbs
  photos.py         ← upload (PIL verify + 50MB), validate, annotate, delete; bg-классификация
  videos.py         ← upload (Content-Length), bg-извлечение кадров ThreadPoolExecutor(4)
  sharks.py         ← CRUD /sharks; GET включает first_seen/last_seen из observations
  observations.py   ← GET/PUT /observations; GET инжектирует exif_payload из photo
  audit_log.py      ← GET /audit-log (require_editor); фильтрация по resource_type/id; пагинация
schemas/
  auth.py           ← TokenResponse (access_token, token_type, role, email)
  user.py           ← UserOut, UserCreate (default role=viewer), UserUpdate
  audit_log.py      ← AuditLogOut
```

### Ролевая модель (dependencies.py)

```python
require_editor = require_role('editor', 'admin')   # все мутирующие эндпоинты + аудит + очередь
require_admin  = require_role('admin')              # /users CRUD
```

Читающие GET-эндпоинты используют `Depends(get_current_user)` (доступны всем авторизованным).

### Миграции Alembic (в порядке применения)

1. `initial` — базовая схема
2. `add_validated_processing_status`
3. `add_photo_annotation_fields`
4. `add_shark_main_photo`
5. `add_photo_auto_detected`
6. `add_videos_table`
7. `add_audit_log_table`
8. `add_user_role` — `role VARCHAR(20) NOT NULL DEFAULT 'editor'`

---

## ML-сервис (`ml/`)

```
detector.py   ← auto_detect(): вычитание фона; detect_snout(): fallback
embedder.py   ← 106-мерный L2-вектор (64-dim HSV + 10-dim LBP + 32-dim spatial)
store.py      ← EmbeddingStore: numpy .npy + JSON (NOT pickle); thread-safe singleton
classifier.py ← KNN косинусное сходство, дедупликация по акуле, топ-5 выше порога
video.py      ← extract_shark_frames(); VIDEO_FRAME_INTERVAL; макс. 30 кадров
main.py       ← POST /detect, /classify, /embeddings, /process-video; GET /health
ml/data/      ← .gitkeep; *.npy / *.json — не в git
```

Фоновые задачи backend вызывают ML-сервис через HTTP (ML_SERVICE_URL=http://ml:8001).

---

## Frontend (`frontend/src/`)

```
api.ts          ← все API-запросы; 401 → clearAuth + редирект /login
types.ts        ← TypeScript-интерфейсы всех доменных объектов; Role = 'admin'|'editor'|'viewer'
auth.tsx        ← AuthCtx: token, role, email в localStorage; setAuth(), clearAuth()
App.tsx         ← роутинг; Guard (проверка авторизации); AdminGuard (/users → require admin)
components/
  Sidebar.tsx        ← role-based nav; Validation Queue / Audit Log скрыты для viewer; Users только для admin
  Lightbox.tsx       ← onPrev/onNext + keyboard ←/→/Esc
  EventHistory.tsx   ← shared timeline-карточка (emoji + label + дата + пользователь)
  Modal.tsx, StatusBadge.tsx
pages/
  Login.tsx                ← setAuth(token, role, email) из ответа /auth/login
  Sharks.tsx               ← каталог; стартовая страница (/); Delete скрыт для viewer
  DiveSessions.tsx         ← список; New/Delete скрыты для viewer
  DiveSessionDetail.tsx    ← фото-грид; видео-загрузка; список распознанных акул; Edit/Upload/Delete скрыты для viewer
  ValidationQueue.tsx      ← клавиатурная навигация; bbox-оверлеи; превью кандидатов
  PhotoDetail.tsx          ← 3-шаговая аннотация (draw/read-only для viewer); Delete скрыт
  SharkDetail.tsx          ← first/last seen; полоса фото; Rename/Delete/★ скрыты для viewer
  ObservationDetail.tsx    ← поля read-only + кнопки скрыты для viewer и confirmed
  Locations.tsx            ← Add/Edit/Delete скрыты для viewer
  AuditLog.tsx             ← глобальная таблица событий; ссылки на ресурсы; load-more пагинация
  Users.tsx                ← admin-only; inline role-select; Reset Password; Add User; Delete (без self)
```

---

## Бэкап

- Регулярный дамп PostgreSQL (pg_dump).
- Регулярный snapshot MinIO.
- Процедура восстановления задокументирована в README/операционной документации.
