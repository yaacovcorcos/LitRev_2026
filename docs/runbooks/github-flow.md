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

- Rule: feature branches hold work; local `main` only mirrors merged work.
- Maintain one designated clean `main` worktree.
- Preferred path for new setups is `.worktrees/main`; if an existing clean `main` worktree is already designated for this repo, reuse it instead of creating another one.
- Do not use the clean `main` worktree for normal implementation edits.
- Keep the designated local `main` worktree exactly in sync with `origin/main`.
- If local `main` is ahead of or behind `origin/main`, reconcile before starting new work.
- If the current checkout is detached, dirty, or `main` is checked out in another worktree, do not blindly run `git switch main`; reconcile worktree ownership first.
- Create task worktrees from the clean `main` worktree using `codex/<task>` branches.
- After merge, fast-forward the clean `main` worktree, then remove the merged task worktree and delete the merged branch.
- Keep PR scope narrow and merge frequently into `main`.
- Treat red CI on `main` PRs as release-blocking debt.

## Standard Flow

From the clean `main` worktree:

1. `git fetch origin --prune`
2. `git pull --ff-only origin main`
3. `git -C <repo-root> worktree add -b codex/<task> .worktrees/<task> origin/main`

Note: `<repo-root>` is the repository root. This keeps task worktrees under `<repo-root>/.worktrees/` instead of nesting them under the clean `main` worktree.

From the task worktree:

1. implement and validate
2. `git commit`
3. `git push -u origin <branch>`
4. open PR to `main`

Notes:
- Normal task branches use `codex/<task>`.
- Emergency branches use `hotfix/<task>`.

After merge:

1. `git -C <main-worktree> fetch origin --prune`
2. `git -C <main-worktree> pull --ff-only origin main`
3. `git -C <repo-root> worktree remove .worktrees/<task>`
4. `git -C <main-worktree> branch -d <branch>`
