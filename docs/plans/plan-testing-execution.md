# Testing Execution Plan

## Purpose
Define the canonical implementation plan for LitRev's cross-cutting testing execution system.

This plan owns:
- shared local testing entrypoints and wrapper ergonomics
- stable test-lane naming and command taxonomy
- CI lane clarity across required, informational, and heavier scheduled flows
- changed-scope execution policy for expensive lanes
- smoke-lane and testing-artifact discipline where the concern is cross-cutting rather than owned by another subsystem
- current-state testing operations summaries when the concern is shared across the repo

This plan does not own:
- per-feature or per-bug test expectations; those stay in `docs/agents/testing-agent-contract.md` and the relevant owner plans
- lint-rule inventory or phase-owned governance enforcement; that stays in `docs/plans/plan-lint-governance.md`
- performance budgets or certification thresholds; that stays in `docs/plans/plan-speed-performance.md`
- backend, runtime, or UI-specific behavior contracts; those stay with their canonical owner plans and runbooks

## Current Architecture (Code-Verified)
- Durable testing doctrine already exists in `AGENTS.md` and `docs/agents/testing-agent-contract.md`.
- `next-app/package.json` already exposes meaningful testing and validation surfaces, including:
  - `test`, `test:run`
  - `test:eslint-rules`, `test:governance-tooling`
  - `test:e2e`, `test:e2e:mobile`, `test:e2e:mobile:foundation`, `test:e2e:mobile:smoke`
  - `governance:ci-required`, `governance:ci-informational`
  - `perf:budget-check`, `perf:generate-results`, and related performance tooling
- `next-app/package.json` now exposes canonical shared aliases for the lanes contributors actually need to reason about:
  - `typecheck`
  - `test:vitest`
  - `test:governance`, `test:governance:informational`
  - `test:e2e:foundation`, `test:e2e:local`
  - `test:smoke:mobile`, `test:smoke:citation`
  - `check:chat-stream-architecture`
  - `check:pr`
- Historical script names remain in place as compatibility aliases, but the canonical shared vocabulary is now lane-shaped rather than tool-history-shaped.
- The repo-root wrapper layer remains intentionally deferred; the package-level canonical aliases plus the strategy runbook are sufficient for current ergonomics without adding a second command front door.
- `docs/runbooks/testing-ci-strategy.md` now provides the short cross-cutting execution reference for:
  - what contributors should run locally before push beyond route-specific `AGENTS.md` requirements
  - what the required `check` gate guarantees versus what remains outside it
  - first-owner triage, local reproduction, changed-scope discipline, and lane-promotion rules
- Required `check` in `.github/workflows/ci.yml` already provides a meaningful base lane:
  - Prisma migrate deploy + schema-drift check
  - `npm run typecheck`
  - `npm run test:governance` (still backed by `governance:ci-required`, including raw `npm run lint`)
  - `npm run test:governance:informational` as non-blocking reporting
  - `npm run check:chat-stream-architecture`
  - `npm run test:vitest`
  - production build
- Heavier or orthogonal lanes already exist outside the required `check` path:
  - `.github/workflows/mobile-smoke.yml` runs the mobile foundation Playwright suite on `main` and on PRs that touch relevant UI/e2e paths
  - `.github/workflows/perf-nightly.yml` runs scheduled and `main`-branch performance certification with uploaded nightly artifacts
- `next-app/playwright.config.ts` currently defines a single `mobile-chromium` project and a repo-local dev-server boot contract that targets `/login`.
- Changed-scope execution already exists in two narrow forms:
  - path filtering for the mobile foundation workflow
  - `next-app/scripts/check-runtime-test-impact.mjs` for governed runtime test-impact enforcement
- `docs/reviews/repo-health.md` currently records raw `npm run lint` at `0` errors and `0` warnings on `main`, and raw lint now runs inside the protected `check` contract through `governance:ci-required`.
- LitRev now has a coherent shared testing execution reference plus canonical lane aliases; the remaining execution gap is the absence of a truthful `test:unit` / `test:integration` split and any future proof that a repo-root wrapper is still worth adding.

## External Pattern Position

This plan adapts ideas through `docs/runbooks/external-pattern-intake.md`, not by copying other repos directly.

The current intended upstream lessons are:
- OpenAI Codex: explicit fast-versus-heavy workflow explanation plus a thin local command wrapper layer
- OpenClaw: stronger named test-surface taxonomy, limited changed-scope execution for expensive lanes, and intentional smoke/perf lanes
- OpenCode: clearer ownership of where tests run, cleaner unit-versus-e2e separation, and stronger CI artifact discipline

Use `OPEN_SOURCE_REFERENCES.md` for the current GitHub URLs behind those named upstreams.

LitRev should adapt those ideas to its existing owner model, not import a foreign CI matrix or duplicate truth across multiple wrapper layers.

## Program Status
The testing doctrine is already strong. Shared execution ergonomics are now materially clearer; the remaining work is to keep the command front door honest without adding fake precision or unnecessary wrapper layers.

## Phase Status

### Phase 0 — Doctrine and Existing Lane Inventory
Status: Done

Shipped:
- Durable repo-wide testing doctrine in `AGENTS.md` and `docs/agents/testing-agent-contract.md`
- Governance-required versus governance-informational split under `governance:ci-required` and `governance:ci-informational`
- Required `check` lane with typecheck, governance, Vitest, and build validation
- Separate mobile foundation Playwright workflow
- Separate scheduled performance certification workflow

Missing:
- Nothing material for the initial inventory/doctrine scope

### Phase 1 — Shared Local Entry Points and Test Taxonomy
Status: Done

Shipped:
- Existing package scripts already cover the main tools and several higher-value lanes
- Route-specific mandatory validation remains clearly documented in `AGENTS.md`
- `next-app/package.json` now exposes canonical shared aliases for the main cross-cutting lanes:
  - `typecheck`
  - `test:vitest`
  - `test:governance`, `test:governance:informational`
  - `test:e2e:foundation`, `test:e2e:local`
  - `test:smoke:mobile`, `test:smoke:citation`
  - `check:chat-stream-architecture`
  - `check:pr`
- The wrapper decision is now explicit: do not add a repo-root wrapper layer unless future evidence shows the canonical package aliases and runbook are still insufficient.

Missing:
- An honest repo-wide `test:unit` versus `test:integration` split; the current Vitest corpus still mixes those layers by design, so introducing those names now would over-promise precision the repo has not earned yet.

### Phase 2 — CI Strategy and Lane Ownership Clarity
Status: Done

Shipped:
- Required `check` is already meaningful and branch-protection-backed
- Mobile foundation and performance certification are already separate from the core `check` lane
- `docs/runbooks/testing-ci-strategy.md` now explains:
  - what contributors should run locally before push beyond route-specific `AGENTS.md` rules
  - what `check` guarantees
  - what remains informational or scheduled
  - the first-owner triage and local reproduction path for current shared lanes

Missing:
- Nothing material for the current CI clarity scope

### Phase 3 — Changed-Scope and Smoke Discipline
Status: Done

Shipped:
- Workflow path filtering for the mobile foundation lane
- Changed-file runtime test-impact enforcement for governed runtime domains
- Existing smoke-like scripts in selected domains such as citation and mobile entry
- `docs/runbooks/testing-ci-strategy.md` now defines:
  - where changed-scope execution is currently allowed
  - the first small cross-cutting smoke inventory
  - failure-inspection rules for the current browser foundation lane

Missing:
- Nothing material for the current shared-lane discipline scope

### Phase 4 — Current-State Reporting and Promotion Rules
Status: Done

Shipped:
- `docs/reviews/repo-health.md` already summarizes current testing/lint posture concisely
- `docs/plans/plan-lint-governance.md` already owns the raw-lint-versus-protected-check policy
- `docs/plans/plan-speed-performance.md` already owns performance artifact and budget authority
- `docs/runbooks/testing-ci-strategy.md` now defines:
  - when shared testing summaries and lane docs must be updated
  - how major testing-execution shifts should record detailed evidence without bloating plan files
  - the promotion rule for moving a shared lane into protected CI

Missing:
- Nothing material for the current promotion/reporting scope

### Phase 5 — Advanced Expansion After Execution Clarity
Status: Deferred

Shipped:
- Nothing beyond the current mobile-only Playwright project and existing performance certification flow

Missing:
- Any broader browser-matrix expansion beyond what current product risk justifies
- Any wider changed-scope automation beyond expensive, stable lanes
- Additional install/startup/perf smoke layers that do not yet have a clear first owner or maintenance budget

## Active Tasks
- [ ] Revisit whether a thin repo-root wrapper layer is needed only if the canonical package aliases plus `docs/runbooks/testing-ci-strategy.md` still prove insufficient in real contributor and agent usage.
- [ ] Introduce `test:unit` and `test:integration` only after the repo has a truthful, maintainable boundary for that split rather than a cosmetic label.

## Recently Completed
- [x] Introduced canonical shared lane aliases in `next-app/package.json` for typecheck, Vitest, governance, E2E foundation/local, smoke, chat-stream architecture, and PR-ready validation while keeping the historical command names backward compatible.
- [x] Closed the repo-root wrapper decision for now: keep the package-level aliases and shared testing runbook as the single ergonomic front door until evidence shows they are not enough.
- [x] Established a durable repo-wide testing doctrine in `docs/agents/testing-agent-contract.md` and linked it from Tier 3 retrieval.
- [x] Landed a stable governance-required versus governance-informational split so cross-cutting testing policy can evolve without making broad warning debt an accidental merge blocker.
- [x] Closed the raw lint baseline from broadly red to `0` errors / `0` warnings on `main` and promoted raw lint into the protected `check` contract through `governance:ci-required`.
- [x] Added high-signal direct regression coverage for recent cleanup-sensitive flows such as timeline anchoring, streamed tool-call delta assembly, conversation JSON serialization, and hydration/body-scroll behavior.
- [x] Added `docs/runbooks/testing-ci-strategy.md` as the canonical shared execution reference for local-before-push expectations, CI lane meaning, first-owner triage, changed-scope rules, smoke inventory, and protected-lane promotion discipline.

## Implementation Rules
- Wrapper commands must call canonical package or script entrypoints; they must never become a second hidden implementation layer.
- Do not add a repo-root wrapper layer unless the canonical package aliases and current runbook still leave common shared lanes meaningfully hard to discover or reproduce.
- Keep route-specific mandatory validation in `AGENTS.md`; this plan owns shared execution ergonomics, not domain routing.
- Use changed-scope execution only where the lane is expensive, ownership is clear, and the false-negative risk is acceptably low.
- Do not introduce `test:unit` or `test:integration` labels until the underlying Vitest corpus is partitioned clearly enough that those names are honest rather than aspirational.
- New smoke lanes must name:
  - the user journey they protect
  - the intended trigger surface
  - the debugging artifact or output available when the lane fails
- Promote new required testing lanes only when the same task updates:
  - the workflow
  - the local reproduction command
  - the owning plan/runbook docs
- Do not use execution-layer work as a substitute for direct regression tests in touched code.
- Keep summary docs concise; store bulky evidence in dated review/report artifacts rather than growing plan files into diaries.
