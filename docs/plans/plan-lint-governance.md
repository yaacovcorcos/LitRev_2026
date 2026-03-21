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
- `next-app/scripts/lint-governance-audit.mjs` is the authoritative baseline generator for governance metrics; prose counts in review docs are advisory snapshots only.
- Governance-specific commands are now separate from the legacy lint baseline:
  - `npm run lint:governance`
  - `npm run lint:governance:audit`
  - `npm run test:eslint-rules`
- CI now runs governance rule tests and governance lint independently before the full-repo lint baseline becomes a required gate.

## Active Tasks
- [ ] `LG-001` Reduce warning-only governance debt in effect hot spots and import searchability rules until `lint:governance` is low-noise enough for stricter severities.
- [ ] `LG-002` Tighten semantic effect-discipline rules after the current `/ai`, copilot, and project-layout cleanup wave stabilizes.
- [ ] `LG-003` Decide the first server/runtime structured-logging rule set so UI noise and observability paths are governed separately.
- [ ] `LG-004` Expand runtime test-expectation enforcement from changed-file CI coverage into clearer narrow-domain lint rules where repo structure supports it.
- [ ] `LG-005` Re-audit the repo before adopting any additional Factory-inspired frontend restrictions beyond the current adapted set.

## Recently Completed
- [x] Established the repo-local lint-governance framework, audit script, dedicated governance commands, and initial layered config wiring.
- [x] Added first-wave governance rules for default exports, `catch(console.error)`, log-and-throw duplication, hot-spot effect suppressions, parent-directory imports, filename/searchability, async-chain warnings, and direct browser-location navigation.
- [x] Added the changed-files runtime test-impact script and CI wiring for governance rule tests and governance lint.

## Implementation Rules
- Treat `lint-governance-audit.mjs` as the authoritative source for governance counts.
- Pair rule rollout with code cleanup in the same task whenever the rule is intended to become actionable.
- Keep effect-discipline rollout split into mechanical and semantic waves.
- Do not promote the full `npm run lint` baseline to required CI until the broader repo baseline is intentionally cleaned or waived.
