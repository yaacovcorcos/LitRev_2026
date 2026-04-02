# Internal Advisory Reviews

This runbook defines LitRev's internal advisory review lenses and when to use each one.

## Purpose

Use this document when you want a repo-local review skill without creating a second source of truth.

These reviews are:
- advisory only
- evidence-backed
- owner-scoped
- promotion-oriented

They are not merge gates, deploy gates, or substitutes for tests, typecheck, CI, or owner-plan maintenance.

## Review lens map

### `litrev-security-review`

Use for backend trust boundaries:
- auth and authorization
- platform-admin guards and mutations
- route handlers and server actions
- upload/storage/file-asset handling
- scope and tenancy enforcement
- backend-owned validation and auditability

Primary owner docs:
- `docs/plans/plan-backend.md`
- `docs/runbooks/admin-access.md`

Do not use it for runtime orchestration gaps that belong in the agent-runtime plan.

### `litrev-runtime-boundary-review`

Use for agent-runtime boundaries:
- tool exposure and autonomy caps
- delegation and plan execution
- run/event/artifact persistence truth
- stream/recovery/retry correctness
- surface honesty and parity claims
- runtime-owned side-effect discipline

Primary owner docs:
- `docs/plans/plan-agentic.md`
- `docs/runbooks/repo-review-baseline.md`

Do not use it for auth/admin/storage trust reviews that belong to backend ownership.

### `cursed-lite-*`

Use only for soft signal detection:
- readability and searchability friction
- dead-code candidates
- narrative pre-merge risk scans

These are intentionally non-normative and never evidence on their own.

### `docs/runbooks/external-pattern-intake.md`

Use this instead of an internal review skill when the real question is:
- should we borrow from Factory AI or another external repo?
- what is the correct adoption shape for an outside pattern?

## How to run an advisory review

1. Pick one review lens based on the primary owner surface.
2. Read the owner docs before reviewing files.
3. Review the touched files and nearby tests before making claims.
4. Report only concrete findings with file evidence, or say no findings were discovered.
5. Keep repeated useful findings out of chat-only limbo by promoting them.

## Promotion rule

If an advisory finding repeats twice, convert it into one of:
- a focused test
- a runtime eval
- a repo-local rule
- an owner-plan update
- a runbook update
- a concise `repo-health` update
- a `decision-log` entry when the fix is a durable tradeoff

Promoted fixes must land in the correct owner docs:
- backend/admin/upload/auth -> `plan-backend.md` and relevant runbooks
- runtime/orchestration/recovery -> `plan-agentic.md`
- external adoption policy -> `external-pattern-intake.md`

## Guardrails

- Do not stack every review lens by default.
- Do not let advisory reviews become pseudo-policy.
- Do not restate already-tracked open work as "new" without a real delta.
- Do not leave durable findings only in a review artifact or chat transcript.

## When not to run these reviews

- When the request is straightforward implementation and existing tests/docs already define the contract clearly.
- When the problem is just baseline lint debt.
- When the correct next step is to fix a known tracked issue rather than re-review it.
