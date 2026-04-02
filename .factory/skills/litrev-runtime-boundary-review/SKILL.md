---
name: litrev-runtime-boundary-review
description: Review LitRev agent-runtime and AI orchestration boundaries for correctness, safety, and truthful recovery behavior. Advisory only and non-blocking. Use for tool envelopes, delegation, recovery, persistence, and runtime-owned contracts.
---
# LitRev Runtime Boundary Review

Perform a focused, evidence-backed review of LitRev's agent-runtime boundary.

This skill is advisory only.
It complements runtime tests, evals, and the canonical runtime plan.

## Read First

Before reviewing, read:
- `AGENTS.md`
- `docs/plans/plan-agentic.md`
- `docs/runbooks/repo-review-baseline.md`
- `docs/reviews/repo-health.md`

If the review touches memory ownership, also read:
- `docs/plans/plan-memory.md`

## Use this skill when

- Reviewing `next-app/lib/agent/**`
- Reviewing `next-app/lib/server/agent/**`
- Reviewing `next-app/lib/server/ai/**` where the issue is runtime-owned orchestration rather than backend trust
- Reviewing `next-app/app/actions/agent.ts`
- Reviewing delegation, tool exposure, stream/recovery, or run-persistence behavior

## Do not use this skill for

- Auth/admin/upload/storage/backend trust reviews.
  Use `litrev-security-review` instead.
- UI-only review, design review, or readability scans.
- External repo intake or Factory pattern adoption decisions.

## Review workflow

1. Identify the runtime-owned contract and the relevant section of `plan-agentic.md`.
2. Read touched runtime files and nearby tests/evals before making claims.
3. Check for:
   - tool eligibility or autonomy leaks
   - delegation or plan-execution paths that can exceed current server-owned limits
   - prompt-only enforcement where the runtime should own the contract
   - persistence/recovery truth gaps across runs, events, artifacts, and terminal state
   - stream/reducer/surface divergence that can mislead users about outcome or retryability
   - side effects without explicit ownership, idempotency, or durable checkpointing
   - claims of surface parity that are not actually true in the code
4. Compare against current active fixes and known gaps so you do not relitigate already-tracked runtime work without a new delta.
5. Report only concrete findings with file evidence or explicitly say no findings were discovered.

## Output contract

Return markdown in this order:

### Runtime Boundary Review: <scope>

#### Findings
- Ordered by severity.
- Each finding must include:
  - severity
  - file reference(s)
  - the broken or weak runtime contract
  - likely user-facing or system-facing failure shape
  - the smallest credible remediation direction

#### Open Questions / Assumptions
- Only include unresolved items that materially affect confidence.

#### Promotion Targets
- If a finding keeps recurring, name the right durable home:
  - `plan-agentic.md`
  - runtime tests/evals
  - supporting runbook update
  - repo-local governance only if the issue truly belongs in an executable rule

If no findings are discovered, say so explicitly and note any residual eval or replay gaps.

## Guardrails

- Never widen runtime scope into backend/admin ownership just because a file touches both concerns.
- Never treat this skill as a merge or deploy gate.
- Never call a prompt-quality issue a runtime-contract issue unless the code could enforce it.
- Keep findings about runtime behavior and ownership, not people.
- Prefer shared-runtime truth over per-surface heuristics when evaluating correctness.

## Final line

End with:

`Advisory only: promote repeated runtime findings into tests, evals, runbooks, or owner-plan updates.`
