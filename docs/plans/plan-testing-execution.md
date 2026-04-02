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
- The current command surface is broad but still partially historical rather than conceptual; names mix tool identity, local history, and lane purpose.
- There is no thin repo-root wrapper layer such as a `justfile`; contributors and agents still need to remember or rediscover the right `next-app/` commands from docs and local knowledge.
- There is no short canonical testing/CI strategy doc that explains, in one place, what is expected locally before push versus what runs as required PR validation versus what runs as informational or scheduled heavy coverage.
- Required `check` in `.github/workflows/ci.yml` already provides a meaningful base lane:
  - Prisma migrate deploy + schema-drift check
  - `npx tsc --noEmit`
  - `npm run lint` through `governance:ci-required`
  - `npm run governance:ci-required`
  - `npm run governance:ci-informational` as non-blocking reporting
  - chat stream architecture guard
  - full `npx vitest run`
  - production build
- Heavier or orthogonal lanes already exist outside the required `check` path:
  - `.github/workflows/mobile-smoke.yml` runs the mobile foundation Playwright suite on `main` and on PRs that touch relevant UI/e2e paths
  - `.github/workflows/perf-nightly.yml` runs scheduled and `main`-branch performance certification with uploaded nightly artifacts
- `next-app/playwright.config.ts` currently defines a single `mobile-chromium` project and a repo-local dev-server boot contract that targets `/login`.
- Changed-scope execution already exists in two narrow forms:
  - path filtering for the mobile foundation workflow
  - `next-app/scripts/check-runtime-test-impact.mjs` for governed runtime test-impact enforcement
- `docs/reviews/repo-health.md` currently records raw `npm run lint` at `0` errors and `0` warnings on `main`, and raw lint now runs inside the protected `check` contract through `governance:ci-required`.
- LitRev already has several good execution ideas shipped in pieces, but they are not yet presented as one coherent testing operating system.

## External Pattern Position

This plan adapts ideas through `docs/runbooks/external-pattern-intake.md`, not by copying other repos directly.

The current intended upstream lessons are:
- OpenAI Codex: explicit fast-versus-heavy workflow explanation plus a thin local command wrapper layer
- OpenClaw: stronger named test-surface taxonomy, limited changed-scope execution for expensive lanes, and intentional smoke/perf lanes
- OpenCode: clearer ownership of where tests run, cleaner unit-versus-e2e separation, and stronger CI artifact discipline

LitRev should adapt those ideas to its existing owner model, not import a foreign CI matrix or duplicate truth across multiple wrapper layers.

## Program Status
The testing doctrine is already strong. The remaining work is to make that doctrine easier to run, easier to understand, and harder to misuse.

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
Status: Active

Shipped:
- Existing package scripts already cover the main tools and several higher-value lanes
- Route-specific mandatory validation remains clearly documented in `AGENTS.md`

Missing:
- A thin repo-root wrapper layer that calls canonical package commands without becoming a second source of truth
- Stable conceptual entrypoints for common shared lanes, such as:
  - `check:pr`
  - `test:unit`
  - `test:integration`
  - `test:governance`
  - `test:e2e:foundation`
  - `test:e2e:local`
- A backward-compatible alias policy so historical script names can be retired intentionally rather than abruptly

### Phase 2 — CI Strategy and Lane Ownership Clarity
Status: Active

Shipped:
- Required `check` is already meaningful and branch-protection-backed
- Mobile foundation and performance certification are already separate from the core `check` lane

Missing:
- One short canonical CI/testing strategy doc that explains:
  - what contributors should run locally before push
  - what `check` guarantees
  - what remains informational
  - what runs only on `main` or on schedule
- An owner matrix for each cross-cutting lane so failures have an obvious first owner
- Local reproduction guidance for non-`check` lanes that currently live mostly in workflow files or scattered docs

### Phase 3 — Changed-Scope and Smoke Discipline
Status: Active

Shipped:
- Workflow path filtering for the mobile foundation lane
- Changed-file runtime test-impact enforcement for governed runtime domains
- Existing smoke-like scripts in selected domains such as citation and mobile entry

Missing:
- One explicit policy for where changed-scope execution is allowed and where full execution remains required
- A curated, small cross-cutting smoke inventory for historically fragile high-signal flows
- Artifact and debugging-output expectations for browser smoke and foundation lanes
- An explicit rule that changed-scope optimization is for expensive lanes only, not a blanket CI shortcut

### Phase 4 — Current-State Reporting and Promotion Rules
Status: Active

Shipped:
- `docs/reviews/repo-health.md` already summarizes current testing/lint posture concisely
- `docs/plans/plan-lint-governance.md` already owns the raw-lint-versus-protected-check policy
- `docs/plans/plan-speed-performance.md` already owns performance artifact and budget authority

Missing:
- One durable rule for updating current-state testing summaries whenever lane inventory, baseline posture, or required-check scope changes materially
- Promotion criteria for moving future shared lanes into protected CI without creating drift between workflows, docs, and local reproduction commands
- A light evidence pattern for major testing-execution shifts so repo-health stays concise while dated reviews carry the bulk detail

### Phase 5 — Advanced Expansion After Execution Clarity
Status: Deferred

Shipped:
- Nothing beyond the current mobile-only Playwright project and existing performance certification flow

Missing:
- Any broader browser-matrix expansion beyond what current product risk justifies
- Any wider changed-scope automation beyond expensive, stable lanes
- Additional install/startup/perf smoke layers that do not yet have a clear first owner or maintenance budget

## Active Tasks
- [ ] Add a thin repo-root wrapper layer, likely `justfile` or equivalent, that wraps canonical `next-app/` commands without creating a second source of truth.
- [ ] Introduce a stable shared test taxonomy in `next-app/package.json` with backwards-compatible aliases for the current historically named scripts.
- [ ] Add one short canonical testing/CI strategy doc and link it from the relevant plan and runbook surfaces.
- [ ] Define the first small cross-cutting smoke inventory, limited to historically fragile flows with strong user-facing signal and a clear owning team.
- [ ] Add artifact and failure-inspection rules for browser smoke/foundation lanes before expanding those lanes further.
- [ ] Define the shared promotion criteria for moving a testing lane into protected CI so the workflow, docs, and local reproduction contract change together.

## Recently Completed
- [x] Established a durable repo-wide testing doctrine in `docs/agents/testing-agent-contract.md` and linked it from Tier 3 retrieval.
- [x] Landed a stable governance-required versus governance-informational split so cross-cutting testing policy can evolve without making broad warning debt an accidental merge blocker.
- [x] Closed the raw lint baseline from broadly red to `0` errors / `0` warnings on `main` and promoted raw lint into the protected `check` contract through `governance:ci-required`.
- [x] Added high-signal direct regression coverage for recent cleanup-sensitive flows such as timeline anchoring, streamed tool-call delta assembly, conversation JSON serialization, and hydration/body-scroll behavior.

## Implementation Rules
- Wrapper commands must call canonical package or script entrypoints; they must never become a second hidden implementation layer.
- Keep route-specific mandatory validation in `AGENTS.md`; this plan owns shared execution ergonomics, not domain routing.
- Use changed-scope execution only where the lane is expensive, ownership is clear, and the false-negative risk is acceptably low.
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
