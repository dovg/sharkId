# Roadmap

## Phase 1 — Infrastructure & Project Skeleton

1. Create monorepo structure: `backend/`, `frontend/`, `ml/`, `infra/`
2. Write `docker-compose.yml` with services: FastAPI, PostgreSQL, MinIO, ML service
3. Configure environment variables and `.env.example`
4. Set up PostgreSQL with initial empty schema, run via Docker
5. Set up MinIO bucket and access credentials
6. Verify all services start and communicate

## Phase 2 — HTML UI Prototype

7. Create `prototype/` directory with plain HTML/CSS/JS files, no build step
8. Login page
9. Location catalog page: list, search, add form
10. Dive sessions list and create session form
11. Dive session detail: photo upload area, photo grid with mock status badges
12. Validation queue page: candidate card with top-5 list, action buttons (confirm / select / new shark / skip)
13. Create new shark modal: suggested name field, accept/override controls
14. Shark catalog page: list, search, shark card with profile photos and observation history
15. Observation detail: editable fields, confirm button
16. Review prototype with stakeholder, collect UI/UX feedback before backend work begins

## Phase 3 — Backend: Core

17. Initialize FastAPI project with dependency management (uv or pip + requirements.txt)
18. Set up Alembic for database migrations
19. Implement authentication: user table, JWT issue/refresh/validate, session expiry
20. Create DB models: `Location`, `Shark`, `Photo`, `DiveSession`, `Observation`
21. Write and apply initial Alembic migration
22. Implement MinIO client wrapper (upload, get URL, delete)

## Phase 4 — Backend: REST API

23. `POST /auth/login`, `POST /auth/logout`
24. `GET/POST/PUT/DELETE /locations` — location catalog CRUD
25. `GET/POST/PUT/DELETE /dive-sessions` — dive session management
26. `POST /dive-sessions/{id}/photos` — photo upload (JPEG/PNG validation, save to MinIO, create Photo record, enqueue classification)
27. `GET /photos/{id}` — photo detail with processing status and top-5 candidates
28. `GET /photos/validation-queue` — list photos with status `ready_for_validation`
29. `POST /photos/{id}/validate` — accept candidate / select shark / create new shark / leave unlinked
30. `GET/POST/PUT /sharks` — shark catalog CRUD
31. `GET /sharks/{id}` — shark card with profile photos and observation history
32. `GET/PUT /observations/{id}` — observation draft edit and confirmation

## Phase 5 — ML Service

33. Set up Python ML service project (FastAPI or simple HTTP server)
34. Implement snout region detection (face/ROI detection model or heuristic)
35. Implement feature embedding generation for detected region
36. Implement KNN search against stored shark embeddings
37. Return top-5 candidates with confidence scores and apply global threshold
38. Expose `POST /classify` endpoint accepting image bytes, returning candidates
39. Store/update embeddings when a shark gets a new confirmed profile photo
40. Integrate ML service call into backend photo upload pipeline (async task or direct call)

## Phase 6 — Frontend

41. Initialize React project (Vite + TypeScript recommended)
42. Set up routing and auth guard (redirect to login if no valid token)
43. Login page
44. Location catalog page: list, search by country/spot, add new location
45. Dive sessions page: list, create session (location, dates, comment)
46. Dive session detail: photo upload, photo grid with processing status indicators
47. Validation queue page: display best candidate + top-5, action buttons (confirm / select / new shark / skip)
48. Create new shark flow: suggested temporary name, accept or override, `name_status` display
49. Shark catalog page: list, search by name, open shark card
50. Shark card: profile photos, observation history timeline
51. Observation detail: editable draft fields, confirm button

## Phase 7 — Backup & Operations

52. Write PostgreSQL backup script (pg_dump) and schedule via cron or systemd timer
53. Write MinIO snapshot/sync script and schedule
54. Document restore procedure
55. Add healthcheck endpoints to backend and ML service
56. Configure Docker restart policies for production resilience

## Phase 8 — Testing & Hardening

57. Backend: unit tests for auth, entity CRUD, and validation logic
58. Backend: integration tests for photo upload → classification → validation flow
59. ML service: test classification pipeline with sample shark photos
60. Frontend: manual end-to-end walkthrough of all 10 use cases (UC-01 to UC-10)
61. Verify acceptance criteria from `docs/03_user_stories_acceptance.md`
62. Load a realistic dataset, tune global confidence threshold

## Phase 9 — Production Deployment

63. Choose deployment target (VPS, self-hosted server, cloud VM)
64. Configure reverse proxy (nginx or Caddy) with HTTPS
65. Set up production environment variables and secrets management
66. Deploy all services via Docker Compose (or equivalent)
67. Run full smoke test in production environment
68. Enable and verify backup schedules
