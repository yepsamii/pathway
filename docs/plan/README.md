# PathPay — Implementation Plan

This folder breaks the PathPay challenge into **12 ordered phases**. Each phase is a self-contained plan you can complete, tick off the acceptance criteria, and move on.

**Stack (decided):** NestJS **modular monolith** (TypeScript) · PostgreSQL · Prisma + raw SQL for money ops · Redis · `@nestjs/event-emitter` (in-process) for async · Docker Compose · Kubernetes · GitHub Actions · k6

---

## Architecture decision: modular monolith

**One NestJS app, one Node process, one deployable.** Modules (`user`, `wallet`, `payment`, `notification`, `webhook`) are NestJS feature modules with strict boundaries:

- Each module has its own controller, service, repository
- Sync calls between modules use direct method calls (with explicit exports/imports)
- Async events flow through `@nestjs/event-emitter` (in-process)
- **Outbox pattern is still used** for durability — events written to DB in the same transaction as the business write, then a relay emits them via the in-process bus
- **No broker (RabbitMQ/Kafka) in v1.** When the system needs to scale horizontally or split modules, swap the relay's `EventEmitter.emit` for an `amqp.publish` — the outbox pattern and event payloads don't change

**Why monolith for this project:** faster to ship, fewer moving parts to debug, same module boundaries as microservices (so you can talk about "this would be a separate process in production"). Documented in `docs/ARCHITECTURE.md` with an extraction plan.

---

## Phase Index

| # | Phase | Goal | Problem Doc Sections |
|---|---|---|---|
| 01 | [Monolith Scaffold](./01-monorepo-scaffold.md) | Repo, NestJS app, infra up | §25 (partial) |
| 02 | [PostgreSQL Schema & Migrations](./02-postgres-schema-migrations.md) | Schema, constraints, indexes, EXPLAIN ANALYZE | §10, §11 |
| 03 | [Auth & JWT (User Module)](./03-auth-jwt.md) | Register, login, refresh, guards, RBAC | §19, §20 |
| 04 | [Wallet Module](./04-wallet-service.md) | Create wallet, balance, deposit | §3, §4 |
| 05 | [Transfers & Concurrency](./05-transfers-concurrency.md) | P2P transfer, SELECT FOR UPDATE, deadlock handling | §5, §9 |
| 06 | [Idempotency](./06-idempotency.md) | Idempotency-Key header, dedupe, replay safety | §8, §14 |
| 07 | [Redis — Rate Limit & Cache](./07-redis.md) | Throttler, cache hot reads, failure fallback | §12 |
| 08 | [In-Process Event Bus + Outbox](./08-in-process-bus-outbox.md) | Outbox table, relay worker, idempotent consumer | §13, §14, §17 |
| 09 | [Notification Module](./09-notification-module.md) | Consume events, simulated delivery, retries | §15 |
| 10 | [Webhook Module](./10-webhook-module.md) | Webhook dispatch, exponential backoff, 5xx handling | §16 |
| 11 | [Observability & Error Handling](./11-observability-errors.md) | Request IDs, structured logs, metrics, error envelope | §21, §22 |
| 12 | [Docker, K8s, CI/CD, Load Test, Docs](./12-infra-cicd-perf.md) | Compose, manifests, GitHub Actions, k6, perf report | §25, §26, §27, §28, §29 |

---

## How to use these plans

1. Read the phase top-to-bottom before touching code.
2. Implement in the order the phase lists.
3. Tick the acceptance criteria checkboxes as you go.
4. Answer the **self-test question** out loud (or in writing) before moving to the next phase. If you can't, re-read the phase or dig into the linked PROBLEM.md sections.
5. Don't skip phases. Each phase builds on the previous one's tables, types, or patterns.

## Conventions

- **No frontend.** All "API" means REST/JSON over HTTP.
- **Money is stored as `BIGINT` minor units (paisa).** Never `DECIMAL` in app code, never `FLOAT`. Documented in phase 02.
- **PostgreSQL is source of truth.** Redis is never the authority for financial state.
- **Each module owns its schemas.** Cross-module data is shared via direct method calls (same process) or events (in-process bus), not direct DB access to other modules' tables.
- **Every money-moving endpoint requires an `Idempotency-Key` header.** No exceptions.
- **One DB transaction = one row in `outbox_events`** (if it should produce an event). The relay emits. Never emit-then-commit.

## Out of scope (intentionally)

- Real bank/payment gateway integration (mocked)
- Real merchant endpoints (mocked with random failure)
- Frontend / admin dashboard
- Mobile push notifications (logged instead)
- Multi-currency conversion (BDT only for v1)
- Sharding / read replicas (documented as future work in PERFORMANCE.md)
- Message broker (RabbitMQ/Kafka) — only in-process event bus for v1

## Future extraction (when you need to scale)

When traffic or team size demands it, the path from monolith to microservices is well-defined:

1. Pick a module to extract (typically `notification` or `webhook` first — they have the most independent scaling needs)
2. Create a new NestJS app containing just that module
3. Replace `@nestjs/event-emitter` subscriber in the new app with a RabbitMQ consumer
4. Replace the in-process bus publish in the relay with `amqp.publish` to an exchange
5. Move the module's DB tables to a separate Postgres database
6. Repeat until each service owns its own data

Estimated effort: 1-2 weeks per module. The outbox pattern, idempotency, and event payload format don't change.

## Final interview test (from PROBLEM.md §34)

After all 12 phases are ticked, you should be able to answer:

> "Design a digital wallet and payment system that processes millions of transactions per day."

The self-test question at the end of every phase is a fragment of that answer.