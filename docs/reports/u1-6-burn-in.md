# U1.6 Burn-In Report

Status: `no_active_window`
Last reviewed: `2026-05-06`

This file is the single live status and eventual sign-off record for U1.6.
It is intentionally short until a new deployment-level burn-in window is opened.

## Current Truth

- No U1.6 burn-in window is currently sign-offable.
- The old March and April windows are historical only.
- The known `A-001` / `FIX-011b` code delta is closed on `main` and covered by deterministic tests.
- A fresh deployment/cohort window is still required before runtime sign-off.
- `A-002` / `U4` cleanup remains blocked until U1.6 sign-off evidence exists.

## Required Inputs For The Next Window

- `CANARY_DEPLOY_SHA`
- `CANARY_DEPLOYMENT_URL`
- `CANARY_SINCE_UTC`
- `CANARY_WORKSPACE_IDS` and/or `CANARY_USER_IDS`
- sign-off owner
- backup reviewer
- Day-0 manual baseline scenario pack
- preserved raw validator JSON

## Historical Artifacts

- Dated April probe artifact: `docs/reports/u1-6-burn-in-2026-04-05.md`
- Template for the next full report: `docs/reports/u1-6-burn-in-template.md`
- March Day-0 raw validator JSON was not preserved and remains informational only.

## Canonical Sources

- Runbook: `docs/runbooks/chat-runtime-burn-in.md`
- Runtime plan: `docs/plans/plan-agentic.md`
- Quality/sign-off plan: `docs/plans/plan-agent-quality.md`
- Runtime closeout review: `docs/reviews/2026-05-06-agent-runtime-reliability-closeout.md`

## Current Decision

- Burn-in started: `no`
- Current window sign-offable: `no`
- Day-0 gate passed: `no`
- Burn-in pass: `no`
- `A-002` / `U4` cleanup unlocked: `no`

## Next Required Step

Open a fresh deployment-level U1.6 window from current production truth, then run Phase 0 from `docs/runbooks/chat-runtime-burn-in.md` and preserve the validator output.
