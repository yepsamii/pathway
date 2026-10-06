# Failure Scenarios

## Purpose

Every place the system can break, and what each layer does about it. The interview goldmine. Every entry here becomes a talking point: *"what happens if X fails?"*

## Status

Empty. To be filled in as we reason about failure modes during phase work.

## Categories (placeholder)

- Concurrency — what happens if two transfers hit the same wallet at the same time?
- Network — what if the API gets a request but the DB write fails?
- Idempotency — what if the same client retries the same request?
- Crash mid-transaction — what if the process dies after debit but before credit?
- Outbox relay — what if the in-process consumer crashes?
- Webhook delivery — what if the merchant endpoint is down?
- Auth — what if a JWT is expired, tampered, or replayed?

_Real entries added per scenario as we hit and resolve them._