# Performance

## Purpose

Captures query plans (EXPLAIN ANALYZE), index impact (before/after), and any other performance-relevant findings. Per phase 02, one transaction-history query gets documented here with EXPLAIN ANALYZE before-and-after once we get to that step.

## Status

Empty. To be filled in during phase 02 (and any phase where a perf question comes up).

## Format (when filled)

For each investigated query:

- Query text
- EXPLAIN ANALYZE before index
- Index added (with reasoning)
- EXPLAIN ANALYZE after index
- Decision: keep / drop / iterate