# Plan: Delegation Safety and Child Clarification Repair

> Supporting plan only. Canonical status, priority, and completion rules live in [../plan-agentic.md](../plan-agentic.md).
>
> Supports: `FIX-001`
>
> Retirement rule: when `FIX-001` is complete, either delete/archive this file or reduce it to a short historical note. Do not keep active status tracking here.

## Overall Goal

Restore delegation as a safe routing primitive instead of a privileged bypass. After this work, delegated child runs should preserve the same review boundaries as direct tool execution, and any clarification requested by a child should surface to the user through the normal `ask_user` contract.

## Goal + Scope

### Problem Statement

The current delegated path in `next-app/lib/server/ai/sub-agent.ts` bypasses autonomy enforcement and unconditionally auto-applies proposal-style tool results on the parent run. That breaks the hard-cap model defined for review-only tools. The same child loop also stops on `ask_user` without returning the structured request to the parent runtime, so delegated clarification is effectively lost.

### Intended Outcome

- Delegated execution respects hard caps and configured autonomy the same way the parent loop does.
- Proposal-style child tools stay `proposed` unless their effective autonomy genuinely permits auto-apply.
- Delegated child `ask_user` calls surface as normal `user_input_required` events in the parent conversation.
- Delegation remains bounded and focused; this is a hardening pass, not a multi-agent redesign.

### In Scope

- `next-app/lib/server/ai/sub-agent.ts`
- `next-app/lib/server/ai/tools/delegate-*.ts`
- `next-app/lib/server/ai/tool-autonomy.ts`
- `next-app/lib/server/ai/tools/base.ts`
- `next-app/types/ai.ts`
- `next-app/types/agent.ts`
- Targeted runtime and regression tests

### Out Of Scope

- Full phase-state-machine work
- Task-graph orchestration
- Recursive delegation depth controls beyond the existing single-hop design
- Popup runtime changes except where they depend on the delegated clarification contract

## Governance and Repo Grounding

- AGENTS trigger mapping: agent runtime/orchestration changes
- Required Tier 2 specialist: `docs/agents/specialists/agent-runtime-specialist.md`
- Required Tier 3 retrieval:
  - `docs/plans/plan-agentic.md`
  - `docs/plans/plan-memory.md` only if memory tool behavior changes

### Current-State Evidence

- Hard caps define `update_protocol`, `bulk_screening`, `update_note`, `update_study`, `exclude_study`, `store_memory`, and `forget_memory` as review-only at level `2` in `next-app/types/agent.ts`.
- Parent execution enforces those caps through `resolveAutonomyLevel()` in `next-app/lib/server/ai/tool-autonomy.ts`.
- Child execution explicitly “skips autonomy checks” and auto-applies delegated artifacts in `next-app/lib/server/ai/sub-agent.ts`.
- `delegate_*` tools default to autonomy level `3`, so the delegated entrypoint is currently more permissive than the underlying tools.
- `ask_user` is allowed in specialist modes via `next-app/lib/agent/router.ts`, but child pause state is collapsed into summary text instead of a real structured question.

## Documentation Impact and Updates

Documentation updates are required.

- Update `docs/plans/plan-agentic.md`
  - Add the delegation safety contract to `Current Architecture` once shipped.
  - Move the remediation task out of `Active Tasks` when complete.
- Update `docs/plans/agent-runtime-remediation/README.md`
  - Mark this plan complete only when both autonomy and `ask_user` propagation land.

## Minimal-Sufficient Strategy

Choose the smallest reversible fix that restores trust without redesigning the whole sub-agent runtime:

1. Stop unconditional auto-apply in child runs.
2. Compute child effective autonomy using the same helpers as the parent runtime.
3. Propagate `ask_user` out of the child as a first-class sentinel instead of burying it in a textual summary.

This is smaller and safer than immediately refactoring sub-agents to share every byte of the parent orchestration loop.

## Reuse vs New

### Reuse

- `getAutonomyConfig()` and `getToolAutonomyLevel()` from the parent autonomy system
- `resolveAutonomyLevel()` for hard-cap enforcement
- Existing `ask_user` tool/result contract
- Existing artifact creation and review-card pipeline

### New

- A child-run policy layer that computes effective tool behavior before artifact finalization
- `SubAgentResult` support for `requiresUserInput` and `userInputRequest`
- Delegation-tool passthrough of child clarification requests to the parent loop
- `ToolExecutionContext` / delegated context support for parent `conversationId` and cached autonomy config

## Decision-Complete Implementation Design

### 1. Introduce delegated execution policy

Add explicit delegated policy handling to `executeSubAgent()`:

- Extend `SubAgentParams` with enough parent state to evaluate child tool behavior consistently:
  - `conversationId?: string`
  - `autonomyConfig?: AutonomyConfigData`
  - `delegatedByTool?: "delegate_search" | "delegate_screening" | "delegate_protocol"`
- Extend `ToolExecutionContext` so delegated tools can receive and forward:
  - `conversationId?: string`
  - `autonomyConfig?: AutonomyConfigData`
- Before finalizing each child tool result, compute:
  - configured level from parent autonomy config
  - effective level via `resolveAutonomyLevel()`
  - whether the tool maps to an artifact-producing proposal path

### 2. Replace unconditional auto-apply with a behavior matrix

For delegated child tools, use this matrix:

- Effective level `0`
  - Do not execute the child tool.
  - Return a structured error to the child summary.
- Effective level `1`
  - Do not execute the child tool.
  - Fail closed with a structured non-executable result that tells the parent flow the action requires direct, non-delegated approval.
  - Do not invent a new delegated approval UI in this slice.
- Effective level `2`
  - Execute the child tool.
  - If it maps to an artifact, create a `proposed` artifact only.
  - Never auto-apply.
- Effective level `3` or `4`
  - Auto-apply only if the child tool’s own hard cap and allowed range permit that level.
  - For the currently risky proposal tools, hard caps will keep them at `2`, which is the desired outcome.

This preserves the existing autonomy model instead of inventing a parallel delegated one.

### 3. Remove direct child auto-apply helper semantics

Refactor `maybeAutoApplyDelegatedArtifact()` into a delegated finalization helper that can:

- create `proposed` artifacts
- create `auto_applied` artifacts only when effective level allows it
- attach the artifact to the parent conversation using forwarded `conversationId` so cards render in the visible thread, not only on the child run

Do not keep a helper whose only mode is unconditional auto-apply.

### 4. Propagate child `ask_user`

Extend `SubAgentResult` with:

- `requiresUserInput?: boolean`
- `userInputRequest?: UserInputRequest`

When a child tool returns `requiresUserInput`:

- stop the child loop with `paused_for_input`
- include the request object in `SubAgentResult`
- do not convert the state into summary-only text

Then update each `delegate_*` tool so that:

- if the child result includes `requiresUserInput`, the delegate tool itself returns the same sentinel shape as `ask_user`
- the parent loop in `AIService` does not need a new branch; it already knows how to surface tool-level `requiresUserInput`
- the delegate tool does not append a synthetic textual summary when a real `user_input_required` payload is present

### 5. Eventing and observability

Add explicit telemetry for delegated pause and delegated review outcomes:

- child emitted clarification
- child created proposed artifact
- child auto-applied artifact
- child blocked by effective autonomy

These signals are necessary to know whether delegation remains useful after safety tightening.

### 6. Edge Cases and Failure Behavior

- Child uses `ask_user` after partially completing earlier steps
  - earlier completed work remains visible
  - child stops cleanly
  - parent surfaces one structured question
- Child asks for clarification before any visible assistant text
  - delegate tool should still return `user_input_required` without inventing filler summary text
- Child calls the same proposal tool multiple times
  - reuse existing shadowed-tool sanitation rules
  - only finalize valid sibling calls
- Parent autonomy config unavailable
  - fall back to the same default config used in direct execution
- Artifact creation fails after tool success
  - child run fails
  - no claim that work was applied

### Practical Impact Translation

- User experience
  - delegated protocol/screening work becomes reviewable instead of silently applied
  - delegated clarification actually appears as a card the user can answer
- Runtime/system behavior
  - child runs stop behaving like privileged bypasses
  - parent and child autonomy semantics converge
- Operational/support impact
  - fewer “the assistant changed something without review” incidents
  - clearer run traces for delegated pauses and failures

## Long-Term Quality and Scalability

- Maintainability
  - reuse parent autonomy helpers instead of keeping bespoke child safety logic
- Scalability
  - future specialists can share the same delegated execution policy
- Reliability
  - delegated clarification stops being lossy
- Operability
  - delegated outcomes become measurable rather than hidden in summaries

### Tradeoffs

- Tightening child autonomy may reduce apparent delegation throughput.
- That is the correct tradeoff because the current faster path is violating trust boundaries.

## Execution Slicing

### Slice 1: Safety patch

- Add delegated autonomy resolution to `sub-agent.ts`
- Add delegated `conversationId` and cached autonomy-config forwarding
- Remove unconditional child auto-apply
- Add tests proving hard-capped tools remain `proposed`

Blast radius:
- Delegated protocol, screening, memory, drafting, and study-update paths

### Slice 2: Clarification passthrough

- Extend `SubAgentResult`
- Update `delegate_*` tools to re-emit `requiresUserInput`
- Add parent-loop integration tests

Blast radius:
- Delegation tools and timeline question-card behavior

### Slice 3: Optional convergence refactor

- If needed later, unify child finalization further with shared autonomy helpers
- Only do this after slices 1 and 2 are stable

Blast radius:
- wider runtime internals, so keep it separate

### Alternatives Considered

- Chosen
  - patch the current child runtime in place, then converge later if still warranted
- Rejected
  - immediate full rewrite of sub-agents onto the parent loop, because it expands scope into conversation ownership and artifact-run semantics

## Risk + Rollback

### Primary Failure Modes

- Delegated runs stop too aggressively because effective autonomy is computed incorrectly
- Child clarification loops emit malformed or duplicate `user_input_required`
- Artifact ownership changes hide cards from the parent conversation

### Detection Signals

- sharp drop in delegated completion rate
- delegated runs ending with `paused_for_input` but no visible card
- artifacts created on child runs but not visible in the parent thread

### Rollback Path

- Roll back clarification passthrough independently from autonomy hardening if the sentinel path is unstable
- If artifact ownership causes UI regressions, keep parent-run artifact ownership while preserving the new autonomy gate

## Verification Strategy

### Test Matrix

- Happy path
  - delegated search with non-mutating tools still completes normally
  - delegated protocol update creates `proposed` artifact, not `auto_applied`
- Edge cases
  - child `ask_user` propagates to parent
  - disabled tool level blocks delegated execution cleanly
  - hard-capped child tool does not exceed level `2` even if delegated tool default is `3`
- Regression scenarios
  - non-delegated parent autonomy behavior unchanged
  - delegation traces still link parent/child runs

### Relevant Test Layers

- unit tests for delegated policy decisions
- runtime tests for `executeSubAgent()`
- integration-style tests for `delegate_*` tool passthrough
- regression tests for parent-thread artifact visibility

### Acceptance Signals

- no delegated child auto-applies a hard-capped proposal tool
- delegated `ask_user` renders as real structured UI
- tests explicitly cover both behaviors

## Validation Mapping

- `cd next-app && npx tsc --noEmit`
  - catches type drift across `SubAgentResult`, tool context, and event payloads
- `cd next-app && npx vitest run`
  - catches runtime regressions in delegation, autonomy, and `ask_user` propagation

## Debuggability + Triage

### Failure Surface Signals

- child run ends `paused` with no user-input card
- delegated artifact status differs from expected autonomy level
- logs show delegated tool success but no artifact or missing visibility

### Fast Reproduction Path

1. Enable delegation.
2. Run a protocol-edit request from `general`.
3. Verify whether the result is a `proposed` card or silent application.
4. Run an ambiguous delegated request that should ask a follow-up question.

### First Triage Steps

- inspect child run events
- inspect effective autonomy calculation for the child tool
- inspect artifact status and owning conversation/run IDs
- inspect whether delegate tools forwarded `conversationId` and autonomy config into the child

### First Owner

- agent runtime owner for `sub-agent.ts` and autonomy enforcement

## Assumptions / Defaults

- Parent autonomy policy remains the source of truth.
- Delegated child clarification should use the same UI contract as direct `ask_user`.
- We prefer safety and reviewability over preserving the current delegated auto-apply behavior.
