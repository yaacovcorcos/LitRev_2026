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
  - `npm run lint:governance:phase2-hotspots`
  - `npm run lint:governance:phase3-searchability`
  - `npm run lint:governance:audit`
  - `npm run test:eslint-rules`
- Governance tooling now has a separate targeted validation command:
  - `npm run test:governance-tooling`
- CI now runs governance rule tests, governance lint, the governance audit artifact, and the runtime test-impact guard independently before the full-repo lint baseline becomes a required gate.
- Governance tooling imports now come from direct devDependencies in `next-app/package.json`, not only transitive `eslint-config-next` dependencies.
- Phase 1 now has explicit config slices for the governed app surface and a scripts-only logging slice, plus a stable `npm run lint:governance:phase1` verifier.
- Phase 2 now has a dedicated `npm run lint:governance:phase2-hotspots` verifier for the `/ai` + copilot runtime surface, including `hooks/useCopilotStreamActions.ts` and the bundled async-cleanup rules for that same hot-spot slice only.
- The remaining non-Phase-3 governance roadmap is now intentionally compressed into two phases:
  - `Phase 4 — Policy Maturity`
  - `Phase 5 — Enforcement Rollout`
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
Status: Done

Shipped:
- `litrev/no-new-exhaustive-deps-disable`
- Removal of the targeted hot-spot `react-hooks/exhaustive-deps` suppressions
- Replacement of the old warning-only effect import restriction with a real targeted guardrail
- Stable `npm run lint:governance:phase2-hotspots` verification command for the completed Phase 2 hot-spot surface

Missing:
- Nothing material for the original Phase 2A scope

### Phase 2B — Semantic Effect Discipline
Status: Done

Shipped:
- `litrev/no-improper-direct-effects`
- `litrev/no-effect-reset-choreography`
- Purposeful cleanup of the intended hot-spot runtime files:
  - `/ai`
  - `ProjectCopilotContext`
  - `useCopilotConversations`
  - `useCopilotStreamActions`
  - `CopilotInputCore`
  - `TimelineRenderer`
  - `usePendingApprovalBarState`
- Bundled async-cleanup removal for the same Phase 2 hot-spot verifier surface only

Missing:
- Nothing material for the original Phase 2B hot-spot scope

### Phase 3A — Import Searchability
Status: Done

Shipped:
- `litrev/no-cross-boundary-parent-imports`
- Cleanup of the initial high-signal UI offenders in conversation/copilot/project note surfaces
- Stable `npm run lint:governance:phase3-searchability` verifier for the governed UI surface
- Hardening for sourced re-exports and string-literal dynamic imports in governed UI files

Missing:
- Nothing material for the original Phase 3A scope

### Phase 3B — Primary Export Searchability
Status: Done

Shipped:
- `litrev/filename-match-primary-export`
- Initial exceptions for framework files and obvious utility buckets
- Cleanup of the governed UI warning sites so filename/export mismatches no longer remain in the completed Phase 3 surface
- Promotion of the dedicated Phase 3 verifier so both searchability rules are now actionable there

Missing:
- Nothing material for the original Phase 3B scope

### Phase 4 — Policy Maturity
Status: Partially Implemented

Shipped:
- Async-discipline rules are implemented:
  - `litrev/prefer-async-await-in-ui-runtime`
  - `litrev/no-promise-chain-side-effects`
  - `litrev/no-window-location-navigation`
- Test-expectation governance exists:
  - `litrev/require-tests-for-runtime-files`
  - `litrev/prefer-colocated-tests-in-selected-domains`
  - changed-files runtime test-impact script and CI wiring
- The current adapted governance set already includes selective Factory-inspired frontend restrictions from earlier phases, but no distinct re-audit/completion pass has been done yet
- First cleanup waves have already landed in selected UI/runtime files

Missing:
- Dedicated cleanup pass across the intended async-governed UI/runtime surfaces
- Explicit exception review for dynamic imports and deliberate infrastructure chains
- Narrow-domain tuning so test-expectation warnings reflect deliberate ownership instead of broad structural debt
- Explicit waiver/ownership policy for accepted non-colocated runtime coverage
- Re-audit before adopting any additional Factory-inspired frontend restrictions beyond the current adapted set
- Stable verifier commands and implementation plans for the completed async-policy and test-policy surfaces

### Phase 5 — Enforcement Rollout
Status: Partially Implemented

Shipped:
- Governance rule tests in CI
- Governance lint in CI
- Governance audit artifact in CI
- Runtime test-impact guard in CI
- Completed verifier commands already exist for finished earlier phases:
  - `npm run lint:governance:phase1`
  - `npm run lint:governance:phase2-hotspots`
  - `npm run lint:governance:phase3-searchability`

Missing:
- Final decision on which governance checks are required versus informational
- Stable verifier commands for the remaining completed policy surfaces before enforcement is tightened further
- Documented waiver/exception policy for governance checks that remain non-blocking
- Later merge-gate tightening plan once warning debt is intentionally reduced
- Any move to require the full legacy `npm run lint` baseline

## Active Tasks
- [ ] `LG-004` Complete unified Phase 4 policy maturity: finish async-discipline cleanup, narrow the test-expectation policy, and re-audit selective Factory-inspired strictness before adding any new frontend restrictions.
- [ ] `LG-005` Complete unified Phase 5 enforcement rollout: decide required versus informational governance checks, wire the remaining stable verifier commands into CI, and document waiver policy.
- [ ] `LG-006` Decide the first server/runtime structured-logging rule set so UI noise and observability paths are governed separately.

## Recently Completed
- [x] Completed Phase 3 by hardening import-boundary enforcement for sourced re-exports and string-literal dynamic imports, adding the stable `lint:governance:phase3-searchability` verifier, and cleaning the remaining UI filename/export mismatches without broadening Phase 3 beyond the governed UI surface.
- [x] Compressed the remaining non-Phase-3 roadmap into unified `Phase 4 — Policy Maturity` and `Phase 5 — Enforcement Rollout` so policy completion stays separate from CI enforcement.
- [x] Completed Phase 2 by shipping the stable `lint:governance:phase2-hotspots` verifier, removing the remaining hot-spot effect/reset violations in copilot UI/runtime files, and bundling the co-located async cleanup for that same verifier surface without broadening Phase 4 completion.
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
