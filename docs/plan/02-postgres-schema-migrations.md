# Phase 02 — PostgreSQL Schema & Migrations

**Goal:** Design and create the complete relational schema that will be the source of truth for the entire system. Includes tables, indexes, and a documented EXPLAIN ANALYZE investigation. The schema lives in **one Postgres database with schema-per-module isolation**, owned by a single NestJS app.

**Problem doc sections:** §10, §11

---

## Requirements

### Database ownership
**One PostgreSQL instance. One database. Schema-per-module isolation.** In production you'd split DBs per service entirely. Document this trade-off in `docs/DATABASE.md` (written in phase 12, decided now).

Schemas:
- `users` — owned by `modules/user`
- `wallets` — owned by `modules/wallet`
- `payments` — owned by `modules/payment` (includes `transactions`, `idempotency_keys`, `outbox_events`)
- `notifications` — owned by `modules/notification`
- `webhooks` — owned by `modules/webhook`

Since this is a monolith, all modules connect to the same DB. The schema separation is for **discipline, not isolation** — it lets you grep for cross-schema access and enforce "users table is only touched by `modules/user`" via code review or even future migration triggers.

### Tables

**`users.users`**
- `id` UUID PK (default `gen_random_uuid()`)
- `name` TEXT NOT NULL
- `email` CITEXT UNIQUE NOT NULL
- `phone` TEXT UNIQUE NOT NULL
- `password_hash` TEXT NOT NULL
- `role` ENUM('USER','MERCHANT','ADMIN') NOT NULL DEFAULT 'USER'
- `status` ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE'
- `created_at`, `updated_at` TIMESTAMPTZ

**`users.refresh_tokens`**
- `id` UUID PK
- `user_id` UUID FK → `users.id` ON DELETE CASCADE
- `token_hash` TEXT UNIQUE NOT NULL
- `expires_at` TIMESTAMPTZ NOT NULL
- `revoked_at` TIMESTAMPTZ NULL
- `created_at` TIMESTAMPTZ

**`wallets.wallets`**
- `id` UUID PK
- `user_id` UUID UNIQUE NOT NULL FK → `users.id`
- `balance_minor` BIGINT NOT NULL DEFAULT 0 — **always in paisa**
- `currency` CHAR(3) NOT NULL DEFAULT 'BDT'
- `status` ENUM('ACTIVE','FROZEN','CLOSED') NOT NULL DEFAULT 'ACTIVE'
- `version` BIGINT NOT NULL DEFAULT 0 (for optimistic locking discussions)
- `created_at`, `updated_at`
- **CHECK** `balance_minor >= 0` — DB refuses to make a wallet negative

**`payments.transactions`**
- `id` UUID PK
- `type` ENUM('DEPOSIT','TRANSFER','MERCHANT_PAYMENT','REFUND') NOT NULL
- `status` ENUM('PENDING','PROCESSING','SUCCESS','FAILED','REFUNDED') NOT NULL
- `source_wallet_id` UUID NULL FK → `wallets.id`
- `destination_wallet_id` UUID NULL FK → `wallets.id`
- `amount_minor` BIGINT NOT NULL CHECK (`amount_minor > 0`)
- `currency` CHAR(3) NOT NULL DEFAULT 'BDT'
- `idempotency_key` TEXT NULL
- `failure_reason` TEXT NULL
- `metadata` JSONB NOT NULL DEFAULT '{}'
- `created_at`, `completed_at`

Append-only. Status transitions enforced in code. Add `CHECK` to enforce legal state transitions if you can.

**`payments.idempotency_keys`**
- `key` TEXT PK
- `user_id` UUID NOT NULL FK
- `request_hash` TEXT NOT NULL
- `transaction_id` UUID NULL FK → `payments.transactions.id`
- `response_status` INT NULL
- `response_body` JSONB NULL
- `state` ENUM('IN_PROGRESS','COMPLETED','FAILED') NOT NULL DEFAULT 'IN_PROGRESS'
- `created_at`, `completed_at`, `expires_at` TIMESTAMPTZ

**`payments.outbox_events`**
- `id` UUID PK
- `aggregate_type` TEXT NOT NULL
- `aggregate_id` UUID NOT NULL
- `event_type` TEXT NOT NULL
- `payload` JSONB NOT NULL
- `routing_key` TEXT NOT NULL (used when extracted to broker)
- `created_at`, `published_at` (NULL = unpublished), `attempts`, `last_error`

> **Outbox note for monolith:** since the consumer is in-process, the outbox table still serves a purpose — durability across crashes. Phase 08 will use it even though there's no broker.

**`notifications.notifications_log`**
- `id`, `user_id`, `channel`, `template`, `payload`, `delivered_at`, `status`

**`webhooks.webhook_deliveries`**
- `id`, `merchant_id`, `transaction_id`, `payload`, `target_url`, `attempts`, `last_status_code`, `next_attempt_at`, `delivered_at`, `status`

### Indexes (justify each one in `docs/DATABASE.md`)
- `users(email)` — login lookup
- `users(phone)` — login by phone
- `refresh_tokens(token_hash)` — refresh lookup
- `refresh_tokens(user_id)` — list user's tokens for revoke
- `wallets(user_id)` — UNIQUE, balance lookup
- `wallets(id, status)` — composite for active-wallet checks
- Transactions:
  - `(source_wallet_id, created_at DESC)`
  - `(destination_wallet_id, created_at DESC)`
  - `(status, created_at DESC)`
  - `(type, created_at DESC)`
- `idempotency_keys(expires_at)` — cleanup job
- `outbox_events(published_at, created_at) WHERE published_at IS NULL` — **partial index** for the relay worker (also fast for the in-process version)

### SQL features to use
At least one query (each) using:
- JOIN
- GROUP BY + HAVING
- CTE
- subquery
- window function
- LIMIT/OFFSET pagination

### EXPLAIN ANALYZE investigation
Pick one query (transaction history with filter + pagination). Capture BEFORE → add index → capture AFTER. Document in `docs/PERFORMANCE.md`.

---

## Structure & Tools

### Tools
- PostgreSQL 16
- **Prisma** for schema, migrations, and most CRUD
- Plain SQL for: triggers, partial indexes, CHECK constraints Prisma can't express cleanly
- `prisma migrate dev` for migration workflow
- Seed script creates: 1 admin user, 2 test users, 1 merchant, 1 wallet each

### Money rules (same as before)
- Stored as `BIGINT` minor units (paisa)
- Never `DECIMAL` in app code, never `FLOAT`
- BigInt → serialize carefully in JSON

### Prisma schema location
- Single root `prisma/schema.prisma` (monolith = one schema file)
- All five logical schemas declared as `@@schema(...)`
- One Prisma client generated, injected at `app.module.ts` root

---

## Acceptance Criteria

- [ ] All 8 tables exist in correct schemas
- [ ] All CHECK constraints enforce at DB level (try `balance = -1` → fails)
- [ ] All FKs declared with explicit ON DELETE behavior
- [ ] All UNIQUE constraints exist
- [ ] All indexes from the list above present (`\d+` in psql)
- [ ] Partial index on `outbox_events(published_at) WHERE published_at IS NULL` exists
- [ ] Prisma client generates without warnings
- [ ] Seed script creates admin + 2 users + 1 merchant + wallets
- [ ] At least one query of each type (JOIN, GROUP BY+HAVING, CTE, subquery, window function, paginated LIMIT) is documented in `docs/DATABASE.md`
- [ ] EXPLAIN ANALYZE report saved in `docs/PERFORMANCE.md`

---

## Self-test

> A merchant requests a refund for a transaction that's already been refunded once. Your application code has a bug that sends two `UPDATE transactions SET status='REFUNDED'` queries concurrently. With your current schema, is this protected? Why or why not? What would you add to prevent it?

Hint: A unique partial index on `transactions(source_wallet_id, type) WHERE type='REFUND'` makes "one REFUND per transaction" enforceable at the DB level.