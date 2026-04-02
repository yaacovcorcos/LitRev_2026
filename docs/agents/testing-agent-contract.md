# Testing Agent Contract

This file is the durable testing doctrine for LitRev.
It defines how agents should think about tests, what "well tested" means in this repository, and how to choose the right test layer for a change.
Execution ergonomics, CI-lane evolution, and shared testing-operations improvements are tracked separately in `docs/plans/plan-testing-execution.md`.

This is not a changelog and not a per-task checklist.
Use it as the canonical cross-cutting testing contract when deciding what tests to add, improve, or require before merge.

## Purpose

LitRev is a high-change product with meaningful risk in:
- runtime orchestration
- project-shell interaction flows
- auth/admin boundaries
- DB-backed server behavior
- rollout-gated UI behavior

The testing goal is not "high volume."
The testing goal is to catch real regressions early with the smallest reliable mix of deterministic tests, integration coverage, browser validation, and explicit bug-regression proof.

## Core Principles

### 1. Test the real risk, not the easiest code path

Every change should answer:
- what invariant could break?
- what layer should catch that breakage first?
- what regression test proves this exact bug will stay fixed?

Do not stop at "the test passes" if the test does not exercise the real failure mode.

### 2. Behavior beats implementation detail

Prefer assertions on:
- user-visible behavior
- durable contracts
- reducer/runtime invariants
- action/route/tool results
- observably correct failure handling

Avoid coupling tests to:
- internal helper ordering
- incidental DOM structure
- styling classes that are not the contract
- transient implementation details that can change without breaking behavior

### 3. Use the smallest reliable test layer

Prefer the cheapest layer that can truthfully prove the behavior:
- pure logic or policy: unit-style Vitest
- owned boundary interaction: integration-style Vitest
- browser-only behavior, navigation, layout ownership, hydration, or real input flows: Playwright

Do not escalate everything to end-to-end tests.
Do not fake browser/runtime behavior in a unit test when the bug only exists in the browser.

### 4. A bug fix is not complete without regression proof

If a bug is fixed, add a regression test unless there is a documented reason it cannot be automated yet.

The regression test should reproduce:
- the triggering condition
- the broken invariant
- the expected post-fix behavior

### 5. Isolation is non-negotiable

Tests must not depend on order or leaked state.

Always reset or restore:
- mocks
- timers
- env overrides
- globals
- browser storage/cookies/session state

If a test passes only because another test ran first, the test is invalid.

### 6. Mock only at true boundaries

Mock:
- external APIs and providers
- clocks and timers when needed
- expensive nondeterministic dependencies
- browser/platform capabilities not available in the current harness

Avoid over-mocking owned internal modules when a real integration test is affordable.

If mocking hides the failure mode, use a different test shape.

### 7. Tests are part of architecture, not just verification

Weak tests often signal:
- unclear ownership
- effect-driven orchestration
- hidden coupling
- unstable contracts
- poor observability

When a feature is hard to test truthfully, treat that as design feedback.

## LitRev Test Pyramid

LitRev should follow a practical pyramid:

### 1. Small deterministic tests

Primary tool:
- `Vitest`

Use for:
- pure logic
- reducers
- selectors
- parsers and transforms
- validation
- normalization
- server-side policies
- tool gating and contract shaping
- state-machine and runtime-transition rules

Properties:
- fast
- deterministic
- low setup
- no browser required unless the test explicitly opts into `jsdom`

### 2. Integration-style tests

Primary tool:
- `Vitest` with explicit `jsdom` where needed

Use for:
- route handlers
- server actions
- context/controller ownership
- component interaction flows
- cross-module boundaries within one owned feature
- runtime/controller invariants that span more than one function

Properties:
- slightly heavier
- should still remain focused and deterministic
- should prefer real owned modules over excessive internal mocking

### 3. Browser tests

Primary tool:
- `Playwright`

Use for:
- navigation and route transitions
- hydration/client-navigation differences
- scroll ownership
- keyboard and pointer behavior that depends on the browser
- auth entry flows
- critical mobile and desktop shell behavior
- end-to-end regression coverage for historically fragile product journeys

Properties:
- high value, lower volume
- scenario-focused
- must stay stable and intentional

### 4. Manual exploratory checks

Manual verification is still valid for:
- nuanced UX
- animation/motion quality
- perception-level layout quality
- approval-gated UI changes
- hard-to-automate product judgment

Manual checks do not replace automated regression coverage for known bug families.

## Required Change-to-Test Mapping

### Pure logic and policy changes

Add or update:
- unit-style Vitest coverage

Examples:
- parsers
- reducers
- validation
- normalization
- scheduling or policy decisions

### Server actions, routes, tools, or backend service behavior

Add or update:
- contract/integration tests around the owned boundary
- focused unit tests for policy-heavy internals

Prefer:
- truthful input/output assertions
- explicit edge-case and failure-path coverage

### UI behavior changes

Add or update:
- component/integration tests for the changed user behavior
- browser tests if the behavior depends on real navigation, browser layout, or hydration differences

For meaningful UI changes, cover:
- success
- empty
- loading
- error
- retry/recovery when relevant

### Runtime/orchestration changes

Treat runtime testing as a special high-risk domain.

Add or update:
- reducer/runtime tests
- boundary/contract tests
- targeted scenario tests for the exact recovered or failed condition

Runtime changes are not done when "the tests pass."
They are done when:
- the behavior is testable
- the failure mode is observable
- the regression path is locked

### Bug fixes

At minimum:
- one regression test for the exact trigger

Often also needed:
- a nearby invariant test
- a broader flow test if the bug existed at a boundary rather than inside one function

## Test Placement Policy

LitRev already has many `__tests__` directories.
Do not force a repo-wide relocation campaign just to satisfy aesthetic purity.

The contract is:
- preserve existing test organization where that surface already has a clear pattern
- add new tests in the established local pattern for that surface
- prefer deterministic placement rules over ad hoc choices

Current practical rule:
- when a domain already uses a nearby `__tests__` directory, add the new test there unless governance explicitly requires otherwise
- when runtime-governed domains require selective colocated coverage, follow the current lint-governance rule and waiver policy instead of inventing a new exception

The lesson to borrow from Factory is deterministic policy, not literal file-layout imitation.

## Mocking Policy

Follow these rules with Vitest:

1. Clear or restore mocks between tests.
2. Be careful with hoisted `vi.mock(...)` behavior.
3. Prefer partial mocks only when the boundary is well understood.
4. Do not assume internal module calls will respect an external partial mock.
5. When using fake timers, explicitly restore real timers.
6. When stubbing globals or env, restore them before the next test.

If a mocked test would pass while production still breaks, the test is insufficient.

## Browser-Test Policy

Use Playwright for:
- real navigation flows
- route transitions
- auth/login flow boundaries
- scroll ownership
- browser-only event behavior
- hydration/client-side navigation regressions
- mobile-shell and desktop-shell critical journeys

Use `agent-browser` for:
- live interactive verification against a running dev server
- exploratory browser checks and screenshots during implementation
- fast agent-driven inspection before deciding whether durable coverage is needed

Keep browser tests:
- isolated
- scenario-focused
- small in count relative to Vitest
- built around user-facing locators and outcomes

Do not use Playwright as a substitute for missing unit or integration coverage.
Do not use `agent-browser` as a substitute for durable checked-in Playwright coverage when the risk should be caught in CI.

## High-Risk Surfaces That Need Stronger Coverage

The following surfaces deserve above-average testing rigor:
- `next-app/lib/server/agent/**`
- `next-app/lib/server/ai/**`
- `next-app/lib/agent/**`
- `next-app/app/actions/**`
- `next-app/app/api/**`
- `next-app/app/page.tsx` and home bootstrap/navigation behavior
- project shell and embedded shell boundaries
- auth/admin guard flows
- DB-sensitive write paths

For these domains, prefer:
- explicit regression tests
- contract tests
- edge-case and abnormal-end tests
- scenario coverage for historically confirmed failures

## What "Well Tested" Means In LitRev

A change is well tested only when:
- the real risk is identified
- the right layer catches it
- the exact bug family is covered if this is a fix
- nearby failure paths are considered
- mocks do not hide the real behavior
- the coverage fits the repo's actual architecture and current plan direction

Passing `npx vitest run` alone does not mean the change is well tested.

## Testing-Agent Review Questions

When reviewing a change, the testing agent should ask:

1. What is the user-visible or system-level contract here?
2. What could regress even if typecheck and lint pass?
3. Which layer should detect that regression first?
4. Is the current test too mocked, too shallow, or at the wrong layer?
5. Is there a missing abnormal-path test?
6. If this bug came back, would CI catch it?
7. If not, what is the smallest durable test or governance rule that should be added?

## Relationship To Other LitRev Docs

Use this contract together with:
- `AGENTS.md` for route-specific required command gates
- `docs/plans/plan-lint-governance.md` for executable governance and runtime test-policy rollout
- `docs/architecture/frontend-quality-bar.md` and `docs/runbooks/frontend-review-loop.md` for UI verification expectations
- `docs/plans/plan-agentic.md` and active runtime remediation plans for runtime-specific test obligations
- `docs/reviews/repo-health.md` for known recurring repo-wide testing risks

## External Reference Posture

This contract is intentionally aligned with the strongest reusable ideas from:
- Factory's public governance/testing posture: deterministic rule-backed conventions, reusable agent checks, and adaptation over blind import
- Testing Library's user-centered assertion philosophy
- Playwright's isolation and browser-truth guidance
- Vitest's explicit mock/reset discipline

LitRev should borrow principles, not copy another repo's structure mechanically.
