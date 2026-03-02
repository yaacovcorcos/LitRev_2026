# GitHub Flow Runbook

This runbook defines the repository branch, PR, review, and promotion flow.

## Branch Model

- `main`: default branch and production deployment source.
- `second`: integration branch for agent task PRs.
- `codex/<task>`: task branches created from `second`.
- `hotfix/<task>`: emergency branch for direct PRs to `main`.

## PR Routing

- Task delivery path: `codex/<task>` -> `second`.
- Release promotion path: `second` -> `main` (cadence-based PR, daily or manually triggered).
- Hotfix path: `hotfix/<task>` -> `main`.

## Automation Contracts

- Pushes to `codex/**` auto-open or reuse a PR into `second`.
- Daily/manual automation opens or refreshes a release PR from `second` to `main`.
- Auto-created PRs request review from `@yaacovcorcos` and post `@codex review`.

## Review Visibility

Codex and other agents can read review data via GitHub CLI:

```bash
gh pr view <number> --json reviews,comments
gh pr list --state open --json number,title,headRefName,baseRefName,reviewDecision,url
```

## Branch Protection Baseline

- `main`:
  - Require pull request before merge.
  - Require 2 approvals.
  - Require code owner review.
  - Require conversation resolution.
  - Require status check `check`.
  - Block force-push and branch deletion.
- `second`:
  - Require pull request before merge.
  - Require 1 approval.
  - Require conversation resolution.
  - Require status check `check`.
  - Block force-push and branch deletion.

## CI Expectations

- CI runs on pushes and PRs targeting `main` and `second`.
- Schema drift check uses a dedicated shadow database URL in CI.

## Operational Notes

- Keep PR scope narrow and merge frequently into `second`.
- Treat red CI on `second` as release-blocking debt.
- Do not merge `second` to `main` until required checks and approvals pass.
