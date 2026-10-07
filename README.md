# PathPay

A modular-monolith digital wallet + payment system. Built as a learning + interview-prep project for PathPay's backend engineering interview.

## Stack

- **NestJS 12** (CommonJS) — modular monolith, one Node process
- **PostgreSQL 16** — source of truth for all financial state
- **Redis 7** — rate limiting + idempotency cache (Phase 06+)
- **Prisma** — ORM (raw SQL for money ops)
- **`@nestjs/event-emitter`** — in-process event bus (Phase 01)
- **Docker Compose** — local infrastructure only (no app container in v1)
- **GitHub Actions + k6** — CI/CD + load test (Phase 12)

## Project layout

```
src/
├── main.ts                       # bootstrap (port 3000, ValidationPipe)
├── app.module.ts                 # root module — wires everything
├── health/                       # /health (liveness) + /ready (DB+Redis)
├── modules/
│   ├── user/                     # Phase 03: register/login/refresh/guards
│   ├── wallet/                   # Phase 04: wallet CRUD, deposit, balance
│   ├── payment/                  # Phase 05+: transfers, merchant, idempotency
│   ├── notification/             # Phase 09: consumes internal events
│   └── webhook/                  # Phase 10: dispatches webhooks
├── common/                       # filters, pipes, decorators (Phase 11)
├── database/                     # Prisma client (Phase 02)
├── auth/                         # JWT strategy, guards (Phase 03)
└── observability/                # logger, request-id, metrics (Phase 11)

prisma/                           # Prisma schema + migrations (Phase 02)
deploy/                           # docker-compose.yml (infra only)
docs/plan/                        # 12-phase implementation plan
docs/                             # RESEARCH + design docs
```

## Quickstart

```bash
# 1. Install deps
pnpm install

# 2. Approve pnpm native-build scripts (one-time, after first install)
pnpm approve-builds   # then `a`, then `y`

# 3. Start Postgres + Redis
make infra-up

# 4. Copy env vars
cp .env.example .env

# 5. Run the app
make dev             # pnpm run start:dev — listens on :3000

# 6. Verify
curl http://localhost:3000/health   # → 200
curl http://localhost:3000/ready    # → 200 when DB+Redis up; 503 otherwise
```

## Scripts

| Command          | What it does                              |
|------------------|-------------------------------------------|
| `make dev`       | Start the app in watch mode               |
| `make build`     | Compile TypeScript                        |
| `make test`      | Run Jest (with `--passWithNoTests`)       |
| `make test-cov`  | Jest with coverage report                 |
| `make infra-up`  | Start Postgres + Redis (Compose)          |
| `make infra-down`| Stop containers (keep volumes)            |
| `make infra-reset` | DESTRUCTIVE: stop + remove volumes       |
| `make clean`     | Remove `dist/` + `coverage/`              |

## Phases

See [docs/plan/README.md](./docs/plan/README.md) for the full 12-phase plan and `docs/PROBLEM.md` for the challenge brief.

- **Phase 01 (this one)** — Monolith scaffold, infra, health endpoints ✓
- **Phase 02** — Postgres schema + Prisma migrations
- **Phase 03** — Auth (JWT, register/login/refresh, guards)
- **Phase 04** — Wallet module (create, balance, deposit)
- **Phase 05** — Transfers + concurrency (SELECT FOR UPDATE, deadlock handling)
- **Phase 06** — Idempotency-Key header, dedupe
- **Phase 07** — Redis rate limit + cache
- **Phase 08** — In-process event bus + outbox
- **Phase 09** — Notification module
- **Phase 10** — Webhook module
- **Phase 11** — Observability + error handling
- **Phase 12** — Docker, K8s, CI/CD, load test

## Architecture notes

- **One Node process. One deployable.** Modules have strict boundaries (`user`, `wallet`, `payment`, `notification`, `webhook`).
- **Postgres is the only authority for financial state.** Redis is never trusted for money.
- **Money is stored as `BIGINT` minor units (paisa).** Never `DECIMAL` in app code.
- **Every money-moving endpoint requires an `Idempotency-Key` header.**
- **One DB transaction = one row in `outbox_events`** (Phase 08). Never emit-then-commit.

Extraction path: when notification or webhook needs independent scaling, replace `@nestjs/event-emitter` with RabbitMQ and split the module into its own Nest app. Estimated 1-2 weeks per module. Documented in `docs/ARCHITECTURE.md` (Phase 12).