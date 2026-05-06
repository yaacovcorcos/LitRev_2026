# Agent Runtime Reliability Closeout

Review date: 2026-05-06
Reviewer: Codex

## Scope

This closeout reviews the May 2026 agent-runtime reliability series on `main`.
It covers the current production-bound architecture after the merged runtime PRs, including the follow-up correction that keeps durable artifact-aware execution detached from the HTTP observer abort signal.
It does not cover the separate `YY/agent-runtime-reliability` worktree.

Source owners:
- [`docs/plans/plan-agentic.md`](../plans/plan-agentic.md)
- [`docs/plans/plan-agent-quality.md`](../plans/plan-agent-quality.md)
- [`docs/runbooks/chat-runtime-burn-in.md`](../runbooks/chat-runtime-burn-in.md)
- [`docs/reviews/2026-04-16-agentic-open-source-benchmark.md`](./2026-04-16-agentic-open-source-benchmark.md)

## Executive Verdict

The agent runtime is no longer blocked by the known `FIX-011b` code delta.
The core failure classes that made interruption, retry, and paused input unreliable now have server-owned runtime contracts and deterministic regression coverage.

This does not mean the agent is fully signed off for production-scale confidence.
The next certification gate is live evidence: `U1.6` must run from a fresh deployment/cohort window, with manual abnormal-end spot checks and preserved validator JSON.
That gate should not freeze normal additive agent work. It blocks formal runtime sign-off and destructive cleanup of fallback/legacy runtime paths, not bug fixes, eval expansion, security hardening, tool/autonomy hardening, decision-system work, research-quality work, or non-destructive runtime hardening that preserves existing contracts.

## What Changed

### 1. Transport Abort Is No Longer Semantic Cancellation

The durable agent run is not cancelled merely because the HTTP stream disconnects.
Semantic cancellation now goes through the explicit run-cancel endpoint and same-process cancellation registry, with durable cancellation as the cross-worker authority.
The artifact-aware stream route intentionally does not pass `request.signal` into durable run execution; request disconnect is an observer concern, not a user-visible cancel action.

Primary proof:
- `next-app/app/api/ai/stream/__tests__/route.test.ts`
- `next-app/app/api/ai/runs/[runId]/cancel/__tests__/route.test.ts`
- `next-app/lib/server/agent/__tests__/run-cancellation.test.ts`

### 2. Loop Outcomes Are Truthful

Budget, repeat-guard, no-answer, and subagent exhaustion exits now fail honestly unless a real answer or durable output exists.
Durable progress advances only on replayable forward-progress boundaries, not on attempted tool calls or noisy persistence.

Primary proof:
- `next-app/lib/ai/__tests__/run-outcome.test.ts`
- `next-app/lib/server/__tests__/run-event-authority.test.ts`
- `next-app/lib/server/__tests__/sub-agent.test.ts`

### 3. Mutating Tools Have Durable Idempotency Receipts

Mutating tools reserve `ToolIdempotencyRecord` rows inside the root run lineage before execution, complete them with successful results, replay completed receipts across retry/continuation, and block duplicate unresolved in-flight mutations.
Replays are internal semantic replays and must not create second artifacts or apply second downstream side effects.

Primary proof:
- `next-app/lib/server/__tests__/tool-idempotency-store.test.ts`
- `next-app/lib/server/__tests__/tool-middleware.test.ts`
- `next-app/lib/server/__tests__/tool-autonomy.test.ts`
- `docs/runbooks/db-architecture.md`

### 4. `ask_user` Has First-Class Decision Persistence

`ask_user` still preserves legacy stream compatibility, but canonical runtime truth now lives in `DecisionRequestRecord` and `DecisionResolutionRecord`.
Pending lookup prefers first-class decision records, stale/resolved answers are rejected, and legacy event fallback remains for older lineages.

Primary proof:
- `next-app/lib/ai/__tests__/decision-requests.test.ts`
- `next-app/lib/server/__tests__/clarification-decision-requests.test.ts`
- `next-app/app/api/ai/stream/__tests__/route.test.ts`
- `docs/runbooks/db-architecture.md`

### 5. Runtime Quality Has A Protected Deterministic Gate

`npm run check:agent-quality` now runs inside protected `check` CI.
The gate validates the scenario catalog, runtime-observable signal vocabulary, deterministic stream fixture coverage, and the strict U1.6 metric/surface/threshold contract.

Primary proof:
- `next-app/lib/server/__tests__/agent-quality-gate.test.ts`
- `next-app/lib/server/__tests__/runtime-signal-collector.test.ts`
- `next-app/lib/server/__tests__/eval-scenario-catalog.test.ts`
- `.github/workflows/ci.yml`

## External Benchmark Translation

The April benchmark remains the source artifact for external inspiration.
The reliability series deliberately adapted patterns rather than importing code:

- durable execution and typed interruption ideas map to server-owned cancellation, recovery, and decision records
- eval-harness ideas map to deterministic runtime-signal fixtures and a protected local/CI gate
- tool-boundary ideas map to durable idempotency receipts and replay-safe mutation semantics
- human-in-the-loop ideas map to persisted decision requests/resolutions instead of thin answer strings

This is the right adoption shape for LitRev: local runtime contracts, local tests, local docs, and no external code copied into the repo.

## Remaining Work

### Must Happen Next

Run `U1.6` as a fresh deployment-level burn-in and keep using it as a recurring production-confidence loop:
- capture a new deploy SHA and `CANARY_SINCE_UTC`
- refresh scoped `workspaceIds` / `userIds`
- run Phase 0 from `docs/runbooks/chat-runtime-burn-in.md`
- record the Day-0 manual baseline scenario pack
- preserve raw validator JSON through final strict gate

Do not open destructive `A-002` / `U4` cleanup until the burn-in sign-off evidence exists. Additive agent improvements should continue in parallel when they preserve existing runtime contracts and add the appropriate tests/evals.

### Still Important, Not Part Of This Closeout

- broaden deterministic fixtures under `Q1-002`
- add adversarial trust-boundary eval packs under `Q1-003` / `Q3-003`
- finish decision-quality UX, lifecycle, and memory reuse under `C-001`
- define runtime SLO dashboards and incident playbooks under `Q2-003` / `Q2-004`
- narrow `general` mode and delegation policy under `B-002` / `B-003`

## Quality Bar Going Forward

The runtime is now testable enough that future regressions should not be accepted as "agent weirdness."
If interruption, retries, tool replay, or user decisions regress, the fix should add or update one of:

- a focused runtime regression test
- a deterministic stream fixture and agent quality gate assertion
- a burn-in metric or validator rule
- an owner-plan/runbook update

Do not let repeated findings remain only in chat, review prose, or stale plans.
