# Phase 05 — Transfers & Concurrency Control

**Goal:** Wallet-to-wallet transfer that is correct under any concurrency. Two simultaneous transfers that together exceed the balance must result in exactly one succeeding, never both, never a negative balance. Deadlocks prevented via deterministic lock acquisition.

**Problem doc sections:** §5, §9, §23 (scenarios 7, 8)

---

## Requirements

### Endpoint

```
POST   /transfers
Body:  { from_wallet_id, to_wallet_id, amount_minor, reference? }
Header: Idempotency-Key: <uuid>
```

### Transfer flow (lives in `src/modules/payment/transfer/`)
1. Validate `amount_minor > 0`
2. Validate `from_wallet_id != to_wallet_id`
3. Validate wallets exist and are `ACTIVE`
4. Open DB transaction:
   1. **Lock both wallets in deterministic order** (lower UUID first): `SELECT id FROM wallets WHERE id IN ($1, $2) ORDER BY id ASC FOR UPDATE`
   2. Verify sender `balance_minor >= amount_minor` → raise `INSUFFICIENT_BALANCE` if not
   3. `INSERT INTO payments.transactions (type=TRANSFER, status=PENDING, source_wallet_id, destination_wallet_id, amount_minor, idempotency_key)`
   4. `UPDATE wallets SET balance_minor = balance_minor - $amt WHERE id = $from`
   5. `UPDATE wallets SET balance_minor = balance_minor + $amt WHERE id = $to`
   6. `UPDATE payments.transactions SET status='SUCCESS', completed_at=now()`
   7. `INSERT INTO payments.outbox_events (event_type='TransferCompleted', aggregate_id=tx_id, payload={...})`
   8. COMMIT
5. Insufficient balance → 422 `INSUFFICIENT_BALANCE`, tx marked FAILED

### Authorization
- Caller must own `from_wallet_id`
- `to_wallet_id` must exist + ACTIVE
- Self-transfer → 422 `SAME_WALLET`

### Concurrency guarantees (write tests)
- 100 concurrent debits of 10 from a 500-balance wallet → final balance exactly 0, exactly 50 succeeded
- Two concurrent A→B and B→A → no deadlock (lock order is the lock)
- Crash between debit and credit → entire tx rolls back; neither wallet changes

---

## Structure & Tools

### Module: `src/modules/payment/`
- `payment.module.ts` (imports wallet module for wallet access)
- `transfer/transfer.controller.ts`
- `transfer/transfer.service.ts`
- `transfer/transfer.repository.ts`
- DTOs: `create-transfer.dto.ts`

### Key SQL pattern
```sql
-- Step 1: lock both rows in deterministic order
SELECT id FROM wallets
WHERE id IN ($1, $2)
ORDER BY id ASC
FOR UPDATE;

-- Step 2: verify balance (under lock)
SELECT balance_minor FROM wallets WHERE id = $from;

-- Step 3 & 4: apply
UPDATE wallets SET balance_minor = balance_minor - $amt WHERE id = $from;
UPDATE wallets SET balance_minor = balance_minor + $amt WHERE id = $to;
```

### Isolation level
- Default `READ COMMITTED` is sufficient because of `SELECT FOR UPDATE`
- Document why not `SERIALIZABLE`: works too but causes more retries; FOR UPDATE is more predictable
- Phase 12 includes this in `docs/DATABASE.md`

### Tools
- Same as phase 04
- Test helper: `Promise.all` with N concurrent calls in Jest

---

## Acceptance Criteria

- [ ] `POST /transfers` happy path → 200, balances updated atomically
- [ ] Insufficient balance → 422 `INSUFFICIENT_BALANCE`, both balances unchanged
- [ ] Self-transfer → 422 `SAME_WALLET`
- [ ] `amount_minor <= 0` → 422
- [ ] **100 concurrent debits of 10 from a 500-balance wallet → exactly 50 succeed, balance is 0**
- [ ] **10 concurrent A→B and B→A transfers → no deadlock, all succeed (or fail cleanly), ledger balanced**
- [ ] **Crash mid-transaction** (inject throw after debit) → rollback verified, no partial state
- [ ] No transaction row left in SUCCESS on insufficient balance (FAILED)
- [ ] Lock order verified by inspecting SQL (always `min(from, to)` first)

---

## Tests (the most important test phase)

### Unit
- Validation, ordering logic, idempotency-key hash placeholder

### Integration / concurrency
- 100 concurrent debits, assert final balance
- Concurrent A→B and B→A, assert no error
- 100 concurrent transfers from wallet with budget 50 of 1-unit each → exactly 50 succeed
- Insufficient-balance race → exactly one succeeds

### Failure simulation
- Inject throw inside the transaction (after debit, before credit) → rollback verified
- Verify both wallets unchanged after rollback
- Verify no transaction row left in SUCCESS state

---

## Self-test

> In your code, after acquiring `SELECT FOR UPDATE` on both wallets in deterministic order, you read sender's balance. It's sufficient. You proceed to debit and credit. Meanwhile, a separate process tries a deposit to the same sender wallet. Does that deposit block on your row lock, proceed in parallel, or fail? Justify based on Postgres row-lock semantics.

Hint: Postgres row locks block other FOR UPDATE/FOR NO KEY UPDATE/UPDATE/DELETE on the same row but do not block reads. A deposit UPDATEs the same row, so it blocks on your FOR UPDATE until your tx commits. After commit, the deposit sees the post-debit balance and adds on top. Correct, serializable behavior.