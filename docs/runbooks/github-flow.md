# GitHub Flow Runbook

This runbook defines the repository branch, PR, review, and promotion flow.

## Branch Model

- `main`: default branch and production deployment source.
- `YY/<task>`: canonical agent task branches created from `main`.
- `YY/hotfix-<task>`: emergency branch for direct PRs to `main`.

## PR Routing

- Task delivery path: `YY/<task>` -> `main`.
- Hotfix path: `YY/hotfix-<task>` -> `main`.

## Automation Contracts

- Pushes to `YY/**` auto-open or reuse a PR into `main`.
- Auto-created PRs request review from `@yaacovcorcos` and post `@codex review`.
- Every non-draft PR open/update requests Codex review automatically (`@codex review`) once per head commit.

## Review Visibility

Codex and other agents can read review data via GitHub CLI:

```bash
gh pr view <number> --json reviews,comments
gh pr list --state open --json number,title,headRefName,baseRefName,reviewDecision,url
```

## GitHub CLI Guardrails

- Do not use `GH_TOKEN` presence or absence as the GitHub auth check.
- GitHub CLI auth in this environment may come from the local keyring rather than shell env vars.
- Before escalating GitHub auth problems, verify `gh auth status`, `gh auth token`, and `gh api user`.
- PR creation in agent flows must be non-interactive:
  - `gh pr create --base main --head YY/<task> --title "<title>" --body "<body>"`
- If `gh pr create` appears to hang, first assume it is waiting for interactive input unless the auth verification commands fail.

## Branch Protection Baseline

- `main`:
  - Require pull request before merge.
  - Require 2 approvals.
  - Require code owner review.
  - Require conversation resolution.
  - Require status check `check`.
  - Block force-push and branch deletion.

## CI Expectations

- CI publishes the required `check` status on pushes to `main` and `YY/**`.
- CI also runs on PRs targeting `main` when the PR event itself triggers workflows normally.
- `YY/**` push CI is the branch-protection backstop for auto-created PRs, so the required `check` must not depend only on the PR event path.
- Raw repo lint is now a required part of `check`:
  - `npm run lint`
- The required governance portion of `check` is reproduced locally by `cd next-app && npm run test:governance`.
- The informational governance reporting portion of `check` is reproduced locally by `cd next-app && npm run test:governance:informational`.
- `governance:ci-required` is the frozen phase-owned governance inventory:
  - `npm run governance:check`
  - `npm run lint`
  - `npm run test:eslint-rules`
  - `npm run test:governance-tooling`
  - `npm run lint:governance:phase1`
  - `npm run lint:governance:phase2-hotspots`
  - `npm run lint:governance:phase3-searchability`
  - `npm run lint:governance:phase4-policy`
  - `npm run lint:governance:logging`
  - `npm run check:runtime-test-impact`
- `governance:ci-informational` always runs broad governance lint and the governance audit on every `check` execution, but it remains non-blocking.
- Prefer the canonical aliases in handoffs and local instructions:
  - `npm run test:governance`
  - `npm run test:governance:informational`
  - `npm run check:pr`
- Governance audit artifact upload should remain `if: always()`.
- Required governance exceptions must be made in the owning phase config/rule/docs, not by workflow-level `continue-on-error`, path skips, or conditional omission.
- Schema drift check uses a dedicated shadow database URL in CI.
- Drift output is currently warning-mode (non-empty diff warns; command errors fail) until migration history is realigned.

## Operational Notes

- Rule: feature branches hold work; repo root `main` only mirrors merged work.
- Repo root `main` is the only canonical baseline; task worktrees may use other branches temporarily, but they must never be treated as the baseline or replace repo root `main`.
- Repo root checkout is the canonical clean `main`.
- Keep repo root `main` exactly in sync with `origin/main`.
- If repo root is detached, dirty, ahead, or behind `origin/main`, stop and reconcile before starting new work.
- Never use repo root as a task checkout, PR checkout, or scratch branch checkout.
- Never run `gh pr checkout <number>` in repo root; create or use a task worktree for PR inspection or updates.
- Use repo root `main` for read-only work; enter a task worktree only for branch-specific execution such as edits, commits, pushes, rebases, or PR branch updates.
- Detached or rescue worktrees are never the `main` baseline.
- Task worktrees are temporary by default and should exist only while a task is being actively implemented, reviewed, or waiting to merge.
- Before resuming an existing task worktree, `git fetch origin --prune` and confirm it is still the intended execution surface against current `origin/main`.
- Create task worktrees from repo root using `YY/<task>` branches.
- After merge, fast-forward repo root `main`, then remove the merged task worktree and delete the merged branch in the same cleanup flow.
- If a task is abandoned, remove its worktree and either delete the branch or archive it intentionally.
- Maintain a cleanup manifest before deleting or re-homing worktrees.
- Do not remove a parent worktree directory while it still contains active nested child worktrees.
- Keep PR scope narrow and merge frequently into `main`.
- A task is not complete at PR creation. Monitor the PR until it is mergeable, merge it, then run the full post-merge cleanup sequence immediately.
- Treat red CI on `main` PRs as release-blocking debt.

## Cleanup Manifest Contract

Before deleting or re-homing any worktree, record a cleanup manifest entry.

Preferred storage:
- if a PR exists, add the manifest entry to the PR body or a PR comment
- if no PR exists, record it in a local scratch note before deletion

Each manifest entry must include:
- worktree path
- branch name or detached HEAD SHA
- status: `active`, `rescue`, `stale`, or `unknown`
- decision: `keep`, `rehome`, `review`, or `delete`
- short reason for the decision

## Standard Flow

From repo root:

1. `git fetch origin --prune`
2. `git switch main`
3. `git pull --ff-only origin main`
4. `git worktree add -b YY/<task> .worktrees/<task> origin/main`

Notes:
- Repo root is the canonical `main` checkout.
- Repo root is not a task worktree and should remain on `main`.
- Task worktrees should be created as siblings under `<repo-root>/.worktrees/`.

From the task worktree:

1. implement and validate
2. `git commit`
3. `git push -u origin YY/<task>`
4. open PR to `main` with explicit non-interactive `gh pr create` flags

Notes:
- Normal task branches use `YY/<task>`.
- Emergency branches use `YY/hotfix-<task>`.

PR closeout flow:

1. monitor the PR until it is mergeable:
   - required checks are green
   - required review/conversation state is satisfied
   - latest review feedback has been inspected with `gh pr view <number> --json reviews,comments`
2. merge the PR to `main`
3. from repo root:
   - `git fetch origin --prune`
   - `git switch main`
   - `git pull --ff-only origin main`
   - `git worktree remove .worktrees/<task>`
   - `git branch -d YY/<task>`
4. confirm repo root `main` is clean and matches `origin/main`

Required cleanup rule:
- steps 1-4 above are one closeout sequence; do not leave merged PRs, merged task worktrees, or merged local branches behind for later cleanup.

Abandoned task:

1. confirm the worktree is no longer needed
2. `git worktree remove .worktrees/<task>`
3. either `git branch -d YY/<task>` or rename/archive the branch intentionally
