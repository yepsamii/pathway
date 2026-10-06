# Decisions

## Purpose

Chronological log of design decisions that diverge from, extend, or clarify the plan. Every entry has a date, a one-line decision, and a one-paragraph reason. The interview goldmine for "tell me about a decision you made."

## Format

### YYYY-MM-DD — short decision title

**Decision**: What we decided.

**Reason**: Why. Connected to a failure scenario or an interview talking point where possible.

**Source**: Plan section, conversation, or external.

---

## Entries

### 2026-10-07 — package manager: pnpm

**Decision**: Use pnpm as the package manager for the NestJS monolith.

**Reason**:   
(1) NestJS CLI has a first-class `--package-manager pnpm` flag — we're using the path the framework is built for, not a workaround.

(2) pnpm's strict dependency resolution prevents "phantom dependencies" — packages can't accidentally reach a version they didn't declare. 

(3) Content-addressable store saves disk space and speeds up installs, which matters on CI even if it's invisible locally.

**Source**: docs/plan/[01-monorepo-scaffold.md](http://01-monorepo-scaffold.md) line 83, conversation2026-10-07.

