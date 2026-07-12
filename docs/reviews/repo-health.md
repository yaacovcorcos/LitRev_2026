# Repo Health

Last reviewed: 2026-05-06

This file is the living summary of current repo health. Keep it concise and factual. Replace stale statements instead of appending history.

## Current Critical Findings

- Agent-runtime reliability is materially stronger after the May 2026 closeout and follow-up hardening of idempotency leases, OpenAlex enrichment bounds, and interrupted-tool continuation policy, but live confidence still depends on a fresh `U1.6` burn-in window, broader adversarial eval packs, and production SLO dashboards.

## Regressions Since Last Review

- No repo-contract regression is confirmed from the 2026-03-21 baseline; the raw lint baseline is now clean and promoted into the required CI `check` contract, so the remaining improvement work is about deeper architectural enforcement rather than default-lint debt.
- No agent-runtime regression is confirmed from the May 2026 reliability closeout. The current residual risk is evidence depth: deterministic gates are green, while live burn-in and operational dashboards remain open work.

## Repeated Mistakes

- Repo-root `main` keeps drifting into active-task state unless work is quickly rehomed into `YY/**` task worktrees.
- Effect-driven orchestration keeps appearing in client runtime code despite the repo's explicit effect-discipline policy.
- Repeated review or advisory findings still risk staying in prose too long instead of being promoted into a rule, test, runbook, or owner-plan update.
- Agent-quality improvements still need promotion from deterministic seed coverage into broader fixture packs, adversarial trust-boundary scenarios, and SLO/incident playbooks.

## Open Risks

- Enabling stricter lint rules without a staged cleanup plan will create noise rather than leverage.
- Advisory findings can still linger in prose unless the new internal review loops are used to promote repeated issues into owner docs, tests, evals, or repo-local rules.
- `U1.6` is not yet signed off under a fresh deployment/cohort window, so runtime cleanup work such as `A-002` should remain blocked until burn-in evidence is captured.

## What Improved

- Repo-root `main` was restored to a clean canonical baseline and active work was rehomed into a dedicated task worktree.
- Added a new dated review snapshot at `docs/reviews/2026-04-02-review.md` plus the companion deep-audit report under `docs/reports/`.
- Hardened file-asset project scoping in `next-app/lib/server/files.ts` and added focused service tests for canonical versus adversarial storage paths.
- Added `docs/runbooks/external-pattern-intake.md` so future Factory-style inspirations flow into the correct owner docs instead of becoming parallel policy.
- Restored mobile foundation confidence by aligning Playwright auth bootstrapping with the e2e origin and stabilizing the zero-state to workspace transition helper.
- Targeted lint cleanup slices reduced the default baseline from `126` errors / `112` warnings to `0` errors / `0` warnings on `main`, and raw `npm run lint` is now part of the required CI `check` workflow rather than a side-track cleanup item.
- Added direct regression coverage for `useTimelineWindowing`, provider streamed tool-call delta assembly, conversation attachment/tool-call JSON serialization, and `CommandPalette` hydration/body-scroll behavior so the cleanup wave stays evidence-backed instead of relying on lint-only confidence.
- Closed the known `FIX-011b` agent-runtime code delta: semantic run cancellation is explicit, cancelled terminal truth is durable, long-lineage clarification hydration uses the newest relevant window, optional post-answer failures are degrade-only, and loop budget/repeat/no-answer exits are truthful.
- Added durable `ToolIdempotencyRecord` receipts for mutating tool replay across retry/continuation lineage and first-class `DecisionRequestRecord` / `DecisionResolutionRecord` persistence for `ask_user`.
- Promoted a deterministic agent-quality gate into protected CI through `npm run check:agent-quality`; it now executes the runtime-scenario matrix before validating scenario catalog coverage, runtime-signal fixtures, and the strict U1.6 burn-in contract shape.
- Hardened the follow-up agent-runtime review findings: mutating-tool reservations now recover from executor failure and stale abort/crash leases, OpenAlex Crossref enrichment is bounded and abort-aware, and restartable interrupted tool calls now have typed continuation policy.

## Next Review Inputs

- Most recent dated review in `docs/reviews/`
- `docs/architecture/decision-log.md`
- Relevant plan and runbook docs for any changed subsystem
