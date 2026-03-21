# Repo Health

Last reviewed: 2026-03-21

This file is the living summary of current repo health. Keep it concise and factual. Replace stale statements instead of appending history.

## Current Critical Findings

- Lint is not currently part of the required CI merge gate, even though `next-app/package.json` defines a lint command and repo governance increasingly depends on machine-enforced rules.
- The current local lint baseline is deeply red: `npm run lint` on 2026-03-21 reported 523 errors and 591 warnings.
- Architecture intent is much stronger in `AGENTS.md` than in executable lint/guard rules, especially around effect discipline, searchability conventions, and logging/error patterns.

## Regressions Since Last Review

- No prior dated review existed, so a regression delta is not yet available.

## Repeated Mistakes

- Effect-driven orchestration keeps appearing in client runtime code despite the repo's explicit effect-discipline policy.
- Import/export conventions are inconsistent enough to reduce deterministic search and refactorability for agents.
- Raw console logging is still common across layers, including places where more structured error handling already exists.

## Open Risks

- Enabling stricter lint rules without a staged cleanup plan will create noise rather than leverage.
- Leaving lint outside CI means future agent-written code can continue to drift from repo architecture even when tests and typecheck pass.
- Test coverage is broad, but test placement rules are not deterministic enough for agents to infer automatically in all domains.

## What Improved

- Added a durable review system under `docs/reviews/` so future deep analyses can compare current state against prior findings.
- Added `docs/architecture/decision-log.md` so intentional tradeoffs can be separated from accidental drift.
- Added the first dated deep review snapshot at `docs/reviews/2026-03-21-review.md`, establishing a lint-governance baseline with concrete enforcement priorities.
- Added `docs/reviews/2026-03-21-factory-eslint-plugin-benchmark.md`, capturing what LitRev should and should not borrow from Factory's custom ESLint approach.

## Next Review Inputs

- Most recent dated review in `docs/reviews/`
- `docs/architecture/decision-log.md`
- Relevant plan and runbook docs for any changed subsystem
