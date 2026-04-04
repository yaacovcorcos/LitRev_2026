# Testing Agent Contract

This file is LitRev's durable testing doctrine.
It defines how agents should choose proof, what "well tested" means here, and how to avoid false confidence.
Shared lane inventory, local reproduction, and CI execution ergonomics live in `docs/runbooks/testing-ci-strategy.md` and `docs/plans/plan-testing-execution.md`.

This is not a changelog and not a per-task checklist.
Use it when deciding what test to add, what layer should catch a regression first, and whether current coverage is actually sufficient.

## Purpose

LitRev is a high-change product with meaningful risk in:
- runtime orchestration and streaming
- project-shell and stateful client flows
- auth/admin and file-scope boundaries
- DB-backed server behavior
- rollout-gated and browser-specific UI behavior

The goal is not high test volume.
The goal is the smallest truthful mix of deterministic tests, boundary coverage, browser proof, and explicit regression locks that catches real failures early.

## Core Principles

### 1. Test the real risk, not the easiest code path

Every change should answer:
- what invariant could break?
- what layer should catch that breakage first?
- what regression proof would stop this exact bug from quietly returning?

If the test does not exercise the real failure mode, it is not enough.

### 2. Behavior beats implementation detail

Prefer assertions on:
- user-visible behavior
- durable contracts
- reducer or runtime invariants
- action, route, or tool results
- explicit failure handling

Avoid coupling tests to:
- helper call ordering
- incidental DOM structure
- styling classes that are not the contract
- internal implementation details that can change safely

### 3. Use the smallest truthful layer

Prefer the cheapest layer that can truthfully prove the behavior:
- pure logic or policy -> Vitest
- owned boundary interaction -> integration-style Vitest
- browser-only navigation, hydration, layout, or interaction truth -> Playwright

Do not escalate everything to browser tests.
Do not fake browser truth in a unit test when the bug only exists in the browser.

### 4. Bug fixes need regression proof

If a bug is fixed, add a regression test unless there is a documented reason it cannot yet be automated.

The regression proof should reproduce:
- the triggering condition
- the broken invariant
- the expected post-fix behavior

### 5. Isolation is non-negotiable

Tests must not depend on order or leaked state.
Always reset or restore mocks, timers, env overrides, globals, and browser state.

If a test passes only because another test ran first, the test is invalid.

### 6. Mock only at true boundaries

Mock:
- external APIs and providers
- clocks and timers when needed
- expensive nondeterministic dependencies
- browser or platform capabilities unavailable in the harness

Avoid over-mocking owned internal modules when a real integration test is affordable.
If a mocked test would pass while production still breaks, the test is insufficient.

### 7. Hard-to-test code is design feedback

When a feature is hard to test truthfully, treat that as a signal about ownership, hidden coupling, effect-driven orchestration, or weak observability.

## Default Proof Layers

| Risk shape | Default proof |
|---|---|
| Pure logic, parsing, normalization, reducers, validation | unit-style `Vitest` |
| Server actions, routes, tools, service boundaries, context/controller flows | integration-style `Vitest` with truthful input/output assertions |
| Browser-only navigation, hydration, scroll, focus, pointer/keyboard, mobile shell | `Playwright` |
| Quick local visual or exploratory verification | manual checks or `agent-browser`, never as the only durable proof |

## Default Proof by Change Type

| Change type | Minimum proof |
|---|---|
| Pure logic or policy change | unit-style `Vitest` coverage |
| Server action, route, tool, or backend behavior | boundary contract test plus focused policy tests when needed |
| UI behavior change | component/integration test, plus `Playwright` when browser truth is the risk |
| Runtime or orchestration change | reducer/runtime invariant tests, boundary tests, and abnormal-end or recovery proof for the touched path |
| Bug fix | one exact regression test, plus a nearby invariant test when the bug family can recur through adjacent paths |

Passing `npx vitest run` alone does not mean a change is well tested.

## High-Risk Proof Matrix

| Surface | Minimum proof | Browser proof required when | False-confidence trap |
|---|---|---|---|
| Agent runtime and streaming | reducer/runtime invariants, stream assembly or boundary tests, and recovery or abnormal-end proof for the touched path | visible timeline, composer, hydration, or interaction behavior changed | happy-path-only stream tests |
| Auth and admin boundaries | allow/deny tests, privilege separation, and audit-sensitive regression coverage | the bug is in entry, redirect, session, or admin UI behavior | happy-path admin tests |
| Files and storage scope | owner-scope tests plus adversarial path, input, and authorization cases | the bug is in user-visible upload/download flow | testing only canonical paths |
| Project shell and stateful client flows | context/controller tests for reset, persistence, stale-state, or navigation ownership | scroll, focus, hydration, or route transition behavior is the bug | rerender-based tests that hide stale mirrored state |
| Responsive or mobile foundation | component/integration proof plus foundation `Playwright` when route-critical behavior changed | layout, scroll, navigation, or hydration truth depends on the real browser | desktop-only proof |
| Search, provider, and citation contracts | contract-shape tests, invalid payload handling, and provider-drift proof where relevant | the issue exists only in rendered hover/result UI | type cleanup without contract regression proof |
| DB-backed write paths and destructive mutations | boundary tests for success, denial, conflict, and failure paths | the bug is in the visible user flow around the mutation | asserting helper internals instead of durable boundary results |

## Placement and Mocking Rules

- Preserve existing local test organization where a surface already has a clear pattern.
- When a domain already uses a nearby `__tests__` directory, add the new test there unless governance explicitly says otherwise.
- When runtime-governed domains require selective colocated coverage, follow the current lint-governance rules instead of inventing a new exception.
- Clear or restore mocks, timers, env, globals, and storage state between tests.
- Be careful with hoisted `vi.mock(...)` behavior and partial mocks that hide owned-module logic.

## Browser Truth Policy

- Use `Playwright` when the risk is browser truth, not because a browser test feels more reassuring.
- Use `agent-browser` for fast exploratory verification against a running dev server, not as a substitute for checked-in regression coverage.
- Keep browser tests isolated, scenario-focused, and built around user-facing outcomes.
- Detailed setup and machine readiness guidance lives in `docs/runbooks/browser-tooling-readiness.md`.

## Testing-Agent Review Questions

When reviewing a change, ask:

1. What user-visible or system-level contract could regress here?
2. Which layer should detect that regression first?
3. Did we add the smallest truthful proof, or just the easiest test to write?
4. Is the current test too mocked, too shallow, or at the wrong layer?
5. Is there a missing denial, abnormal-path, or recovery test?
6. If this bug came back, would CI catch it?
7. If not, what is the smallest durable test or rule that should be added?

## Use This With

- `AGENTS.md` for route-specific command gates
- `docs/runbooks/testing-ci-strategy.md` for shared lane meaning, local reproduction, and CI expectations
- `docs/plans/plan-lint-governance.md` for executable governance and runtime test-policy rollout
- `docs/architecture/frontend-quality-bar.md` and `docs/runbooks/frontend-review-loop.md` for UI verification expectations
- `docs/plans/plan-agentic.md` and active runtime remediation plans for runtime-specific test obligations
- `docs/reviews/repo-health.md` for recurring repo-wide testing risks
