# Phase 06 — Idempotency

**Goal:** Every money-moving endpoint must be safely retriable. Same `Idempotency-Key` + same body → return the original result. Same key + different body → reject. Concurrent duplicates → only one transaction succeeds.

**Problem doc sections:** §8, §14, §23 (scenarios 5, 6)

---

## Requirements

### Endpoints requiring Idempotency-Key
- `POST /wallets/:id/deposit`
- `POST /transfers`
- `POST /payments` (phase 09)
- Any future endpoint that creates/moves money

### Header
```
Idempotency-Key: <opaque-string, recommended UUID>
```
- Missing → 400 `IDEMPOTENCY_KEY_REQUIRED`
- Empty or > 255 chars → 400 `IDEMPOTENCY_KEY_INVALID`

### Behavior matrix
| Key seen? | Body same? | Outcome |
|---|---|---|
| No | — | Process |
| Yes | Yes | Return original response (200/201) from stored body |
| Yes | No | 422 `IDEMPOTENCY_KEY_CONFLICT` |
| Yes, in-progress | — | 409 `IDEMPOTENCY_IN_PROGRESS` |

### Implementation: `SELECT ... FOR UPDATE` on the idempotency row
- Two concurrent requests with same key → exactly one enters "process"; the other waits briefly or returns 409 + `Retry-After`
- For the monolith this lives in `src/modules/payment/idempotency/`

### Storage
Use the `payments.idempotency_keys` table from phase 02:
```
key, user_id, request_hash, transaction_id, response_status, response_body,
state, created_at, completed_at, expires_at
```

### Request hash
- SHA-256 of canonical JSON (sorted keys, no whitespace)
- Compared on subsequent requests with the same key

### TTL
- Rows expire 24h after creation
- Cleanup job (NestJS `@nestjs/schedule` cron) deletes `WHERE expires_at < now()`

### Lifecycle states
- `IN_PROGRESS` — key created, request being processed
- `COMPLETED` — terminal success, response stored, will be replayed
- `FAILED` — document your policy: replayable (consistent) OR releases key (allows retry)

---

## Structure & Tools

### Module: `src/modules/payment/idempotency/`
- `idempotency.service.ts` with:
  - `begin(key, userId, body)` → `{ isNew, row }` or throws 409
  - `complete(key, responseStatus, responseBody, transactionId)`
  - `fail(key, reason)`
  - `replay(key, requestHash)` → `{ responseStatus, responseBody }` or null
- `idempotency.interceptor.ts` (NestJS interceptor)
- Uses raw SQL for FOR UPDATE control

### Application
- `@Idempotent()` decorator on controller methods, OR explicit interceptor registration per endpoint

### Database
- Uses existing `payments.idempotency_keys` table
- Index on `(key)` (already PK)

---

## Acceptance Criteria

- [ ] Missing `Idempotency-Key` on deposit/transfer → 400
- [ ] Same key + same body, second request → returns original response, no new transaction
- [ ] Same key + DIFFERENT body → 422 `IDEMPOTENCY_KEY_CONFLICT`
- [ ] Concurrent duplicate with same key → only one transaction in DB
- [ ] FAILED state requests handled per your policy
- [ ] Cleanup deletes `expires_at < now()`
- [ ] State survives service restart (real DB, not mocks)

---

## Tests

### Unit
- Hash function stable regardless of key order
- Lifecycle state machine

### Concurrency (critical)
- 10 simultaneous `POST /transfers` with same key + body → 1 transaction in DB, others replay or 409
- 10 simultaneous `POST /transfers` with same key + DIFFERENT body → 1 conflict response, rest reject

### Failure
- Crash service AFTER processing but BEFORE storing response → on retry, key is `IN_PROGRESS`; recovery cron marks them FAILED → next retry can proceed

---

## Self-test

> A client sends `POST /payments` with `Idempotency-Key: K1`. The service inserts the idempotency row as `IN_PROGRESS`, begins the transfer, and crashes before storing the response. The key remains in `IN_PROGRESS` in the DB. The client retries 30s later with the same key. What should happen?

Options:
1. Block until stale row is cleared (bad UX)
2. Reject with 409 + Retry-After (acceptable)
3. Run a startup/periodic job that marks rows in `IN_PROGRESS` for more than X minutes as `FAILED` → retry can then re-process (best for availability)

Pick option 3 and implement a "stale claim recovery" cron. Classic interview talking point.