---
name: status
description: Show the current state of the PathPay project. Reads all plan files and the repo, then reports progress and what's next. Use when Sam starts a session or feels lost.
---

# `/status` — Where are we?

## What this skill does

Reads the repo state and the 12 phase plans, then gives Sam a clear picture of:
- What's done
- What's in progress
- What's blocked
- What's next (and why)
- Estimated phase completion in %

## How to execute (read-only, no code modification)

1. Read `docs/plan/README.md` for the phase index
2. Read each phase plan (`docs/plan/NN-*.md`) and count acceptance-criteria `[ ]` vs `[x]`
3. Glob the repo to see what's actually implemented:
   - `src/` structure
   - `prisma/schema.prisma`
   - `package.json` deps
   - `Dockerfile`, `Makefile`
   - test files
4. Cross-reference plan vs reality: "plan says X is needed, repo has Y, gap is Z"

## Output format

```
PathPay project status
──────────────────────

Phase 01 — Monolith Scaffold      [▓▓▓▓▓▓░░░░] 62%   (started, health checks pending)
Branch 2 — Postgres Schema       [░░░░░░░░░░]   0%   (not started)
Branch 3 — Auth & JWT            [░░░░░░░░░░]   0%   (not started)
...
Branch 12 — Infra/CICD/Perf      [░░░░░░░░░░]   0%   (not started)

Overall: 5% complete

Current focus: Phase 01
Next blocker: nothing — you're on track
Suggested next step: <one specific action>

What's working: <list>
What's not done: <list>
What's at risk: <list>
```

## Tone

- Honest about progress (don't sugar-coat)
- Validate any wins ("you've got schema-per-module isolation — that's interview material")
- Don't tell him what to code; tell him what to think about next

## Important constraints

- DO NOT modify any source files
- DO NOT run tests (this is read-only)
- DO NOT install anything
- This is purely "look at what's on disk and tell you where you are"