# Phase 01 — Monolith Scaffold

**Goal:** Get a runnable NestJS monolith with all modules (user, wallet, payment, notification, webhook) wired into one app. Each module is a NestJS module with a clear boundary (so it could be split later), but they all run in one Node process talking to one Postgres database. Plus: infra up via Docker Compose, health endpoints, env config.

**Problem doc sections:** §25 (Docker, partial)

---

## Requirements

### Topology (the important change)
**One NestJS app. One Node process. One deployable.**

The modules (user, wallet, payment, notification, webhook) are NestJS feature modules with strict internal boundaries:
- Each module has its own controller(s), service(s), repository
- Modules communicate via:
  - **Direct method calls** (with explicit module exports/imports) for sync ops
  - **Internal event bus** (`@nestjs/event-emitter` or a shared RxJS subject) for fire-and-forget notifications
- No HTTP between modules — same process, no network hop
- **RabbitMQ is NOT used inside the app.** It becomes a future split-point (phase 12 documents how you'd extract notification-service and webhook-service to separate processes by replacing the internal event bus with a real RabbitMQ publisher; out of scope for now)

### Repository structure
```
pathway/
├── src/
│   ├── main.ts                       # bootstrap
│   ├── app.module.ts                 # root module, imports everything
│   ├── modules/
│   │   ├── user/                     # register, login, refresh, guards
│   │   ├── wallet/                   # wallet CRUD, deposit, balance
│   │   ├── payment/                  # transfers, merchant payments, idempotency
│   │   ├── notification/             # consumes internal events, logs notifications
│   │   └── webhook/                  # consumes internal events, dispatches webhooks
│   ├── common/                       # filters, pipes, decorators, error codes
│   ├── database/                     # Prisma client, migrations, base repository
│   ├── auth/                         # JWT strategy, guards, decorators
│   └── observability/                # logger, request-id, metrics
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── deploy/
│   ├── docker-compose.yml            # ONLY infra (Postgres, Redis). No app service.
│   └── docker-compose.dev.yml
├── docs/plan/
├── .env.example
├── nest-cli.json                     # monorepo = false (single app)
├── package.json
├── tsconfig.json
└── Makefile
```

### Why this is good for the interview
- Same module boundaries as microservices (user, wallet, payment, notification, webhook) — you can talk about "this would be a separate process in production"
- Easier to demo: one `pnpm dev` starts everything
- Less infrastructure surface area; more focus on the hard parts (Postgres locking, idempotency, outbox, transactions)
- **Document in `docs/ARCHITECTURE.md` (phase 12):** "chosen for velocity; extraction path to true microservices is to replace the in-process event bus with RabbitMQ and split modules into separate Nest apps — estimated 2 weeks"

### Infra (Docker Compose)
**Compose runs ONLY infrastructure, NOT the app.** The app runs locally via `pnpm dev` or in a container via Dockerfile. Compose provides:
- PostgreSQL 16 (port 5432)
- Redis 7 (port 6379)

That's it for v1. RabbitMQ is removed from the monolith plan. If you need async in the future, you can:
- Use the in-process event bus (`@nestjs/event-emitter`) for v1
- Add RabbitMQ later as a swap-in when you split

### Health endpoints
- `GET /health` → 200 `{ status: 'ok', service: 'pathpay' }` (liveness — process is alive)
- `GET /ready` → 200 when DB + Redis reachable, 503 otherwise (readiness)
- Implement with `@nestjs/terminus`

### Tooling
- TypeScript `strict: true`
- ESLint + Prettier (NestJS defaults)
- Jest configured for unit + integration
- `nest-cli.json` with `monorepo: false` and `sourceRoot: 'src'`

---

## Structure & Tools

### Tools
- NestJS CLI (`@nestjs/cli`) with `--package-manager pnpm`
- `pnpm` (or npm — pick one)
- `@nestjs/event-emitter` for in-process events
- `@nestjs/terminus` for health checks
- `docker` + `docker compose` v2
- `make`

### Service port (only one now)
- API: **3000**

### Makefile targets (minimum)
- `make infra-up` — start Postgres + Redis
- `make infra-down` — stop containers (keep volumes)
- `make infra-reset` — stop + remove volumes (**destructive** — mark as such)
- `make dev` — start the app in watch mode
- `make build` — compile TypeScript
- `make test` — run Jest
- `make migrate` — apply Prisma migrations
- `make seed` — load dev seed data
- `make logs` — tail app logs

### Database access pattern
- All modules share **one Prisma client** injected at the root
- Each module's repository wraps raw queries (no Prisma model methods for money — same rule as before)
- Schema-per-module isolation is still in effect at the Postgres level (`users.*`, `wallets.*`, `payments.*`, `notifications.*`, `webhooks.*`)

### Event bus usage (instead of RabbitMQ for now)
- Modules that need async notifications (notification, webhook) subscribe to events on the in-process bus
- Payload schema is the same CloudEvents-ish format used in the original phase 08 — when you extract to microservices later, the payload shape is already broker-ready

---

## Acceptance Criteria

- [ ] `pnpm install` completes without errors
- [ ] `nest-cli.json` shows `monorepo: false`, `sourceRoot: "src"`
- [ ] `make infra-up` starts Postgres + Redis and health checks pass
- [ ] `make dev` starts the app on port 3000
- [ ] `GET /health` returns 200
- [ ] `GET /ready` returns 200 when DB + Redis are up
- [ ] `GET /ready` returns 503 with details when Postgres is stopped
- [ ] All five feature modules exist under `src/modules/` and are imported in `app.module.ts`
- [ ] `@nestjs/event-emitter` configured and a test event flows from `payment` module to `notification` module (a `console.log` is fine — phase 02)
- [ ] `.env.example` has every env var: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `NODE_ENV`, `PORT`, `LOG_LEVEL`
- [ ] `.gitignore` excludes `node_modules`, `dist`, `.env`, `coverage`
- [ ] `README.md` explains the layout and points to `docs/plan/`
- [ ] `make build` produces `dist/` without errors
- [ ] No references to RabbitMQ in this phase's code (it's out for v1)

---

## Tests to write
- Unit: nothing app-specific yet (modules are empty stubs)
- Smoke: `GET /health` and `GET /ready` return correct codes via supertest

---

## Self-test (answer out loud before phase 02)

> "Why did you choose a modular monolith over microservices for this project, and what is your extraction path if you later need to scale notification or webhook independently?"

Key points to cover:
- **Velocity**: one deployable, one process to debug, no Docker Compose service-to-service failures
- **Same boundaries**: module-level isolation is enforced via NestJS module exports; can be split later
- **Extraction path**: replace `@nestjs/event-emitter` with a RabbitMQ publisher (1-2 weeks); split `notification` and `webhook` modules into their own Nest apps; API gateway routes by path
- **When to split**: only when you hit specific scaling needs (notification fanout > 10k events/sec, webhook deliverers need independent deployment cadence) — not before
- **What you LOST by not using microservices from day 1**: forced independent deployability, runtime isolation (one bad module can't crash the API process), per-module tech stack choice — but those were not requirements for this demo

This is exactly the "monolith-first" argument from Sam Newman / Spotify engineering. Defend it.