# Architecture

## Purpose

Records the system shape: how the codebase is split into modules, how modules talk to each other, and where the boundaries are. Read this when you want to know "where does X live" or "who's allowed to touch Y."

## Status

To be filled in as phase 01 (monorepo scaffold) and phase 02 (schema) land.

## Planned module boundaries

The plan defines five logical schemas in one Postgres database:

- `users` — identity, auth, refresh tokens
- `wallets` — balance, wallet state
- `payments` — transactions, idempotency, outbox
- `notifications` — delivery log
- `webhooks` — delivery log

Schema-per-module is **discipline, not isolation** — they all live in the same database in this monolith. The point is to make cross-schema access greppable and reviewable, not to enforce it at the database level.

## Open questions

- _To be filled in as we go._
