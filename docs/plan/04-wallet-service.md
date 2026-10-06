# Phase 04 — Wallet Module

**Goal:** Wallet creation, balance lookup, and deposit. Balance never goes negative (DB CHECK + transaction logic). Every deposit produces an immutable transaction row + outbox event for downstream listeners.

**Problem doc sections:** §3, §4, §6 (partial)

---

## Requirements

### Endpoints (single API, port 3000)

```
POST   /wallets                        → create wallet for current user
GET    /wallets/:userId                → wallet details
GET    /wallets/:userId/balance        → just balance (cached in phase 07)
POST   /wallets/:id/deposit            → deposit money
GET    /wallets/:userId/transactions   → paginated history
```

### Wallet creation
- One wallet per user — enforced via `UNIQUE(user_id)`
- Auto-create on user registration (recommended) OR explicit endpoint
- `balance_minor` starts at 0
- `currency` defaults to BDT
- Caller must be authenticated and own the user_id (or be ADMIN)

### Deposit flow
- Body: `{ amount_minor: number, currency: 'BDT', reference?: string }`
- Header: `Idempotency-Key: <uuid>` (required — phase 06 implements; require from day 1)
- Validate `amount_minor > 0`
- Open DB transaction:
  1. `SELECT id FROM wallets WHERE id = $1 FOR UPDATE` — row lock
  2. `INSERT INTO payments.transactions (type=DEPOSIT, status=PENDING, destination_wallet_id, idempotency_key=...)`
  3. `UPDATE wallets SET balance_minor = balance_minor + $amount WHERE id = $1` (CHECK enforces non-neg)
  4. `UPDATE payments.transactions SET status='SUCCESS', completed_at=now()`
  5. `INSERT INTO payments.outbox_events (event_type='DepositCompleted', aggregate_id=tx_id, payload={...})` — in-process relay picks it up in phase 08
  6. COMMIT
- On failure: ROLLBACK; transaction marked FAILED with `failure_reason`

### Balance read
- Direct from `wallets` on first call
- Phase 07 adds Redis cache with TTL — not in this phase
- Return `{ balance_minor, currency, as_of }`

### Transaction history
- `GET /wallets/:userId/transactions?status=&type=&from=&to=&limit=&cursor=`
- Caller must own the wallet OR be ADMIN
- Cursor = base64 of `(created_at, id)` tuple

### Authorization
- USER: only own wallet
- MERCHANT: read own balance (no deposit endpoint for merchants in v1)
- ADMIN: read any wallet, no write
- Reuse `@Roles` from `src/auth/`

---

## Structure & Tools

### Module: `src/modules/wallet/`
- `wallet.module.ts`
- `wallet.controller.ts`
- `wallet.service.ts`
- `wallet.repository.ts` (raw SQL via Prisma)
- DTOs: `create-wallet.dto.ts`, `deposit.dto.ts`, `balance.dto.ts`, `transaction-history.dto.ts`

### Cross-module rules
- wallet module does NOT touch `users.*` tables
- Reads `user_id` from JWT claim (no DB call)
- If display name needed, calls `UserService.findPublicById(userId)` from user module — direct method call (same process)

### Money rules
- Input always `amount_minor: number` (integer)
- Output always `{ balance_minor: number }` (integer)
- Never `DECIMAL`/`FLOAT` in JS
- Document BigInt serialization strategy (string or number if safely < 2^53)

### Transaction safety
- ALWAYS `prisma.$transaction(async tx => {...})` — interactive transaction
- ALWAYS `SELECT ... FOR UPDATE` on the wallet row before reading balance
- Phase 05 extends to two-wallet locks; deterministic order rules come in phase 05

---

## Acceptance Criteria

- [ ] `POST /wallets` for a new user creates wallet with balance 0
- [ ] `GET /wallets/:userId` returns wallet
- [ ] `GET /wallets/:otherUserId` for a different USER → 403
- [ ] `GET /wallets/:userId/balance` returns balance
- [ ] `POST /wallets/:id/deposit` with `{ amount_minor: 100000 }` → 200, balance +100000
- [ ] Deposit with `amount_minor: 0` → 422
- [ ] Deposit with negative → 422
- [ ] Deposit without `Idempotency-Key` → 400 (placeholder, real in phase 06)
- [ ] After success, row in `payments.transactions` with status=SUCCESS
- [ ] Direct DB `UPDATE wallets SET balance_minor = balance_minor - 1` → CHECK fails
- [ ] Deposit without auth → 401
- [ ] Deposit on someone else's wallet → 403
- [ ] History returns paginated results, `created_at DESC`

---

## Tests
- Unit: DTO validation, ownership guard
- Integration: deposit happy path
- Concurrency (light, full in phase 05): two parallel deposits → both succeed, balance correct

---

## Self-test

> A wallet has balance 500. The CHECK constraint says `balance >= 0`. Suppose a buggy code path tries to subtract 200. The DB CHECK refuses. Good. But what if the code skips the row lock and just does `UPDATE balance = balance - 200` after a `SELECT`? Walk through the race that ends with a negative balance.

Without the row lock, two concurrent reads both see 500 → both subtract 200 → balance ends at 100 or -100 depending on timing. `SELECT FOR UPDATE` serializes reads so the second transaction sees the post-first-update balance and aborts. This is why phase 05's full concurrency tests matter.