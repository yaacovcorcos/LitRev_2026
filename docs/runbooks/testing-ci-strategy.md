# Testing and CI Strategy Runbook

## Scope
This runbook defines LitRev's shared testing and CI operating model.

It covers:
- shared local-before-push expectations for cross-cutting lanes
- the current lane taxonomy and what each lane is meant to prove
- local reproduction guidance for shared CI and smoke lanes
- first-owner triage for shared lane failures
- changed-scope and lane-promotion rules

It does not replace:
- `AGENTS.md` for route-specific mandatory validation
- `docs/agents/testing-agent-contract.md` for test-design doctrine and regression-proof expectations
- subsystem runbooks and plans for domain-specific certification or rollout policy

## Operating Contract

1. Start with routing.
   - `AGENTS.md` is the canonical local validation contract for changed paths.
   - This runbook only explains the shared cross-cutting execution model.

2. Keep test design and execution separate.
   - `docs/agents/testing-agent-contract.md` decides the right test layer and regression-proof shape.
   - This runbook decides which shared lane to run, how to reproduce it, and who owns it first.

3. Keep required lanes conservative.
   - Shared required lanes should prove broad repo health, not replace targeted regression tests in touched code.
   - Green shared lanes never justify skipping the smallest truthful regression test for a real behavior change.

4. Use changed-scope execution sparingly.
   - Full execution remains the default for correctness-critical lanes.
   - Changed-scope optimization is allowed only for expensive, stable lanes with clear ownership and low false-negative risk.

5. Update docs when lane truth changes.
   - If a lane's trigger, command, blocking posture, or owner changes materially, update this runbook, `docs/plans/plan-testing-execution.md`, and the relevant owner doc in the same task.

## Canonical Shared Commands

Use the canonical shared aliases in `next-app/package.json` when referring to cross-cutting testing lanes in docs, reviews, and handoffs.

- `npm run typecheck`
  - canonical local typecheck entrypoint
- `npm run test:vitest`
  - canonical full Vitest regression lane
- `npm run test:governance`
  - canonical required governance lane (`governance:ci-required`)
- `npm run test:governance:informational`
  - canonical non-blocking governance reporting lane (`governance:ci-informational`)
- `npm run test:e2e:foundation`
  - canonical high-signal browser foundation lane
- `npm run test:e2e:local`
  - canonical broader local Playwright lane
- `npm run test:smoke:mobile`
  - canonical broader mobile smoke lane
- `npm run test:smoke:citation`
  - canonical citation-provider compatibility smoke lane
- `npm run check:chat-stream-architecture`
  - canonical local reproduction for the shared architecture guard in `check`
- `npm run check:agent-quality`
  - canonical deterministic agent eval, runtime-signal fixture, and burn-in contract gate in `check`
- `npm run check:pr`
  - canonical local reproduction for the shared non-database portion of the protected `check` workflow

Historical script names remain valid for compatibility, but new docs and reviews should prefer the canonical aliases above.

The repo does not yet expose canonical `test:unit` or `test:integration` commands.
That split remains intentionally deferred until the Vitest corpus has a truthful, maintainable boundary for those labels.

## Shared Lane Taxonomy

- `route-required local validation`
  - The mandatory local checks defined by `AGENTS.md` for the touched subsystem.
- `required CI`
  - A branch-protection-backed merge gate that must stay truthful, conservative, and reproducible.
- `informational CI`
  - Always-run reporting that should stay visible but must not silently become a merge blocker.
- `foundation lane`
  - A narrow, high-signal route or journey proof for historically fragile user-facing behavior.
- `smoke lane`
  - A fast confidence or compatibility check that helps triage risk but is not a full correctness proof.
- `scheduled or main-only certification`
  - A heavier lane that produces artifacts or broader evidence outside the normal PR merge gate.
- `local diagnostic`
  - An opt-in readiness or diagnosis flow that helps debug the environment or a subsystem without becoming CI policy.

## Local Before Push

For code changes:

1. Run the route-specific mandatory checks from `AGENTS.md`.
2. Add shared lanes when the touched surface intersects them:
   - governance inventory, shared CI contract, or workflow truth:
    - `cd next-app && npm run test:governance`
   - governance reporting or audit reproduction:
    - `cd next-app && npm run test:governance:informational`
   - responsive/mobile certification surfaces or Playwright contract changes:
    - `cd next-app && npm run test:e2e:foundation`
   - broader mobile-sensitive flows beyond the narrow foundation routes:
    - `cd next-app && npm run test:smoke:mobile`
   - citation-provider changes or provider drift triage:
    - `cd next-app && npm run test:smoke:citation`
   - agent eval catalog, runtime fixture, or burn-in contract changes:
    - `cd next-app && npm run check:agent-quality`
3. If the change spans multiple domains and the safest shared baseline is not obvious, use the conservative fallback:
   - `cd next-app && npm run typecheck`
   - `cd next-app && npm run lint`
   - `cd next-app && npm run test:vitest`

For docs-only plan or runbook changes:

- No code gate is required unless the doc changes executable workflow truth and you need local confirmation for that specific contract.

## Current Shared Lane Inventory

### CI / check

- Local reproduction:
  - `cd next-app && npm run typecheck`
  - `cd next-app && npm run test:governance`
  - `cd next-app && npm run check:chat-stream-architecture`
  - `cd next-app && npm run check:agent-quality`
  - `cd next-app && npm run test:vitest`
  - `cd next-app && npx next build`
- CI-only pieces:
  - Prisma migrate deploy
  - shadow-database preparation
  - schema-drift check
- Trigger:
  - pushes to `main`
  - pushes to `YY/**`
  - pull requests to `main`
- Blocking posture:
  - required branch-protection gate
- First-owner triage:
  - migrate or drift failure -> DB owner docs
  - governance failure -> lint-governance owner docs
  - chat stream architecture guard -> agent-runtime owner docs
  - agent quality gate -> agent-quality owner docs
  - Vitest, typecheck, or build failure -> the canonical owner for the changed subsystem

### Governance Informational Reporting

- Local reproduction:
  - `cd next-app && npm run test:governance:informational`
- Automation:
  - always runs inside `CI / check` with `continue-on-error`
- Blocking posture:
  - non-blocking
- First owner:
  - `docs/plans/plan-lint-governance.md`
- Evidence:
  - `governance-audit.json` uploaded from CI

### Mobile Foundation / mobile-foundation

- Local reproduction:
  - `cd next-app && npm run test:e2e:foundation`
- Automation:
  - `.github/workflows/mobile-smoke.yml`
  - runs on `main`
  - runs on pull requests that touch the mobile-sensitive path filter in that workflow
- Blocking posture:
  - separate CI lane, not the protected `check` gate
- First owner:
  - responsive/mobile surfaces via `docs/runbooks/responsive-foundation-certification.md`
- Failure inspection:
  - GitHub job log and annotations first
  - local rerun for deeper Playwright diagnosis
  - current CI does not upload a dedicated Playwright artifact; if a broader browser lane is added later, artifact expectations must ship in the same task

### Broader Mobile Smoke

- Local reproduction:
  - `cd next-app && npm run test:smoke:mobile`
- Automation:
  - none currently
- Blocking posture:
  - non-blocking
- First owner:
  - responsive/mobile surfaces
- Use when:
  - a change affects broader mobile-sensitive behavior beyond the narrow foundation certification routes

### Performance Certification

- Local reproduction:
  - follow `docs/plans/plan-speed-performance.md`
  - there is no single lightweight local parity command for the full nightly lane
- Automation:
  - `.github/workflows/perf-nightly.yml`
  - `.github/workflows/perf-nightly-report.yml`
- Trigger:
  - `main`
  - schedule
  - manual dispatch
- Blocking posture:
  - not a PR merge gate
- First owner:
  - `docs/plans/plan-speed-performance.md`
- Evidence:
  - uploaded nightly performance JSON artifact

### Citation Provider Smoke

- Local reproduction:
  - `cd next-app && npm run test:smoke:citation`
- Automation:
  - none currently
- Blocking posture:
  - non-blocking
- First owner:
  - citation/provider surfaces via `docs/runbooks/citation-preview-ops.md`
- Purpose:
  - compatibility smoke for provider stability, not a correctness proof for exact counts

## What Required `check` Guarantees

`CI / check` guarantees:

- CI database migration and schema-drift sanity
- full repo typecheck
- required governance inventory, including raw `npm run lint`
- informational governance reporting visibility
- chat stream architecture guard
- deterministic agent quality gate over eval scenarios, stream fixtures, and burn-in thresholds
- full `npm run test:vitest`
- production `next build`

`CI / check` does not guarantee:

- Playwright coverage for every browser or responsive flow
- the broader mobile smoke lane
- scheduled performance certification
- canary or burn-in signoff
- manual UX quality judgment
- optional provider compatibility smokes

## Failure Triage Quick Map

| Failure surface | First owner | Canonical docs |
|---|---|---|
| migrate deploy or schema drift | DB owner | `docs/runbooks/db-ops.md`, `docs/runbooks/db-architecture.md` |
| governance required or informational | lint governance owner | `docs/plans/plan-lint-governance.md` |
| chat stream architecture guard | agent-runtime owner | `docs/plans/plan-agentic.md`, `docs/plans/plan-agent-quality.md` |
| agent quality gate | agent-quality owner | `docs/plans/plan-agent-quality.md`, `docs/runbooks/chat-runtime-burn-in.md` |
| mobile foundation | responsive/mobile owner | `docs/runbooks/responsive-foundation-certification.md`, `docs/runbooks/browser-tooling-readiness.md` |
| performance certification | performance owner | `docs/plans/plan-speed-performance.md` |
| citation compatibility smoke | citation/provider owner | `docs/runbooks/citation-preview-ops.md` |
| general Vitest, typecheck, or build failure | touched subsystem owner | `AGENTS.md`, `docs/plans/README.md`, `docs/agents/cold-memory-index.md` |

## Changed-Scope Policy

- Full execution remains the default for correctness-critical lanes.
- Changed-scope execution is currently allowed only in narrow, explicit places:
  - workflow path filtering for the mobile foundation lane
  - governed runtime test-impact enforcement through `check-runtime-test-impact`
- Changed-scope execution is not allowed for:
  - `CI / check`
  - raw `npm run lint`
  - full `npm run test:vitest`
  - `npm run typecheck`
  - `npx next build`

Any new changed-scope optimization must ship with:

- a clear first owner
- a local reproduction command
- an explicit explanation of false-negative risk
- updates to this runbook and `docs/plans/plan-testing-execution.md`
- any owner-plan or owner-runbook updates needed for the touched subsystem

## Cross-Cutting Smoke and Foundation Inventory

The shared smoke inventory is intentionally small.
Today it contains only:

- `test:e2e:foundation`
  - narrow browser route-certification for home, auth, project shell, protocol, and `/ai` entry smoke
- `test:smoke:mobile`
  - broader local-only mobile-sensitive smoke beyond the narrow foundation routes
- `test:smoke:citation`
  - provider compatibility smoke after citation-provider changes or incidents

Do not add a new shared smoke lane unless it names:

- the protected user journey or compatibility boundary
- when it should run
- how it is reproduced locally
- what output or artifact is inspected when it fails
- why it is not a better fit for a lower test layer or a domain-owned runbook

## Promotion and Update Rules

A shared lane may move into protected CI only when the same task updates:

- the workflow that runs it
- the local reproduction command
- this runbook
- `docs/plans/plan-testing-execution.md`
- the owning plan or runbook for the lane's subsystem

When lane inventory, baseline posture, or required-check scope changes materially:

- update this runbook
- update `docs/plans/plan-testing-execution.md`
- update any subsystem runbook that describes the same lane
- update `docs/reviews/repo-health.md` if the shared repo-health summary changed materially
- store bulky evidence in a dated review or report instead of turning plans into diaries

Wrapper commands or alias layers should be added only after the underlying lane inventory is stable enough to justify a second ergonomic entrypoint.
