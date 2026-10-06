# Phase 12 — Docker, CI/CD, Load Test, Documentation

**Goal:** Production-grade deployment: container image, K8s deployment with HPA + resource limits, a CI pipeline that runs lint/test/build, a load test that finds and documents a real bottleneck, and complete docs so the project is interview-ready.

**Problem doc sections:** §25, §26, §27, §28, §29, §30

---

## Requirements

### Docker
- One Dockerfile for the monolith (multi-stage: deps → build → runtime)
- Root image: `node:22-slim` or `node:22-alpine`
- Non-root user
- `tini` as PID 1
- `.dockerignore` excludes `node_modules`, `dist`, `.env`, `coverage`, `docs`

### docker-compose.yml
- **Single compose file** with profiles:
  - `infra` profile — Postgres + Redis
  - `app` profile — the monolith container
  - `monitoring` profile — Prometheus + Grafana (optional)
- Volumes for Postgres persistence
- Healthchecks on every container

### Kubernetes manifests (`deploy/k8s/`)
For the monolith:
- `Deployment` (3 replicas)
- `Service` (ClusterIP)
- `ConfigMap` for non-secret env
- `Secret` for secrets (manual apply)
- `Ingress` for external access
- `livenessProbe` → `/health`
- `readinessProbe` → `/ready`
- Resource requests + limits (CPU 200m/1000m, memory 256Mi/512Mi as starting point)
- `HorizontalPodAutoscaler` (CPU 70%)

Postgres and Redis: in production these are managed services (RDS, ElastiCache). For local K8s demo, use `bitnami/postgresql` and `bitnami/redis` Helm charts or simple StatefulSets. Document that production uses managed.

A `kustomization.yaml` to apply everything.

### CI/CD (`.github/workflows/`)
Pipeline:
1. **Lint** — ESLint on whole src/
2. **Test** — Jest unit + integration (with Postgres + Redis services in job)
3. **Build** — `pnpm build`
4. **Security** — `npm audit --audit-level high`, optional Trivy scan
5. **Push** — build Docker image, tag with commit SHA, push to GHCR

Out of scope (document): ArgoCD deployment to a real cluster.

### Load test (k6)
- `tests/load/payments.js`
- Scenario: 100 concurrent VUs, target 500 RPS, 5 min
- Measure: p50, p95, p99, error rate, throughput
- **Find one real bottleneck** (likely candidates: PG connection pool, single wallet hot-row contention, JSON serialization overhead, missing composite index)
- Document before/after:
  - Problem statement
  - Measurement
  - Hypothesis
  - Fix
  - Measurement after

### Documentation
Create at repo root:
- `README.md` — quick start, architecture summary, links to docs
- `ARCHITECTURE.md` — module diagram (with monolith vs future microservices note), module responsibilities, DB ownership, request flow, event flow, scaling strategy, extraction path
- `DATABASE.md` — schema overview, every index with justification, EXPLAIN ANALYZE report, isolation level decision
- `API.md` — endpoint reference with examples, auth, idempotency
- `FAILURE_SCENARIOS.md` — all 10 scenarios from PROBLEM.md §23 with how this system handles each
- `PERFORMANCE.md` — load test setup, baseline, bottleneck found, optimization, after
- `DEPLOYMENT.md` — local (compose), K8s (kustomize), CI/CD

---

## Structure & Tools

### Tools
- Docker multi-stage builds
- `docker compose` v2
- `kubectl`, `kustomize`
- `kind` or `minikube` for local K8s
- GitHub Actions
- `k6` for load testing
- Markdown

### Decisions to make and document
- **Replicas**: 3 stateless monolith pods
- **Resource limits**: CPU 200m/1000m, memory 256Mi/512Mi; tune after load test
- **HPA**: target 70% CPU utilization
- **Postgres/Redis in K8s**: NOT recommended for production — use managed. Local: docker-compose for dev, kind+helm optional for K8s demo
- **Why monolith is acceptable for this project**: simpler ops, same module boundaries, easier extraction when needed

---

## Acceptance Criteria

### Docker
- [ ] Dockerfile builds successfully
- [ ] Image < 300MB (alpine + multi-stage)
- [ ] Container runs as non-root
- [ ] `docker compose --profile infra up` starts Postgres + Redis
- [ ] `docker compose --profile app up` adds the monolith

### K8s
- [ ] `kubectl apply -k deploy/k8s/` succeeds on fresh kind cluster
- [ ] All pods become Ready within 2 minutes
- [ ] Killing a pod triggers replacement
- [ ] HPA scales up under load
- [ ] Liveness probe restarts a stuck pod
- [ ] Readiness probe removes a pod with down DB from load balancer

### CI/CD
- [ ] PR triggers pipeline
- [ ] Pipeline fails on lint error, test failure, build error
- [ ] On merge to main, Docker image pushed to GHCR

### Load test
- [ ] `k6 run tests/load/payments.js` runs against local stack
- [ ] Baseline numbers captured in `PERFORMANCE.md`
- [ ] One bottleneck identified, optimized, after-numbers captured
- [ ] p99 latency documented

### Docs
- [ ] All 7 markdown files exist at repo root
- [ ] `ARCHITECTURE.md` has the system diagram (ASCII or mermaid)
- [ ] `FAILURE_SCENARIOS.md` covers all 10 scenarios
- [ ] `DATABASE.md` has the EXPLAIN ANALYZE report

---

## Self-test (the final one)

> You're in an interview. They ask: "Walk me through what happens when I send ৳500 to my friend in your system." Give the answer using your plan as the script — phase by phase — without skipping steps. The depth you can go into is exactly what this plan measured.

Complete trace:
1. **Auth**: `POST /auth/login` → JWT
2. **Request hits middleware**: request_id generated, logged, JWT verified, rate-limit checked
3. **Idempotency check**: header parsed, key hashed, DB lookup
4. **Transfer logic**: `prisma.$transaction` → `SELECT FOR UPDATE` on both wallets in deterministic order → balance check → INSERT transaction PENDING → debit → credit → status SUCCESS → outbox INSERT (same tx)
5. **Response**: 200 with transaction_id
6. **Outbox relay** (next tick): polls, emits via in-process event bus
7. **Notification module**: receives event, dedupes, logs notification
8. **Webhook module**: receives event, looks up merchant, signs payload, POSTs
9. **Metrics**: counters increment, histograms update
10. **Logs**: every step has the same `request_id` in ONE log file

If you can describe all of that confidently, you're ready for the interview.

### Interview answer for "why monolith?"
"Because for this team size and traffic profile, a monolith gives me module-level isolation (the boundaries I'd defend in any architecture) without the operational overhead of distributed systems. I can show this same codebase running as separate services later by swapping the in-process event bus for RabbitMQ and the cross-module method calls for HTTP. The outbox pattern and idempotency don't change. Most monolith-to-microservices migrations succeed precisely because they kept module boundaries clean from the start."