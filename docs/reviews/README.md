# Repo Review System

This directory stores repeatable repo-wide review artifacts so deep analysis can compare the current state against prior findings instead of relying on chat memory.

## Files

- `repo-health.md` - Living summary of the current top-level repo health, open risks, repeated mistakes, and recent improvements.
- `review-template.md` - Template for each dated deep review snapshot.
- `YYYY-MM-DD-review.md` - Point-in-time deep review files created during full reruns.

## Operating Rules

1. Keep `repo-health.md` current truth only. It is not a diary.
2. Create a new dated review file for each deep rerun that materially reevaluates the repo.
3. Update `repo-health.md` from the latest dated review after findings are validated.
4. Call out regressions explicitly against the prior dated review and against `repo-health.md`.
5. Record repeated mistakes as patterns, not just isolated incidents.
6. If a finding is actually an intentional tradeoff, capture that in `docs/architecture/decision-log.md`.

## Review Categories

Use the same sections each time so comparisons stay meaningful:

- Correctness and regressions
- Architecture drift
- Database and migration safety
- Auth and permissions
- UI behavior regressions
- Test coverage gaps
- Dead code and duplication
- Docs drift
- Deployment and operational risk

## Minimum Rerun Workflow

1. Read `repo-health.md`.
2. Read the most recent dated review in this directory if one exists.
3. Read `docs/architecture/decision-log.md`.
4. Run the relevant repo validation commands for changed domains.
5. Produce a new dated review from `review-template.md`.
6. Fold validated findings into `repo-health.md`.
