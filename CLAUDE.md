# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tiger shark identification and observation tracking system for marine biologists. Researchers photograph sharks underwater and the system auto-identifies individuals by their unique spot patterns near the mouth.

**Status: Pre-implementation.** A pure-HTML/CSS/JS UI prototype exists in `prototype/`. No backend or frontend framework code yet.

## Planned Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Python, FastAPI, JWT auth |
| Frontend | React SPA |
| Database | PostgreSQL |
| File storage | MinIO (S3-compatible) |
| ML service | Python (separate service) |

**System flow:** React SPA → FastAPI backend → PostgreSQL + MinIO + ML Service

## Domain Model

### Core Entities

**Shark** — catalog entry for an identified individual
- `id`, `display_name`, `name_status` (`temporary` | `confirmed`), `created_at`, `profile_photos`
- New sharks get a suggested temporary name from Harry Potter female characters (user can accept or replace)

**Photo** — uploaded image, stored in MinIO
- `id`, `object_key` (MinIO key), `uploaded_at`, `content_type`, `size`
- `exif_payload` (full EXIF as JSON), normalized: `taken_at`, `gps_lat`, `gps_lon`
- `processing_status`: `uploaded` → `processing` → `ready_for_validation` | `error`
- `top5_candidates` with confidence scores

**DiveSession** — groups photos and observations from one dive
- `id`, `started_at`, `ended_at`, `location_id`, `comment`, list of `photo_id`s

**Observation** — journal entry for a shark encounter
- `id`, `dive_session_id`, `shark_id`, `photo_id`, `taken_at`, `location_id`, `comment`, `confirmed_at`
- Always created as draft; user confirmation always required

**Location** — reference catalog of dive spots
- `country`, `spot_name`, `coordinates`; editable by all users

### ML Pipeline (UC-05)

1. Detect snout region in photo
2. Generate feature embeddings
3. KNN search against known sharks
4. Return top-5 candidates with scores
5. Apply global confidence threshold
6. Set photo status to `ready_for_validation`

## Fixed Architectural Decisions (docs/04_assumptions_scope.md)

- No role-based access control in MVP (single user type, auth required)
- Global threshold for new-shark identification (not per-shark)
- Top-5 candidates (fixed list size)
- Accepted image formats: JPEG and PNG only; others rejected at upload
- No data export functionality
- Regular PostgreSQL dump + MinIO snapshot backups are mandatory

## Key Business Rules

- All ML auto-classifications must be confirmed by the user (UC-06 validation queue)
- Photos upload without shark association; shark linking happens during validation
- Observations are auto-created as drafts from EXIF metadata; user edits/confirms
- During validation the user can: confirm top candidate, select different shark, create new shark, or leave unlinked

## UI Specification — HTML Prototype

The `prototype/` directory contains the authoritative UI specification. Open `prototype/login.html` in a browser to navigate the full prototype. All page layouts, interactions, field names, and status labels defined here are canonical — the React frontend must match them.

| File | Screen | Key interactions |
|------|--------|-----------------|
| `login.html` | Login | Form submit → `dive-sessions.html` |
| `dive-sessions.html` | Session list | Inline "New Session" form (toggle); session cards link to detail |
| `dive-session-detail.html` | Session detail | Photo upload dropzone (JPEG/PNG); photo grid with status badges (`uploaded`, `processing`, `ready_for_validation`, `error`, `confirmed`); observations table |
| `validation-queue.html` | Validation queue | Side-by-side layout: large photo on left, ranked candidate list on right; action buttons: **Confirm Selected**, **Select Other Shark** (picker modal with search), **Create New Shark** (modal with suggested HP name + profile photo checkbox), **Leave Unlinked**; Prev/Next navigation |
| `sharks.html` | Shark catalog | Grid view; live search by name; filter by `confirmed` / `temporary` name status |
| `shark-detail.html` | Shark profile | Stats row; profile photo strip (primary = teal border); observation timeline; Rename modal (name + status dropdown) |
| `observation-detail.html` | Observation | Draft form: shark selector, session, datetime, location, comment; collapsible raw EXIF panel; **Confirm Observation** locks all fields permanently |
| `locations.html` | Location catalog | Table with search + country filter; inline "Add Location" form; Edit modal; Delete with confirm dialog |

### Design system (`prototype/style.css`)

- **Palette:** `--navy #1b3a5c`, `--blue #2d7dd2`, `--teal #0d9e93`, `--bg #f0f4f8`
- **Layout:** fixed sidebar (224 px) + scrollable main content
- **Status chips:** `.s-uploaded`, `.s-processing`, `.s-ready`, `.s-error`, `.s-temporary`, `.s-confirmed`, `.s-draft`
- **Photo placeholders:** coloured boxes with 🦈 emoji (replace with real `<img>` in React)
- **Modals:** `.modal-overlay` + `.modal` — toggled via `.open` class

### Prototype conventions to carry into React

- Sidebar active state: highlight current section with teal left border
- Validation queue is the only page with badge count (pending photo count)
- `name_status` is always shown next to the shark name — `temporary` in purple, `confirmed` in green
- Observation confirmation is **irreversible** — fields lock after confirm; this must be enforced by the API too
- New shark name suggestions cycle through Harry Potter female character names

## Documentation

All requirements are in `docs/` (written in Russian):
- `01_domain_overview.md` — entities and domain context
- `02_use_cases.md` — UC-01 through UC-10
- `03_user_stories_acceptance.md` — MVP acceptance criteria
- `04_assumptions_scope.md` — fixed decisions
- `05_architecture.md` — tech stack and component overview
- `ROADMAP.md` — 9-phase implementation plan (68 numbered steps)
