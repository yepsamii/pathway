# Database

## Purpose

Records every schema decision, every index, every constraint, and the reasoning behind each. The source of truth for "why is the database shaped like this."

## Decisions

### Schema-per-module isolation (decided)

**Decision**: One Postgres database, one logical schema per module (`users`, `wallets`, `payments`, `notifications`, `webhooks`).

**Why**: In a true microservices world each module would have its own database. For this monolith we're keeping all schemas in one database, but separating them by name so that cross-schema access is visible (greppable) and reviewable. This is **discipline, not isolation** — nothing stops a query from joining across schemas at the database level, but the convention is "users tables are only touched by `modules/user`."

**Trade-off documented in phase 12 (infra)**: if/when this is split into services, the schema names give us a clean migration target — each schema becomes its own database.

**Source**: phase 02, line 12 of `docs/plan/02-postgres-schema-migrations.md`.

---

_To be expanded as phase 02 lands._