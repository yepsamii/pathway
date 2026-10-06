# Phase 09 — Notification Module

**Goal:** A standalone feature module inside the monolith that subscribes to payment/transfer events and simulates user notifications (logs for now, real email/SMS in production). Idempotent, retry-aware via the outbox pattern.

**Problem doc sections:** §15

---

## Requirements

### Module identity
- `src/modules/notification/`
- Subscribes (via `@nestjs/event-emitter`) to events emitted by the outbox relay
- Owns `notifications.*` tables

### Event handling
On `PaymentSucceeded`:
- Look up user from event metadata
- Render: `"Payment ৳500 successful. Transaction ID: tx_..."`
- Insert into `notifications.notifications_log`
- "Send" = log to stdout (simulated delivery)
- ACK (mark processed)

On `PaymentFailed`:
- Render: `"Payment of ৳500 failed. Reason: ..."`

On `TransferCompleted`:
- Render: `"You sent ৳X to user Y"` and `"You received ৳X from user Z"`

On `RefundCreated`:
- Render: `"Refund of ৳X processed"`

### Idempotency
- Use `processed_events` table from phase 08
- Second delivery of same `event.id` → no duplicate notification

### Retry
- Failed render or DB write → throw → outbox relay records attempt + error → exponential backoff
- Outbox relay re-emits until processed_events dedupe lets it OR max attempts reached
- Add a `dead_letter` state in `outbox_events` for terminal failures

### Authorization
- N/A (service has no end-user endpoints)

---

## Structure & Tools

### Module: `src/modules/notification/`
- `notification.module.ts` — imports `messaging`
- `notification.controller.ts` (optional, for `/notifications` admin/debug endpoint)
- `notification.service.ts` — render + persist
- `consumers/payment.consumer.ts`
- `consumers/transfer.consumer.ts`
- `templates/` — TS functions for message text

### Tables
- `notifications.notifications_log` (phase 02)

### Tools
- `@nestjs/event-emitter`
- pino logger
- Notification templates (simple TS, easy to add i18n later)

### What it does NOT do
- No real email/SMS provider (use a `NotificationSender` interface with `LogSender` for now; easy to swap for `SmtpSender` later)
- No push notifications
- No user preferences

---

## Acceptance Criteria

- [ ] In-process event bus wired on app start
- [ ] Payment events produce log entries
- [ ] Transfer events produce two notifications (sender + receiver)
- [ ] Duplicate event (manual replay) → only one notification row created
- [ ] Simulated failure (throw inside handler) → retry with backoff, eventually DLQ
- [ ] Notification rows persist in `notifications_log`
- [ ] `/health` returns 200; `/ready` returns 200 when DB + Redis reachable

---

## Tests
- Unit: template rendering for each event type
- Integration: emit events via test harness, assert notifications logged
- Failure: throw inside handler, assert retry behavior

---

## Self-test

> Why is the notification module allowed to be down (or its handler buggy) without blocking payments? Walk through the system from `POST /payments` to "user gets the SMS" and identify every async boundary.

Trace:
1. Payment request → DB transaction commits (transaction + outbox row)
2. Response returned to client (payment succeeded from client's perspective)
3. Outbox relay (next loop) reads the unpublished event
5. notification handler subscribes via event bus, writes notification row
6. User eventually gets the notification (could be ms later or seconds)

**No step is in the synchronous request path** after the DB commit. If the notification handler is broken:
- Outbox accumulates retry attempts
- Payments still succeed (the user's money moved correctly)
- Notifications may be late but they aren't lost

This is the entire point of message-driven architecture, even in-process.