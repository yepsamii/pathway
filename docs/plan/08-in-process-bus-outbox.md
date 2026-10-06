# Phase 08 — In-Process Event Bus + Transactional Outbox

**Goal:** Asynchronous event delivery **inside the monolith** via `@nestjs/event-emitter`, combined with the **transactional outbox pattern** for durability. Events are inserted into a DB table in the same transaction as the business write, then a relay (in-process) reads from the outbox and emits via the in-process event bus. This gives you the same guarantees as a broker, with zero extra infrastructure. When you later extract modules to microservices, you swap the relay implementation for a RabbitMQ publisher — interface stays the same.

**Problem doc sections:** §13, §14, §17, §23 (scenarios 3, 8)

---

## Requirements

### Event types
```
pathpay.payments.deposit.completed
pathpay.payments.transfer.completed
pathpay.payments.payment.succeeded
pathpay.payments.payment.failed
pathpay.payments.refund.created
```

### Event payload (CloudEvents-ish)
```json
{
  "id": "evt_<uuid>",
  "type": "PaymentSucceeded",
  "source": "payment-service",
  "occurred_at": "2026-01-15T10:00:00Z",
  "transaction_id": "...",
  "request_id": "req_...",
  "data": { ... }
}
```

### Outbox pattern
- Every business operation that should emit inserts BOTH the business state AND an `outbox_events` row in **one DB transaction**
- A relay (in-process cron or `@nestjs/schedule` task) polls the outbox:
  - `SELECT FROM outbox_events WHERE published_at IS NULL ORDER BY created_at ASC LIMIT 100 FOR UPDATE SKIP LOCKED`
  - Emit on the in-process bus
  - On success → `UPDATE outbox_events SET published_at = now() WHERE id IN (...)`
  - On failure → increment `attempts`, store `last_error`, exponential backoff
- `SKIP LOCKED` allows horizontal scaling of the relay later (multiple instances won't double-publish)

### Why outbox even though there's no broker
The outbox is your **durability boundary**. Without it:
- Service writes transaction to DB
- Service emits event in-process
- Service crashes before notification module handles it
- Event lost

With outbox:
- Service writes transaction + outbox row in one DB tx (durable)
- Service may crash — outbox row remains
- Relay (or scheduler) on restart reads unpublished rows and replays them

The same pattern works when you extract to a real broker later — just swap the relay's emit() for `channel.publish()`.

### Idempotent consumers
- Consumers must dedupe by `event.id`
- Store processed event IDs in a small table (`processed_events`) or in Redis with TTL
- On duplicate → no re-run, just mark processed

### Module subscribers
- `notification` module subscribes to all `payment.*` and `transfer.*` events
- `webhook` module subscribes to `payment.succeeded` and `payment.failed`

### Reconnection / restart behavior
- `@nestjs/event-emitter` is in-process — no network failure
- After crash: outbox relay on next tick picks up unpublished events → bus emit → consumers run
- `/ready` does NOT check anything event-bus-related (no broker)

---

## Structure & Tools

### Folder: `src/messaging/` (shared lib)
- `messaging.module.ts` — imports `EventEmitterModule`
- `outbox-relay.service.ts` — the polling worker
- `outbox-relay.scheduler.ts` — `@nestjs/schedule` cron (or `setInterval` loop) that triggers relay
- `processed-events.service.ts` — dedupe table helpers

### Tools
- `@nestjs/event-emitter`
- `@nestjs/schedule`
- Raw SQL via Prisma for the relay loop (`FOR UPDATE SKIP LOCKED`)

### Tables used
- `payments.outbox_events`
- `processed_events(event_id PK, consumer TEXT, processed_at)` — new table in phase 02 or add now

### Where events are produced
- After successful deposit (wallet module writes the outbox row in its DB tx)
- After successful transfer (payment module writes the outbox row)
- After merchant payment success/failure (phase 09)
- After refund (phase 09)

The outbox row lives in the same DB tx as the originating business write.

---

## Acceptance Criteria

- [ ] `outbox_events` row inserted in same transaction as `transactions` row (verify with EXPLAIN or by simulating failure)
- [ ] Outbox relay emits events to the in-process bus within N seconds
- [ ] After successful emit, `outbox_events.published_at` is set
- [ ] Notification module receives event and writes a notification
- [ ] Duplicate event (manual replay) → consumer dedupes and does not re-execute
- [ ] **Crash test**: insert outbox row, kill the process before relay emits → restart → outbox row emits, no event lost
- [ ] **Subsystem down**: notification module handler throws → outbox row left unpublished, retried on next tick

---

## Tests

### Unit
- Outbox relay loop
- Consumer dedupe

### Integration
- Trigger a transfer, assert notification row appears and outbox row marked published
- Insert outbox row manually, run relay once, assert consumer was invoked

### Failure
- Kill the process after outbox insert but before publish → restart → assert event eventually delivered
- Notification handler throws → relay records attempt + error → retries

---

## Self-test

> A producer writes a transaction and an outbox row. The relay picks them up and the notification handler runs. The handler writes to `notifications_log` but **crashes before returning** (out of memory, killed mid-write, whatever). What does your system do to ensure the notification is not lost AND not duplicated?

The right pattern:
1. Handler is wrapped: `processed_events.findOrCreate(event_id)` — if it already exists, skip; otherwise mark processed and continue
2. Crash before write → `processed_events` doesn't have the row → next delivery re-runs the handler → dedupe table now has the row → handler runs successfully
3. Crash after processed_events insert but before notifications_log write → next delivery sees the dedupe row → SKIPS the handler → notification lost!

To avoid this, write the dedupe row **after** the business operation succeeds, not before. AND make the business operation itself idempotent (e.g., `INSERT ... ON CONFLICT DO NOTHING` on a unique key per event_id). This is defense in depth. Document your choice.

---

## Note for phase 12 (extraction)
When you eventually split this monolith, replace `@nestjs/event-emitter` with `amqplib`:
- The outbox relay writes to RabbitMQ instead of `EventEmitter.emit`
- Consumers move to separate processes
- Outbox pattern is unchanged
- Event payload format is unchanged
Estimated effort: 1-2 weeks.