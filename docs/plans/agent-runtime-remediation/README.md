# Supporting Agentic Remediation Plans

This folder is no longer a standalone tracker.

Use [plan-agentic.md](../plan-agentic.md) for:

- canonical status
- priority/order
- active fix ownership
- completion rules

Use the files in this folder only as supporting implementation detail, retained rationale, or design direction for fixes referenced from `plan-agentic.md`.

Current retained closeout detail:

- [Baseline Stability and Transparency Reset](./plan-fix-012-baseline-stability.md) for the retired `FIX-012` baseline rescue.
- [Runtime Stabilization and Continuation](./plan-runtime-stabilization-and-continuation.md) for the shipped `A-001` / `FIX-011b` code closeout and the burn-in handoff rationale.

Historical/supporting remediation memory:

- [Stream Scope Canonicalization for Study-Scoped Runs](./plan-stream-scope-canonicalization.md) for the route-level owned-scope bug where `studyId`-only stream requests could degrade to global runtime scope if canonicalized `projectId` was not carried forward.

Reference design direction:

- [Ask User V2 Design Direction](./ask-user-v2-design-direction.md) for the clarification/decision-system direction beyond the now-shipped first-class `DecisionRequest` persistence foundation. This file is design guidance only; canonical status and execution order still belong in [plan-agentic.md](../plan-agentic.md).
