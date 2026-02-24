-- SharkID — initial database setup.
-- Schema is managed by Alembic migrations (Phase 3).
-- This file runs once when the PostgreSQL container is first created.

-- Ensure the database exists with UTF-8 encoding.
-- (Postgres creates it from POSTGRES_DB env var automatically;
--  this file is the place to add extensions or initial config.)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for future trigram text search
