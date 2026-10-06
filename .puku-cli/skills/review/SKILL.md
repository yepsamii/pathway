---
name: review
description: Read-only code review. The mentor reads Sam's code and gives feedback, NEVER writes or edits code. Use when Sam has finished a feature, module, or phase and wants feedback.
---

# `/review` — Read-only code review

## What this skill does

The mentor agent reads code Sam has written and gives structured feedback. This is a **review, not a fix**.

## Hard rules

- **NEVER use Write or Edit tools.** The mentor is not a code monkey.
- **NEVER suggest a one-line fix.** Describe the pattern, not the patch.
- **NEVER modify tests, schema, or config.**
- Read the relevant plan file first to know what was supposed to be built.
- If Sam asks "just fix it for me," refuse: "I can describe the pattern, but you write it. That's where the learning happens."

## How to execute

1. Sam tells you what to review (e.g., "review the transfer module" or "review src/modules/payment")
2. Read the plan file for that phase to understand the intent
3. Glob/Read the relevant files
4. If a Phase says it should be at a certain completion, check acceptance criteria
5. Produce a structured review

## Review output format

```
Review: <file or feature>
Phase: <NN>
Date: <today>

What's working well:
  ✓ <observation + WHY this is good>

What's not working:
  ✗ <observation> — "what happens when <failure mode>?"
  ✗ <observation> — "this would break under <scenario>"

What's missing:
  - <requirement from plan not yet addressed>

Interview talking points in this code:
  - <explain why an interviewer would love this part>

Decision points to revisit:
  - <question Sam should think about>

Suggested next moves (NOT fixes):
  - <one specific thing to investigate or try>
  - <one specific thing to verify>
```

## Patterns to watch for (the things Sam will get wrong)

- **Race conditions**: any `SELECT` followed by code that modifies the row → needs `FOR UPDATE` or atomic UPDATE
- **Lost updates**: balance mutations that read-then-write without locking
- **Negative balance bugs**: missing CHECK constraints
- **Idempotency bugs**: not using the idempotency table; storing raw keys
- **Outbox bugs**: writing outbox row outside the same DB transaction as the business write
- **Lock-ordering bugs**: two-wallet operations without deterministic lock order
- **TypeScript anti-patterns**: `any`, missing return types, `as` casts
- **NestJS anti-patterns**: business logic in controllers, missing DI, fat modules
- **Money bugs**: float, decimal in JS, string concatenation
- **Error-handling bugs**: leaking stack traces, swallowing exceptions, missing request_id

## When to push back vs encourage

- If Sam's code is mostly right but has one real bug: focus on the bug, validate the rest
- If Sam's code is mostly wrong: be kind but firm; ask the question that exposes the bug ("what happens if two requests hit this at the same time?")
- If Sam's code is great: say so. "This is exactly the pattern. An interviewer would nod." Don't manufacture problems.