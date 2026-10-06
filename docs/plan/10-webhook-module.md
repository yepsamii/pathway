# Phase 10 — Webhook Module

**Goal:** A standalone feature module inside the monolith that subscribes to payment events and POSTs to merchant URLs with proper retry semantics, exponential backoff, HMAC signing, and idempotent delivery. Merchant endpoints can randomly fail — the system must handle that correctly.

**Problem doc sections:** §16, §23 (scenario 9)

---

## Requirements

### Module identity
- `src/modules/webhook/`
- Subscribes (via in-process event bus) to `payment.succeeded` and `payment.failed`
- Owns `webhooks.*` tables
- Port: no public HTTP API (consumer-only)

### Webhook delivery
On `PaymentSucceeded` event:
1. Look up merchant's webhook URL + secret from `merchants` table (extend `users` with `webhook_url` + `webhook_secret` for `role=MERCHANT`, OR create a `merchants` table — pick one and document)
2. Build payload: `{ event_id, transaction_id, amount_minor, currency, status, occurred_at, merchant_id }`
3. Sign: `HMAC-SHA256(secret, body)` → `X-PathPay-Signature` header
4. `POST` to merchant URL with timeouts (5s connect, 10s read)
5. On response:
   - 2xx → mark delivered
   - 4xx (except 408, 429) → mark failed permanently (no retry)
   - 408, 429, 5xx → schedule retry with exponential backoff

### Retry schedule (exponential backoff with jitter)
- Attempt 1: immediate
- Attempt 2: 30s + jitter
- Attempt 3: 2min + jitter
- Attempt 4: 10min + jitter
- Attempt 5: 1h + jitter
- After 5 attempts → mark `FAILED`, no more retries

### Storage
`webhooks.webhook_deliveries`:
- `id`, `merchant_id`, `transaction_id`, `event_id`, `payload`, `target_url`, `attempts`, `last_status_code`, `last_error`, `next_attempt_at`, `delivered_at`, `status` (PENDING/SUCCESS/FAILED)

A scheduler (in-process cron via `@nestjs/schedule`) wakes every N seconds and processes rows where `status='PENDING' AND next_attempt_at <= now()`.

### Duplicate event handling
- Use `event_id` to dedupe: if a row exists for `(merchant_id, event_id)` with status=SUCCESS → skip re-POST
- If status=FAILED → still attempt re-delivery (merchant may have fixed bug)

### Security
- HMAC signature in header
- `X-PathPay-Timestamp` to limit replay
- Document verification in `docs/API.md`

---

## Structure & Tools

### Module: `src/modules/webhook/`
- `webhook.module.ts`
- `consumers/payment.consumer.ts`
- `dispatcher/dispatcher.service.ts`
- `scheduler/scheduler.service.ts` (cron)
- `signer/signer.service.ts`
- `merchant/merchant.service.ts`

### Tools
- `undici` (or `axios` with timeouts) for HTTP
- `crypto` for HMAC
- `@nestjs/schedule` for cron
- `opossum` for circuit breaker around merchant calls (optional)

### Tables
- `webhooks.webhook_deliveries`
- Merchants either get fields added to `users` table (role=MERCHANT) OR a separate `merchants` table. Pick one.

---

## Acceptance Criteria

- [ ] Merchant receives POST on successful payment
- [ ] `X-PathPay-Signature` header present and valid HMAC
- [ ] Merchant returns 200 → row SUCCESS, no retry
- [ ] Merchant returns 500 → row PENDING, retried after backoff
- [ ] Merchant returns 400 → row FAILED, no retry
- [ ] 5 attempts of 5xx → row FAILED
- [ ] Duplicate event → no second POST
- [ ] Slow merchant (>10s) → request times out, treated as retryable
- [ ] Scheduler picks up due rows and dispatches them

---

## Tests

### Unit
- HMAC signing
- Backoff schedule calculation
- Status code classification (retryable vs permanent)

### Integration
- Spin up a mock merchant server with controllable response
- Success, 500, 400, timeout paths
- Duplicate event → no second POST
- Verify scheduling with short delays

### Failure
- 5 consecutive 500s → terminal FAILED, no 6th attempt

---

## Self-test

> A merchant's endpoint returns 500 for an hour. Your retry schedule fires 5 attempts. After that, you mark FAILED and stop. But what if their endpoint recovers at minute 61? Should you keep trying? What are the trade-offs?

Options:
1. **Stop after N attempts** (current design). Predictable, bounded cost, but merchant outage longer than your schedule → lost notifications.
2. **Dead-letter and alert ops** for manual replay. Production-grade.
3. **Slow retry forever** with capped backoff (e.g., max 24h). Tries indefinitely but at low rate. Cheap, unbounded.
4. **Hybrid**: 5 fast retries → DLQ → ops can "rescue" via admin endpoint to re-enqueue.

Document your answer in `docs/FAILURE_SCENARIOS.md`. The hybrid is the production answer.