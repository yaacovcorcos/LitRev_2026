# Plan: Stream Scope Canonicalization for Study-Scoped Runs

> Supporting plan only. Canonical status, priority, and completion rules live in [../plan-agentic.md](../plan-agentic.md).
>
> Historical note: the route-level fix and regression test for this issue are already present on current `main`. Keep this file as durable remediation detail and regression memory until it is deleted or archived.

## Overall Goal

Ensure every study-scoped `/api/ai/stream` request runs with one canonical owned scope before any runtime, conversation, popup, or context-capture logic starts.

The core rule is:
- if the caller supplies only `studyId`, the stream route must resolve the owning `projectId`
- the resolved owned scope must become the runtime scope
- no later path may fall back to the original caller-supplied `projectId: null` view of the request

## Goal + Scope

### Problem Statement

The stream route previously validated that the caller could access a study, but it did not carry the resolved owned `projectId` forward as the canonical runtime scope. A request with `studyId` and no `projectId` could therefore:
- pass the access check
- still build downstream runtime options with `projectId = null`
- create or load a conversation in effectively global scope
- degrade tool availability and lose project/protocol/ledger context for a study-scoped run

That is a runtime-integrity bug, not just a validation bug.

### Intended Outcome

- Study-scoped stream requests resolve to one owned scope before runtime start.
- The resolved `projectId` is reused consistently for:
  - runtime options
  - conversation loading/creation
  - popup context validation
  - context-capture target validation
  - downstream tool-scope selection
- Stream-route scope behavior matches the existing owned-scope pattern already used by conversation actions.
- Regression coverage proves that `studyId`-only requests enter the runtime with the owning `projectId`.

### In Scope

- `next-app/app/api/ai/stream/route.ts`
- `next-app/app/api/ai/stream/__tests__/route.test.ts`
- canonical runtime-planning memory for this bug and its fix boundary

### Out Of Scope

- broad conversation-scope redesign
- replacing the existing conversation ownership model
- new product behavior around cross-project studies
- UI changes on any chat surface

## Governance and Repo Grounding

- AGENTS trigger mapping: agent runtime/orchestration files
- Required Tier 2 specialist: `docs/agents/specialists/agent-runtime-specialist.md`
- Required Tier 3 retrieval:
  - `docs/plans/plan-agentic.md`
  - this supporting plan

### Current-State Evidence

- `next-app/app/api/ai/stream/route.ts`
  - the stream route accepts optional `projectId` and `studyId`, validates access, builds `scopedOptions`, then starts the runtime
- `next-app/app/actions/conversations.ts`
  - conversation actions already use `resolveOwnedConversationScope(...)` so the stored conversation scope is canonical rather than caller-supplied ids
- `next-app/app/api/ai/stream/__tests__/route.test.ts`
  - current `main` already contains a regression test asserting that a `studyId`-only request is canonicalized to the owning `projectId`

## Documentation Impact and Updates

Documentation updates are required.

- Update `docs/plans/plan-agentic.md`
  - reflect that stream-entry scope canonicalization for owned study scope is now part of current runtime truth
- Update `docs/plans/agent-runtime-remediation/README.md`
  - list this file as supporting remediation memory so it is discoverable

No `PRD.md` update is needed because this is implementation-only runtime correctness work.

## Minimal-Sufficient Strategy

Do not invent a second scope-resolution model.

The smallest honest strategy is:
1. validate project access if `projectId` is present
2. if `studyId` is present, resolve owned study scope through `assertStudyAccess(...)`
3. overwrite route-local scope variables with the owned scope result
4. build `scopedOptions` only from those canonicalized scope variables
5. run popup/context validation against the same canonical scope
6. add a regression test that fails if runtime options ever receive `projectId = null` for a valid `studyId`-only request

## Reuse vs New

### Reuse

- `assertProjectAccess(...)`
- `assertStudyAccess(...)`
- owned-scope normalization pattern already used by `app/actions/conversations.ts`
- existing stream-route test harness and mocks

### New

- a stricter route-local rule:
  - validation output becomes runtime input
- one focused regression test for canonicalized study scope in the stream route

## Decision-Complete Implementation Design

### 1. Canonicalize scope before any downstream use

The route must treat `scopedProjectId` / `scopedStudyId` as mutable canonical scope variables.

Required behavior:
- initialize from request options
- validate explicit `projectId` when present
- when `studyId` is present, call `assertStudyAccess(...)`
- replace the mutable canonical scope with the returned owned scope

Design rule:
- after owned study scope resolution, no later logic should read `options.projectId` or `options.studyId` directly when scope matters

### 2. Build `scopedOptions` only from canonicalized scope

`scopedOptions` is the runtime contract boundary.

Required behavior:
- set `projectId: scopedProjectId`
- set `studyId: scopedStudyId`
- preserve the rest of the normalized run options

This is the decisive handoff that prevents the runtime from downgrading to global scope.

### 3. Reuse canonicalized scope for validation side paths

The same canonicalized scope must govern:
- popup context project checks
- context-capture target project checks
- any later run-scoped metadata emitted from the route

Reason:
- if these validations use the resolved owned scope while runtime uses caller input, the route still has split scope truth

### 4. Match conversation-action semantics

Conversation actions already normalize caller input through owned-scope resolution.

Route-level rule:
- stream entry should follow the same ownership posture even if it does not directly call `resolveOwnedConversationScope(...)`
- route-local owned-scope canonicalization is acceptable as long as the observable result matches the conversation path

### 5. Regression coverage

Add or preserve tests that assert:
- foreign study access returns `403`
- `studyId`-only request resolves owned `projectId`
- `streamChatWithArtifacts(...)` receives that canonicalized `projectId`
- popup/context checks also honor the canonicalized scope when applicable

## Execution Slicing

### Slice 1: Scope normalization in the stream route

- keep mutable route-local scope variables
- overwrite them with `assertStudyAccess(...)` output
- build `scopedOptions` from canonical scope only

Blast radius:
- low and local to stream-entry scope handling

### Slice 2: Validation-path convergence

- ensure popup project checks use canonicalized `scopedProjectId`
- ensure context-capture target checks use canonicalized `scopedProjectId`

Blast radius:
- low and still route-local

### Slice 3: Regression proof

- add focused route test for `studyId`-only canonicalization
- keep unauthorized-study rejection coverage

Blast radius:
- tests only

## Alternatives Considered

### Chosen

- route-local canonical scope variables backed by `assertStudyAccess(...)`

### Rejected

- leaving validation and runtime scope as separate concepts
  - rejected because it preserves split truth
- deferring fix to conversation loading only
  - rejected because popup, context-capture, and runtime tool scope already depend on route options before any conversation semantics can correct them
- building a broader scope-service refactor for this bug
  - rejected because the bug is narrow and the repo already has a small honest fix shape

## Risk + Rollback

### Primary Failure Modes

- later route logic accidentally reuses raw `options.projectId`
- future refactors reintroduce split scope truth between validation and runtime handoff
- tests cover the main runtime call but miss popup/context side paths

### Detection Signals

- study-scoped runs unexpectedly expose only global-scope tools
- missing project/protocol/ledger context on a valid study page
- regression test failure on `studyId`-only requests

### Rollback Path

This should not require functional rollback.

If a regression appears:
- keep owned-scope canonicalization in place
- narrow the fix to the route-local handoff and side-path checks
- do not revert to raw caller-supplied scope as the runtime authority

## Verification Strategy

### Test Matrix

- Happy path
  - `studyId`-only request canonicalizes to owned `projectId`
- Authorization failure
  - foreign `studyId` yields `403` and runtime never starts
- Regression path
  - runtime receives canonicalized `projectId`
- Side-path consistency
  - popup/context checks use canonicalized `projectId`

### Relevant Test Layers

- `next-app/app/api/ai/stream/__tests__/route.test.ts`
- related conversation-scope tests in `next-app/app/actions/__tests__/conversation-scope.test.ts` as a semantic reference

### Required Validation

From `next-app/`:
- `npx tsc --noEmit`
- `npx vitest run app/api/ai/stream/__tests__/route.test.ts app/actions/__tests__/conversation-scope.test.ts`

## Rollout and Operational Notes

- This fix is safe for immediate ship because it narrows scope truth rather than widening permissions.
- No feature flag is recommended.
- The key operational check after ship is simple:
  - a valid study-scoped request without explicit `projectId` must still run with project-scoped tools and project-linked context

## Git Flow and Cleanup

Recommended branch/worktree flow:
1. from repo root `main`, create a dedicated task worktree such as `YY/<task>`
2. implement the route fix and regression test there
3. run the required scoped validations from `next-app/`
4. commit atomically
5. push and open/update a PR into `main`
6. inspect latest review feedback before merge
7. merge only after required checks are green
8. fast-forward repo root `main`, remove the task worktree, and delete the task branch in the same cleanup sequence

Cleanup manifest entry should include:
- worktree path
- branch name
- status
- decision
- short reason

## Completion Rule

This issue is complete when:
- study-scoped stream requests canonicalize owned project scope before runtime start
- popup/context validation shares the same canonical scope
- regression tests prove the runtime sees the owned `projectId`
- canonical runtime planning memory reflects the fix so future refactors do not treat it as accidental behavior
