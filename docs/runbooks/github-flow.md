# GitHub Flow Runbook

This runbook defines the repository branch, PR, review, and promotion flow.

## Branch Model

- `main`: default branch and production deployment source.
- `codex/<task>`: task branches created from `main`.
- `hotfix/<task>`: emergency branch for direct PRs to `main`.

## PR Routing

- Task delivery path: `codex/<task>` -> `main`.
- Hotfix path: `hotfix/<task>` -> `main`.

## Automation Contracts

- Pushes to `codex/**` auto-open or reuse a PR into `main`.
- Auto-created PRs request review from `@yaacovcorcos` and post `@codex review`.
- Every non-draft PR open/update requests Codex review automatically (`@codex review`) once per head commit.

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

## CI Expectations

- CI runs on pushes and PRs targeting `main`.
- Schema drift check uses a dedicated shadow database URL in CI.
- Drift output is currently warning-mode (non-empty diff warns; command errors fail) until migration history is realigned.

## Operational Notes

- Keep PR scope narrow and merge frequently into `main`.
- Treat red CI on `main` PRs as release-blocking debt.
