# Repo Health

Last reviewed: 2026-04-03

This file is the living summary of current repo health. Keep it concise and factual. Replace stale statements instead of appending history.

## Current Critical Findings

- Architecture intent is still somewhat stronger in docs than in executable enforcement outside the already-shipped governance slices and focused backend/runtime hardening surfaces.

## Regressions Since Last Review

- No repo-contract regression is confirmed from the 2026-03-21 baseline; the raw lint baseline is now clean and promoted into the required CI `check` contract, so the remaining improvement work is about deeper architectural enforcement rather than default-lint debt.

## Repeated Mistakes

- Repo-root `main` keeps drifting into active-task state unless work is quickly rehomed into `YY/**` task worktrees.
- Effect-driven orchestration keeps appearing in client runtime code despite the repo's explicit effect-discipline policy.
- Repeated review or advisory findings still risk staying in prose too long instead of being promoted into a rule, test, runbook, or owner-plan update.

## Open Risks

- Enabling stricter lint rules without a staged cleanup plan will create noise rather than leverage.
- Advisory findings can still linger in prose unless the new internal review loops are used to promote repeated issues into owner docs, tests, evals, or repo-local rules.

## What Improved

- Repo-root `main` was restored to a clean canonical baseline and active work was rehomed into a dedicated task worktree.
- Added a new dated review snapshot at `docs/reviews/2026-04-02-review.md` plus the companion deep-audit report under `docs/reports/`.
- Hardened file-asset project scoping in `next-app/lib/server/files.ts` and added focused service tests for canonical versus adversarial storage paths.
- Added `docs/runbooks/external-pattern-intake.md` so future Factory-style inspirations flow into the correct owner docs instead of becoming parallel policy.
- Restored mobile foundation confidence by aligning Playwright auth bootstrapping with the e2e origin and stabilizing the zero-state to workspace transition helper.
- Targeted lint cleanup slices reduced the default baseline from `126` errors / `112` warnings to `0` errors / `0` warnings on `main`, and raw `npm run lint` is now part of the required CI `check` workflow rather than a side-track cleanup item.
- Added direct regression coverage for `useTimelineWindowing`, provider streamed tool-call delta assembly, conversation attachment/tool-call JSON serialization, and `CommandPalette` hydration/body-scroll behavior so the cleanup wave stays evidence-backed instead of relying on lint-only confidence.

## Next Review Inputs

- Most recent dated review in `docs/reviews/`
- `docs/architecture/decision-log.md`
- Relevant plan and runbook docs for any changed subsystem
