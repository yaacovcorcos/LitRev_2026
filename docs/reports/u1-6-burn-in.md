# U1.6 Burn-In Report

Status: `pending_canary_start`
Last reviewed: `2026-03-06`

This file is the live status and eventual sign-off record for U1.6.
No valid production burn-in window is recorded in-repo yet, so there is no canary evidence to sign off.

## Current Status

- Production canary start timestamp (`CANARY_SINCE_UTC`) has not been captured.
- No production deploy SHA or deployment URL/id has been recorded for the burn-in window.
- No scoped cohort (`workspaceIds` and/or `userIds`) has been recorded in-repo.
- No Day-0 validator output has been captured in-repo.
- `U1.6` remains incomplete and `U3` popup migration stays blocked.

## Canonical Sources

- Runbook: `docs/runbooks/chat-unification-burn-in.md`
- Report template: `docs/reports/u1-6-burn-in-template.md`
- Plan: `docs/plans/plan-chat-unification-v2.md`

## Evidence Required Before Day 0 Opens

- Sign-off owner and backup reviewer
- Production `main` commit SHA
- Production deployment URL or id
- Exact `CANARY_SINCE_UTC`
- Scoped cohort (`workspaceIds` and/or `userIds`)
- Day-0 validator command output with run-end coverage results

## Current Decision

- Burn-in started: `no`
- Burn-in pass: `no`
- `U3` popup migration unlocked: `no`

## When Canary Starts

1. Capture the production deploy SHA, deployment URL/id, owner, reviewer, cohort, and exact `CANARY_SINCE_UTC`.
2. Run the Day-0 gate from `docs/runbooks/chat-unification-burn-in.md`.
3. Replace this pending-status content with the real dated evidence log using `docs/reports/u1-6-burn-in-template.md`.
