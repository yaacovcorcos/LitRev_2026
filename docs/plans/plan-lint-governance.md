# Lint Governance Plan (Canonical)

## Purpose
Canonical tracker for LitRev's repo-local lint-governance program.

This plan owns:
- custom lint-rule architecture under `next-app/`
- staged governance-rule rollout
- audit baseline commands and CI gating order

This plan does not own product behavior or `PRD.md`.

## Current Architecture
- Governance lint now has a repo-local architecture under `next-app/eslint/` with rule-per-convention packaging, per-rule docs/tests, and layered internal configs.
- `next-app/scripts/lint-governance-audit.mjs` is the authoritative baseline generator for governance metrics; it now reads from shared JS file enumeration under the governance lint surface so the documented glob policy and actual counts cannot drift.
- Governance-specific commands are now separate from the legacy lint baseline:
  - `npm run lint:governance`
  - `npm run lint:governance:phase1`
  - `npm run lint:governance:audit`
  - `npm run test:eslint-rules`
- Governance tooling now has a separate targeted validation command:
  - `npm run test:governance-tooling`
- CI now runs governance rule tests, governance lint, the governance audit artifact, and the runtime test-impact guard independently before the full-repo lint baseline becomes a required gate.
- Governance tooling imports now come from direct devDependencies in `next-app/package.json`, not only transitive `eslint-config-next` dependencies.
- Phase 1 now has explicit config slices for the governed app surface and a scripts-only logging slice, plus a stable `npm run lint:governance:phase1` verifier.
- Phase 2 now has a dedicated `npm run lint:governance:phase2-hotspots` verifier for the `/ai` + copilot runtime surface, including `hooks/useCopilotStreamActions.ts` and the bundled async-cleanup rules for that same hot-spot slice only.
- The repo currently contains an implemented first wave of governance cleanup in app/runtime code, including removal of targeted non-framework default exports, `catch(console.error)` sites, hot-spot `react-hooks/exhaustive-deps` suppressions, and selected cross-boundary parent imports.

## Program Status
This program was partially implemented before separate per-phase implementation plans were written. Use the phase status list below as the authoritative tracker for what is actually shipped versus still pending.

## Phase Status
### Phase 0 — Foundation and Reproducible Audit
Status: Done

Shipped:
- Repo-local lint framework under `next-app/eslint/`
- Local plugin, layered configs, per-rule docs/tests, and shared rule helpers
- Governance commands in `next-app/package.json`
- Authoritative audit script at `next-app/scripts/lint-governance-audit.mjs`
- Canonical plan registration in `docs/plans/README.md`

Missing:
- Nothing material for the original Phase 0 scope

### Phase 1 — Low-Noise Governance Wins
Status: Done

Shipped:
- `litrev/no-default-export-except-framework`
- `litrev/no-catch-console-error`
- `litrev/no-log-and-throw-same-block`
- First cleanup wave for targeted non-framework default exports
- Stable `npm run lint:governance:phase1` verification command
- `scripts/**` enforcement for the two Phase 1 logging rules only
- Remaining live Phase 1 violations removed, including `scripts/test-ai-setup.ts` and `lib/server/agent/artifacts.ts`

Missing:
- Nothing material for the original Phase 1 scope

### Phase 2A — Mechanical Effect Guardrails
Status: Mostly Done

Shipped:
- `litrev/no-new-exhaustive-deps-disable`
- Removal of the targeted hot-spot `react-hooks/exhaustive-deps` suppressions
- Replacement of the old warning-only effect import restriction with a real targeted guardrail

Missing:
- Final confirm that the remaining suppressions outside the hot-spot scope are either allowed or moved into a later cleanup phase

### Phase 2B — Semantic Effect Discipline
Status: Partially Implemented

Shipped:
- `litrev/no-improper-direct-effects`
- `litrev/no-effect-reset-choreography`
- Initial warning-only rollout in the intended hot-spot surfaces

Missing:
- Purposeful cleanup wave for `/ai`, copilot runtime, timeline state, and project layout to reduce warnings to low noise
- Per-surface decision on which remaining warnings are true violations versus acceptable current architecture
- Phase-specific implementation plan before any severity tightening

### Phase 3A — Import Searchability
Status: Partially Implemented

Shipped:
- `litrev/no-cross-boundary-parent-imports`
- Cleanup of the initial high-signal UI offenders in conversation/copilot/project note surfaces

Missing:
- Wider review of the targeted UI surface set to confirm the rule is low-noise enough for stricter enforcement
- Separate implementation plan for the remaining import-boundary cleanup wave

### Phase 3B — Primary Export Searchability
Status: Partially Implemented

Shipped:
- `litrev/filename-match-primary-export`
- Initial exceptions for framework files and obvious utility buckets

Missing:
- Rule tuning to reduce naming-noise on legitimate LitRev patterns
- Deliberate cleanup of current warning sites before any severity change

### Phase 4 — Async Discipline in UI/Runtime
Status: Partially Implemented

Shipped:
- `litrev/prefer-async-await-in-ui-runtime`
- `litrev/no-promise-chain-side-effects`
- `litrev/no-window-location-navigation`
- First small cleanup wave in selected UI/runtime files

Missing:
- Dedicated cleanup pass across the intended UI/runtime surfaces
- Explicit exception review for dynamic imports and deliberate infrastructure chains
- Separate implementation plan before broad enforcement changes

### Phase 5 — Test Expectations via Lint and CI
Status: Partially Implemented

Shipped:
- `litrev/require-tests-for-runtime-files`
- `litrev/prefer-colocated-tests-in-selected-domains`
- Changed-files runtime test-impact script and CI wiring

Missing:
- Narrow-domain tuning so the warnings reflect the intended policy instead of broad structural debt
- Explicit waiver/ownership policy for accepted non-colocated runtime coverage

### Phase 6 — Adapted Factory Frontend Strictness
Status: Not Started

Shipped:
- None as a distinct reviewed phase

Missing:
- Re-audit after earlier phases stabilize
- Any decision to adopt additional Factory-inspired restrictions beyond the currently implemented adapted rules

### Phase 7 — CI and Merge-Gate Rollout
Status: Partially Implemented

Shipped:
- Governance rule tests in CI
- Governance lint in CI
- Governance audit artifact in CI
- Runtime test-impact guard in CI

Missing:
- Final decision on which governance checks are required versus informational
- Later merge-gate tightening plan once warning debt is intentionally reduced
- Any move to require the full legacy `npm run lint` baseline

## Active Tasks
- [ ] `LG-001` Write separate implementation plans for Phase 2B, Phase 3A/3B, Phase 4, and Phase 5 before further rollout or cleanup work.
- [ ] `LG-002` Reduce warning-only governance debt in effect hot spots until Phase 2B is low-noise enough to distinguish real violations from accepted architecture.
- [ ] `LG-003` Finish the remaining import-boundary and filename-searchability review so Phase 3 can be marked complete or intentionally limited.
- [ ] `LG-004` Decide the first server/runtime structured-logging rule set so UI noise and observability paths are governed separately.
- [ ] `LG-005` Narrow the test-expectation policy so Phase 5 reflects deliberate ownership and waiver rules rather than broad structural warnings.
- [ ] `LG-006` Re-audit the repo before adopting any additional Factory-inspired frontend restrictions beyond the current adapted set.

## Recently Completed
- [x] Added the stable `lint:governance:phase2-hotspots` verifier and completed the PR 1 runtime/controller cleanup for `/ai`, `ProjectCopilotContext`, `useCopilotConversations`, and `useCopilotStreamActions`, while keeping the remaining component/layout debt explicit for the Phase 2 follow-up slice.
- [x] Completed Phase 1 by locking exact rule scope, adding a stable `lint:governance:phase1` verifier, extending the logging rules to `scripts/**` only, and fixing the remaining live logging violations.
- [x] Hardened Phase 0 by declaring direct governance ESLint plugin dependencies, moving the audit baseline onto tested shared JS enumeration, and adding dedicated governance-tooling tests.
- [x] Rewrote this plan into an explicit phase-status tracker so future work can review the program phase by phase against actual shipped state.
- [x] Established the repo-local lint-governance framework, audit script, dedicated governance commands, and initial layered config wiring.
- [x] Added first-wave governance rules for default exports, `catch(console.error)`, log-and-throw duplication, hot-spot effect suppressions, parent-directory imports, filename/searchability, async-chain warnings, and direct browser-location navigation.
- [x] Added the changed-files runtime test-impact script and CI wiring for governance rule tests, governance lint, and audit reporting.

## Implementation Rules
- Treat `lint-governance-audit.mjs` as the authoritative source for governance counts.
- Pair rule rollout with code cleanup in the same task whenever the rule is intended to become actionable.
- Keep effect-discipline rollout split into mechanical and semantic waves.
- Do not treat a phase as complete just because its rules exist; the phase is complete only when the intended cleanup/tuning and enforcement posture are also complete.
- Do not promote the full `npm run lint` baseline to required CI until the broader repo baseline is intentionally cleaned or waived.
