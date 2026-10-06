# Phase 07 — Redis: Rate Limiting, Caching, Failure Behavior

**Goal:** Use Redis for non-authoritative state — rate limiting on sensitive endpoints, caching hot reads (wallet balance), and graceful degradation when Redis is unavailable.

**Problem doc sections:** §12, §23 (scenario 2)

---

## Requirements

### Use Redis for at least three things
1. **Rate limiting** on `POST /payments`, `POST /transfers`, `POST /auth/login`
2. **Cache** wallet balance (TTL 60s)
3. **Distributed lock** for the idempotency claim (optional — DB FOR UPDATE is the default)

### Rate limiting
- `POST /payments`: 20 req/min/user
- `POST /transfers`: 60 req/min/user
- `POST /auth/login`: 10 attempts/minute/IP
- Strategy: sliding window (Redis sorted sets) or token bucket via Lua script
- 429 + `Retry-After` header
- Use `@nestjs/throttler` with Redis storage adapter

### Wallet balance cache
- Key: `wallet:balance:{wallet_id}`
- TTL: 60s
- Invalidated on any successful deposit, transfer, merchant payment (sender + receiver)
- Read path: try cache → DB → write to cache
- Cache failure must NOT fail the read — fall through to DB

### Failure behavior (Redis down)
- If Redis is unreachable:
  - **Rate limiter**: fail open (allow request, alarm fires via metric)
  - **Cache**: fall through to DB
- Document in `docs/FAILURE_SCENARIOS.md` (phase 12)
- `/ready` returns 503 if Redis is down (operator wants to know); `/health` always 200 (process is alive)

---

## Structure & Tools

### Folder: `src/redis/` (shared lib)
- `redis.module.ts`
- `redis.service.ts` (wrapping ioredis)
- `rate-limiter.service.ts` (sliding window / token bucket)
- `cache.service.ts` (`get/set/del/wrap`)
- All ops wrapped in try/catch → log + return null on failure

### Tools
- `ioredis`
- `@nestjs/throttler`
- `nestjs-rate-limiter-storage-redis` for Redis-backed throttler

### Application
- API root: rate limiting middleware (per-IP and per-user after JWT)
- Wallet module: cache `GET /wallets/:userId/balance`
- Payment module: invalidate cache after transfer/debit (synchronous DEL via Redis client)

---

## Acceptance Criteria

- [ ] 21st `POST /payments` within 60s by same user → 429 with `Retry-After`
- [ ] 11th `POST /auth/login` within 60s from same IP → 429
- [ ] `GET /wallets/:userId/balance` first call → DB hit
- [ ] Same call within 60s → cache hit (verify with timing or log)
- [ ] After successful transfer, sender's cache key is gone (next call is a DB miss → repopulates)
- [ ] **Redis stopped mid-test**: rate limiter fails open (requests succeed, logged); balance reads still work; `/ready` shows 503 for the gateway
- [ ] **Redis restarted**: state is consistent

---

## Tests

### Unit
- Sliding window logic
- Cache hit/miss flow
- Redis-down fallback path

### Integration
- Burst 21 payments, expect 429 on the 21st
- Verify cache invalidation on transfer
- **Stop Redis container, run request, verify graceful fallback, restart, verify normal**

---

## Self-test

> Your cache returns balance 500 to client A. Then a transfer of 200 debits the wallet. But the cache invalidation **fails** (Redis network blip). Client A calls `GET /balance` again — what do they see? Now imagine client A tries a 400 withdrawal. Does it succeed or fail?

Walk through:
1. Cache returns stale 500 (briefly wrong but eventually consistent)
2. Client withdraws 400 — DB lock takes `SELECT FOR UPDATE`, reads actual balance (300), checks 300 >= 400 → fails → 422

The point: **cache staleness is bounded and does NOT cause money loss** because every write path goes through the DB lock + CHECK constraint. The cache is just a read accelerator. This is exactly why Redis isn't the source of truth for balances.