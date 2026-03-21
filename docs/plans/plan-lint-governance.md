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
  - `npm run lint:governance:phase4-async`
  - `npm run lint:governance:phase4-tests`
  - `npm run lint:governance:phase4-policy`
  - `npm run check:runtime-test-impact`
  - `npm run lint:governance:audit`
  - `npm run test:eslint-rules`
- Governance tooling now has a separate targeted validation command:
  - `npm run test:governance-tooling`
- CI now enforces completed governance phases through `npm run governance:ci-required` inside the required `check` status:
  - `npm run governance:check`
  - `npm run test:eslint-rules`
  - `npm run test:governance-tooling`
  - `npm run lint:governance:phase1`
  - `npm run lint:governance:phase2-hotspots`
  - `npm run lint:governance:phase3-searchability`
  - `npm run lint:governance:phase4-policy`
  - `npm run check:runtime-test-impact`
- CI now always runs non-blocking governance reporting through `npm run governance:ci-informational` inside `check`:
  - `npm run lint:governance`
  - `npm run lint:governance:audit`
- The governance audit artifact remains published from the informational path, and broad warning surfaces stay visible without becoming merge blockers.
- Governance tooling imports now come from direct devDependencies in `next-app/package.json`, not only transitive `eslint-config-next` dependencies.
- Phase 1 now has explicit config slices for the governed app surface and a scripts-only logging slice, plus a stable `npm run lint:governance:phase1` verifier.
- Phase 2 now has a dedicated `npm run lint:governance:phase2-hotspots` verifier for the `/ai` + copilot runtime surface, including `hooks/useCopilotStreamActions.ts` and the bundled async-cleanup rules for that same hot-spot slice only.
- Phase 4 now has stable permanent verifiers for:
  - async policy: `npm run lint:governance:phase4-async`
  - runtime test policy: `npm run lint:governance:phase4-tests`
  - umbrella policy maturity: `npm run lint:governance:phase4-policy`
  - changed-file runtime test impact: `npm run check:runtime-test-impact`
- Runtime test-governance now uses one shared authority under `next-app/eslint/` for governed domains and waiver interpretation, with strict one-file waivers only.
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
Status: Done

Shipped:
- Async-discipline rules are implemented:
  - `litrev/prefer-async-await-in-ui-runtime`
  - `litrev/no-promise-chain-side-effects`
  - `litrev/no-window-location-navigation`
- Test-expectation governance exists:
  - `litrev/require-tests-for-runtime-files`
  - `litrev/prefer-colocated-tests-in-selected-domains`
  - changed-files runtime test-impact script and CI wiring
- Stable permanent verifiers:
  - `npm run lint:governance:phase4-async`
  - `npm run lint:governance:phase4-tests`
  - `npm run lint:governance:phase4-policy`
  - `npm run check:runtime-test-impact`
- Dedicated cleanup pass across the finalized async-governed UI/runtime surface
- Explicit exception review for dynamic imports and deliberate infrastructure chains
- Narrowed runtime test-governance domains with one shared authority for lint rules and the changed-file script
- Strict one-file waiver policy for accepted non-colocated runtime coverage
- Selective strictness decision matrix for additional Factory-inspired frontend restrictions

Missing:
- Nothing material for the finalized Phase 4 scope

### Phase 5 — Enforcement Rollout
Status: Done

Shipped:
- Permanent local reproduction commands for governance CI behavior:
  - `npm run governance:ci-required`
  - `npm run governance:ci-informational`
- Required `check` status now enforces the completed governance inventory only:
  - `npm run governance:check`
  - `npm run test:eslint-rules`
  - `npm run test:governance-tooling`
  - `npm run lint:governance:phase1`
  - `npm run lint:governance:phase2-hotspots`
  - `npm run lint:governance:phase3-searchability`
  - `npm run lint:governance:phase4-policy`
  - `npm run check:runtime-test-impact`
- Broad governance reporting now runs on every `check` execution but remains non-blocking:
  - `npm run lint:governance`
  - `npm run lint:governance:audit`
- Governance audit artifact upload remains in CI without promoting broad warning debt into the required gate
- Required-versus-informational governance split is now documented in the lint-governance docs and GitHub flow runbook

Missing:
- Nothing material for the finalized Phase 5 scope

## Active Tasks
- [ ] `LG-006` Decide the first server/runtime structured-logging rule set so UI noise and observability paths are governed separately.

## Recently Completed
- [x] Completed Phase 5 by making GitHub `check` enforce only the stable completed governance inventory via `governance:ci-required`, keeping broad `lint:governance` plus audit reporting always-run but non-blocking through `governance:ci-informational`, and documenting the final required-versus-informational split without promoting the legacy full-repo lint baseline.
- [x] Completed Phase 4 by shipping permanent `phase4-async`, `phase4-tests`, and `phase4-policy` verifiers, aligning runtime test lint rules and changed-file enforcement to one shared authority with strict one-file waivers, and recording the selective Factory-inspired strictness decisions without pulling Phase 5 CI enforcement forward.
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

## Phase 4 Selective Strictness Decision Matrix

| Candidate rule/policy | Decision | Rationale | Revisit trigger if deferred |
|---|---|---|---|
| Raw UI `fetch()` restrictions | Rejected | Current repo evidence does not show one stable ownership pattern that would make a blanket UI `fetch()` ban low-noise. | N/A |
| Broader `window.location` restrictions beyond navigation mutation | Rejected | The completed Phase 4 async surface only justified `litrev/no-window-location-navigation`; broader location reads/writes would overreach the current evidence. | N/A |
| UI `console.*` restrictions | Deferred | Logging policy needs a separate server/runtime versus UI observability split before repo-wide UI console governance can be made trustworthy. | Revisit when the structured-logging governance track defines the first dedicated logging rule set. |
| Blanket restrictions on `style`, `className`, `useMemo`, or raw anchors | Rejected | These candidates do not currently map to a repo-specific architectural failure mode strong enough to justify new governance rules. | N/A |
