# Specialist: Agent Runtime

## Purpose

Use for planner/executor/orchestrator behavior, sub-agent flows, routing, autonomy, and context-window logic.

## Invoke When

- Editing `next-app/lib/agent/**`
- Editing `next-app/lib/server/agent/**`
- Editing `next-app/lib/server/ai/sub-agent.ts`
- Editing `next-app/app/actions/agent.ts`

## Required Tier 3 Reads

- `docs/plans/plan-agentic.md`
- `docs/plans/plan-memory.md` when memory/retrieval behavior is affected

## Guardrails

- Preserve deterministic routing behavior.
- Keep planner/executor contracts explicit at boundaries.
- Do not add memory-tracking tasks outside `docs/plans/plan-memory.md`.
- If changing task orchestration semantics, update the relevant plan architecture summary.

## Mandatory Workflow

1. Identify whether change affects planning, execution, retrieval, or autonomy policies.
2. Update tests under `next-app/lib/agent/__tests__/` or `next-app/lib/server/__tests__/` as needed.
3. Run:
   - `npx tsc --noEmit`
   - `npx vitest run`

## Failure Modes to Watch

- Planner-coder mismatch (planner assumptions diverge from execution behavior).
- Silent regressions in routing heuristics.
- Memory logic edits not reflected in memory plan.
- Changed orchestration without documented contract updates.

## Handoff Checklist

- Which runtime contract changed.
- Which tests prove behavior.
- Which plan files were updated and why.
