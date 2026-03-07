# Plan: Plan Execution Confinement and Approval Integrity

> Supporting plan only. Canonical status, priority, and completion rules live in [../plan-agentic.md](../plan-agentic.md).
>
> Supports: `FIX-002`
>
> Retirement rule: when `FIX-002` is complete, either delete/archive this file or reduce it to a short historical note. Do not keep active status tracking here.

## Overall Goal

Make approved plan execution mean exactly what the user thinks it means: execute the chosen steps, in the chosen context, with no hidden escalation back to `general` and no off-plan tool calls.

## Goal + Scope

### Problem Statement

Plan execution currently hardcodes `agentMode: "general"` on the client and relies on system-prompt instructions rather than hard runtime enforcement. That allows the execution pass to run with a broader tool surface than the plan was generated under and does not reject off-plan calls.

### Intended Outcome

- Plans persist the mode and execution policy they were generated with.
- Execution runs in that originating mode, not a broader fallback.
- Only tools corresponding to approved steps are executable during the plan run.
- Step order is enforced.

### In Scope

- `next-app/types/artifacts.ts`
- `next-app/lib/server/agent/planner.ts`
- `next-app/lib/server/agent/plan-execution.ts`
- `next-app/lib/server/ai/ai-service.ts`
- `next-app/hooks/useCopilotStreamActions.ts`
- Plan-related tests

### Out Of Scope

- Replacing heuristic planning with full AI planning
- Building a full explicit run-phase state machine
- Long-lived resumable task graphs

## Governance and Repo Grounding

- AGENTS trigger mapping: agent runtime/orchestration changes
- Required Tier 2 specialist: `docs/agents/specialists/agent-runtime-specialist.md`
- Required Tier 3 retrieval:
  - `docs/plans/plan-agentic.md`

### Current-State Evidence

- Client plan execution forces `agentMode: "general"` in `next-app/hooks/useCopilotStreamActions.ts`.
- `general` remains unrestricted when delegation is disabled via `next-app/lib/agent/router.ts`.
- Plan payloads currently store only `steps` and `estimatedActions` in `next-app/types/artifacts.ts`.
- Server execution injects textual instructions but still uses the normal mode tool loop in `next-app/lib/server/ai/ai-service.ts`.
- Step progress matching is currently best-effort by the next unconsumed step with the same `toolName`.

## Documentation Impact and Updates

Documentation updates are required.

- Update `docs/plans/plan-agentic.md`
  - record that plan execution is mode-stable and step-constrained once shipped
- Update this remediation pack index

## Minimal-Sufficient Strategy

Do not redesign planning and execution together. Keep the existing plan artifact and execution loop, but add the minimum metadata and runtime gates needed to make plan approval real.

## Reuse vs New

### Reuse

- Existing plan artifact flow
- Existing `startPlanExecution()` status transition
- Existing step status updates and optimistic UI

### New

- Plan execution metadata on `PlanPayload`
- Runtime plan-scoped tool filtering
- Ordered step executor guard
- Explicit distinction between executable and advisory plan artifacts

## Decision-Complete Implementation Design

### 1. Extend `PlanPayload` with execution metadata

Add an optional `execution` block to `PlanPayload` with this exact contract:

- `originAgentMode: AgentMode`
- `allowedToolNames: string[]`
- `enforceOrder: true`
- `createdFromConversationId?: string`

Decision:

- executable plans must include `execution`
- advisory plans may omit it
- `startPlanExecution()` must fail closed if the selected artifact is missing `execution`, unless an explicit temporary migration fallback is enabled

This metadata must be set at plan creation time, not guessed later.

### 2. Persist plan provenance at generation time

When `AIService` creates a plan artifact:

- persist the normalized current `agentMode`
- persist the exact mode-filtered tool list used during generation
- persist any execution policy defaults
- persist whether the plan is executable at all

Apply this rule consistently:

- multi-step execution plans get `execution`
- advisory/scoping plans that should not be executable remain without it and should not expose execution affordances

This avoids re-deriving execution constraints from mutable runtime state.

### 3. Remove client-side `general` escalation

Update `executePlanAction()` so the client does not hardcode `agentMode: "general"`.

Preferred approach:

- send only `planId`, `selectedSteps`, `conversationId`, and the normal reasoning options
- let the server load execution mode from the plan artifact metadata

This is safer than trusting the client to echo back the correct mode.

### 3a. Make the plan artifact authoritative for conversation targeting

`startPlanExecution()` already returns the plan artifact `conversationId`. Use it.

Decision:

- if the artifact has a `conversationId`, the server execution path should bind to that conversation instead of trusting the client-provided one
- if the client provided a different conversation, execution should either rebind cleanly or fail with an explicit mismatch during rollout, depending on UX tolerance

### 4. Build plan-scoped tool definitions on the server

During execution:

- load the stored origin mode from the plan artifact
- compute the set of executable tool names from selected steps
- intersect:
  - selected-step tool names
  - stored `allowedToolNames`
  - current scope-safe tool names

The result should be the only tool set exposed to the model during execution.

### 5. Enforce ordered execution

Replace the current “first unconsumed step with same tool name” heuristic with explicit expected-step tracking:

- `nextExpectedIndex` points to the next selected step
- only the expected tool for that step is legal
- if the model emits a different tool:
  - return a tool error explaining the mismatch
  - fail the plan execution

This keeps approval semantics simple and auditable.

### 6. Preserve user-facing flexibility only where safe

Allowed flexibility:

- the model can choose arguments for the approved tool based on conversation and protocol context
- the model can summarize progress in natural language between tool calls

Not allowed:

- introducing new tools not present in approved steps
- reordering steps without explicit future product support
- silently broadening to `general`

### 7. Edge Cases and Failure Behaviors

- Repeated steps using the same tool
  - order still works because matching is by selected step index, not by first available tool name
- Partially selected plans
  - only selected steps define the executable tool set
- Stale plans after router/tool-config changes
  - intersection with current scope-safe tools prevents execution of now-invalid tools
  - execution fails clearly if a selected step references a no-longer-available tool
- Plans created without execution metadata during rollout
  - migration path: derive from parent run metadata only behind a temporary rollout flag, otherwise fail closed and ask for re-plan
- Natural-language progress before the first tool call
  - allowed
  - only tool calls, not prose, are step-constrained

### Practical Impact Translation

- User experience
  - approving a plan becomes a real permission boundary
- Runtime/system behavior
  - plan execution becomes deterministic and bounded
- Operational/support impact
  - easier to explain why a plan failed or stopped

## Long-Term Quality and Scalability

- Maintainability
  - plan behavior is encoded in data, not scattered prompt assumptions
- Reliability
  - fewer surprise tool calls during execution
- Operability
  - step mismatch and tool mismatch become first-class failure signals

### Tradeoffs

- Strict order enforcement is less flexible than free-form execution.
- That is acceptable because the current problem is under-constrained approval semantics, not underpowered execution.

## Execution Slicing

### Slice 1: Metadata and server authority

- extend `PlanPayload`
- persist execution metadata on plan creation
- remove client hardcoded `general`
- make the plan artifact `conversationId` authoritative for execution

Blast radius:
- plan artifact schema, plan creation, plan start

### Slice 2: Plan-scoped tool filtering

- build execution tool set from selected steps
- execute under stored origin mode

Blast radius:
- execution loop and tool filtering

### Slice 3: Ordered-step enforcement

- add expected-step guard
- fail off-plan or out-of-order tool calls
- update tests and UI error mapping as needed

Blast radius:
- plan run behavior and failure semantics

### Alternatives Considered

- Chosen
  - enforce execution inside the existing loop with plan-scoped tool defs and ordered matching
- Rejected
  - relying on stronger prompt wording alone
- Deferred
  - full workflow state machine that could support adaptive branching

## Risk + Rollback

### Primary Failure Modes

- legacy plans without metadata fail to execute
- overly strict step matching causes false failures
- reasoning models attempt non-tool narration before the first step and are incorrectly treated as off-plan

### Detection Signals

- spike in plan runs failing immediately with step mismatch
- plans created before rollout no longer executable
- off-plan tool mismatch errors in logs

### Rollback Path

- keep the metadata addition even if ordered enforcement must be temporarily relaxed
- if necessary, fall back from strict order to selected-step-set enforcement while retaining origin-mode confinement

## Verification Strategy

### Test Matrix

- Happy path
  - plan generated in `search` executes in `search`
  - selected steps complete with only approved tools
- Edge cases
  - repeated same-tool steps remain ordered
  - stale or invalid plan tool references fail closed
  - plans without metadata use explicit fallback handling
- Regression scenarios
  - non-plan chat path unaffected
  - optimistic step updates still render correctly

### Relevant Test Layers

- unit tests for `PlanPayload` parsing
- execution tests for tool filtering and mismatch behavior
- reducer/UI tests for failed plan status propagation
- tests for advisory plans without `execution`
- tests for conversation mismatch/rebinding behavior

### Acceptance Signals

- no execution path forces `general`
- off-plan tool calls fail the execution
- selected-step order is enforced and visible in status updates

## Validation Mapping

- `cd next-app && npx tsc --noEmit`
  - catches schema/type changes across artifacts, client actions, and execution code
- `cd next-app && npx vitest run`
  - catches plan creation, execution, and reducer regressions

## Debuggability + Triage

### Failure Surface Signals

- plan artifact shows selected steps but execution errors immediately
- logs indicate tool mismatch or missing metadata
- UI step statuses diverge from actual executed tools

### Fast Reproduction Path

1. Create a multi-step plan in `search` mode.
2. Execute only a subset of steps.
3. Attempt to trigger an unrelated tool call during execution.
4. Verify the run fails with an explicit mismatch instead of widening permissions.

### First Triage Steps

- inspect stored plan payload metadata
- inspect selected-step filtering and expected-step pointer state
- inspect tool names presented to the model at execution time
- inspect whether the server rebound to the plan artifact conversation or trusted stale client state

### First Owner

- agent runtime owner for plan execution and AI loop enforcement

## Assumptions / Defaults

- Users interpret plan approval as a real execution boundary.
- The server, not the client, should be authoritative for execution mode.
- Strict ordering is the default until there is an explicit product requirement for adaptive branching.
