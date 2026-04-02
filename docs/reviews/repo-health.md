# Repo Health

Last reviewed: 2026-04-02

This file is the living summary of current repo health. Keep it concise and factual. Replace stale statements instead of appending history.

## Current Critical Findings

- Raw `npm run lint` is still outside the required CI `check` contract and remains too red to promote safely; the 2026-04-02 baseline is improved but still failing at `126` errors and `112` warnings.
- Mobile foundation e2e is currently blocked by `/api/dev/quick-login` returning HTTP 500 in local validation, so that suite is not yet a clean confidence signal for unrelated UI changes.
- Architecture intent is still somewhat stronger in docs than in executable enforcement outside the already-shipped governance slices and focused backend/runtime hardening surfaces.

## Regressions Since Last Review

- No repo-contract regression is confirmed from the 2026-03-21 baseline; the main open blockers are still baseline cleanup and local test-environment reliability.

## Repeated Mistakes

- Repo-root `main` keeps drifting into active-task state unless work is quickly rehomed into `YY/**` task worktrees.
- Effect-driven orchestration keeps appearing in client runtime code despite the repo's explicit effect-discipline policy.
- Repeated review or advisory findings still risk staying in prose too long instead of being promoted into a rule, test, runbook, or owner-plan update.

## Open Risks

- Enabling stricter lint rules without a staged cleanup plan will create noise rather than leverage.
- Leaving raw lint outside the protected `check` contract for too long means future agent-written code can still drift in unguided surfaces even when tests and typecheck pass.
- Mobile foundation regressions can hide behind a broken local quick-login/bootstrap path until that helper surface is stabilized.

## What Improved

- Repo-root `main` was restored to a clean canonical baseline and active work was rehomed into a dedicated task worktree.
- Added a new dated review snapshot at `docs/reviews/2026-04-02-review.md` plus the companion deep-audit report under `docs/reports/`.
- Hardened file-asset project scoping in `next-app/lib/server/files.ts` and added focused service tests for canonical versus adversarial storage paths.
- Added `docs/runbooks/external-pattern-intake.md` so future Factory-style inspirations flow into the correct owner docs instead of becoming parallel policy.

## Next Review Inputs

- Most recent dated review in `docs/reviews/`
- `docs/architecture/decision-log.md`
- Relevant plan and runbook docs for any changed subsystem
