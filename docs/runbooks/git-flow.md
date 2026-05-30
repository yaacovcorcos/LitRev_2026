# Git Flow Runbook

This is the operational contract for LitRev branch, worktree, commit, review, PR, merge, and cleanup behavior.

This file replaces the old GitHub-flow-only framing. The central distinction is:

- Discussion is local.
- Push is delivery.
- PR is review and integration.

Agents must not turn an unfinished discussion into GitHub churn.

## Core Model

| State | Purpose | Commit | Push | PR / CI |
|---|---|---:|---:|---:|
| Read-only analysis | inspect, compare, answer | no | no | no |
| Discussion / draft | shape a plan, policy, design, or review response | optional local only | no | no |
| Delivery | validated change ready for review | yes | yes | yes |
| Remote checkpoint | preserve/handoff incomplete work | only if useful | `draft/<task>` only | no PR by default |
| Emergency hotfix | urgent production/security/deploy fix | yes | yes | yes |

When the user is still discussing, debating, reviewing, or drafting, stay in discussion/draft state unless the user explicitly says to publish, push, open a PR, or make it review-ready.

Current automation is intentionally asymmetric:
- `YY/**` push = delivery path; auto-PR, review request, and protected `check` may run.
- `draft/**` push = checkpoint path; no auto-PR workflow and no protected `check` push trigger.

That means discussion mode is enforceable with the current workflows as long as agents do not push unfinished work to `YY/**`.

## Branch Model

- `main`: canonical baseline and production deployment source.
- `YY/<task>`: normal agent task branch created from `origin/main`.
- `YY/hotfix-<task>`: emergency task branch created from `origin/main`.
- `draft/<task>`: optional remote checkpoint branch for explicit preservation or handoff of unfinished work.

Repo-root `main` is not a task checkout. It exists to mirror `origin/main`, create task worktrees, and inspect read-only baseline state.

Normal task work happens in sibling worktrees under:

```bash
<repo-root>/.worktrees/<task>
```

Never treat a task branch, detached checkout, rescue worktree, or integration branch as the new baseline.

`draft/<task>` branches are not delivery branches. They must not be merged to `main` directly. When a draft becomes delivery-ready, create or update a `YY/<task>` branch from current `origin/main` and carry over only the coherent delivery slice.

## Discussion And Drafting Mode

Discussion mode is the default when the user is still shaping the work.

Use discussion mode for:
- proposed runbooks, plans, policy, architecture, and workflow changes
- reviewing an external suggestion or another agent's review
- comparing alternatives
- drafts likely to be rewritten
- any task where the next useful step is conversation, not CI

Allowed in discussion mode:
- edit files locally in a task worktree
- leave the worktree dirty
- make local WIP commits only when they help preserve or inspect the draft
- run cheap local sanity checks such as `git diff --check`
- summarize the diff and open decisions

Not allowed in discussion mode unless the user explicitly asks:
- push
- open a PR
- update an existing PR
- request remote review
- wait on GitHub CI
- commit merely to satisfy a delivery ritual

Reason: pushing `YY/**` is not a neutral backup action in this repo. It can open or update a PR, request review, trigger CI, and make the user wait on GitHub systems for work that was still a conversation.

If unfinished work genuinely needs remote preservation or handoff, use the remote-checkpoint procedure instead of pushing `YY/**`.

## Delivery Mode

Enter delivery mode only when the work is converged enough for review.

Before delivery:
1. Confirm the branch is no longer being used as an active discussion draft.
2. Ensure the diff is coherent and scoped.
3. Stage only task-relevant files.
4. Run validation proportional to the touched surface.
5. Self-review for correctness, maintainability, and unnecessary complexity.
6. Commit with a conventional commit type.
7. Push and let the PR/review/CI loop begin.

Conventional commit types:
- `feat`
- `fix`
- `refactor`
- `test`
- `chore`
- `docs`

One task normally produces one atomic commit. Use a small coherent series only when it makes review meaningfully clearer.

## Remote Checkpoint Mode

Remote checkpoint mode is for preservation or handoff, not review.

Use it only when local-only discussion mode is insufficient, for example:
- the user explicitly asks to preserve unfinished work remotely
- another agent needs to inspect a partial state before it is delivery-ready
- the local machine/session state is risky enough that remote backup is worth the extra branch

Remote checkpoint branch naming:

```bash
draft/<task>
```

From repo root:

```bash
git fetch origin --prune
git switch main
git pull --ff-only origin main
git worktree add -b draft/<task> .worktrees/draft-<task> origin/main
```

From the draft worktree, after a local WIP commit is useful:

```bash
git push -u origin draft/<task>
```

Rules:
- do not open a PR by default
- do not request `@codex review`
- do not wait for GitHub CI
- state clearly in the handoff that this is not delivery-ready
- never merge `draft/<task>` directly to `main`

If remote review is explicitly needed while incomplete, create a draft PR manually and label the PR body as a checkpoint:

```bash
gh pr create --draft --base main --head draft/<task> --title "draft: <task>" --body "<checkpoint status>"
```

A draft PR may still run pull-request CI. Use it only when remote PR visibility is worth that cost.

To promote a checkpoint to delivery:
1. fetch and sync repo-root `main`
2. create or update `YY/<task>` from current `origin/main`
3. carry over only the coherent delivery slice from `draft/<task>`
4. run delivery validation
5. push `YY/<task>`
6. close/delete/archive the draft branch after the delivery branch no longer depends on it

Draft cleanup commands, when deletion is the right decision:

```bash
git worktree remove .worktrees/draft-<task>
git branch -D draft/<task>
git push origin --delete draft/<task>
```

Use `-D` only after confirming the checkpoint is no longer needed. If the local branch has intentionally unmerged preservation commits that should remain discoverable, archive it explicitly instead of deleting it silently.

## Starting Work

From repo root:

```bash
git fetch origin --prune
git switch main
git pull --ff-only origin main
git status --short --branch
git worktree add -b YY/<task> .worktrees/<task> origin/main
```

Stop before starting if repo-root `main` is detached, dirty, ahead of `origin/main`, or behind `origin/main`.

From the task worktree:

```bash
git status --short --branch
```

Then route by `AGENTS.md`, load required specialist docs, inspect existing behavior, and work locally until the task is ready for delivery.

## Work Size Guide

Use this guide to choose validation and review depth. It does not override `AGENTS.md`.

| Size | Examples | Default handling |
|---|---|---|
| Tiny | typo, small docs clarification | local diff check; push only when delivery-ready |
| Small | focused bug fix, narrow UI correction, test repair | route-required checks, focused tests, normal PR |
| Medium | route behavior, DB/runtime contract, shared component/refactor | implementation thesis, route checks, broader PR-ready checks when practical |
| Large | cross-domain project, multi-agent effort, architecture migration | split into mergeable slices with a coordinator |
| Emergency | production break, deploy blocker, security exposure | minimal reversible branch, urgent PR, follow-up cleanup |

Large work should merge as independent vertical slices when possible. Do not batch a large project into one giant PR unless the change is genuinely inseparable.

## Validation

Run the checks required by `AGENTS.md` for the touched path. When risk is unclear for code changes, the conservative baseline is:

```bash
cd next-app
npm run typecheck
npm run lint
npm run test:vitest
```

Use these canonical local CI aliases in handoffs when relevant:

```bash
cd next-app && npm run test:governance
cd next-app && npm run test:governance:informational
cd next-app && npm run check:agent-quality
cd next-app && npm run check:pr
```

For docs-only discussion drafts, `git diff --check` is usually enough until the draft is ready for delivery.

For production release or database work, follow the release and DB runbooks. Do not simplify those gates inside this file.

## Quality Review

`AGENTS.md` owns the required quality bar: understand real behavior first, optimize for long-term correctness and maintainability, fix root causes, and do not ship knowingly low-quality small fixes unless the user explicitly asks for a temporary stopgap.

This runbook applies that bar during Git flow. Every meaningful code change must pass this operational review lens before delivery and again during PR review:

- Correctness: does the change fix the real failure mode?
- Proof: do checks and tests match the risk?
- Fit: does it follow local architecture, owner docs, primitives, and naming?
- Simplicity: is this the smallest clear design that solves the problem?
- Maintainability: can a future agent understand ownership, control flow, and failure behavior without chat context?
- Boundaries: does it avoid leaking responsibilities across server actions, services, shared logic, route UI, and runtime orchestration?
- Cleanup: did obsolete code/docs disappear, or is deferral explicit?

Treat these as real review findings:
- speculative abstractions without current need
- duplicate or mirrored state
- bypassing shared primitives or owner-documented paths
- broad refactors hidden inside narrow fixes
- new flags/options/configuration not required by the task
- tests that miss user-visible or contract behavior
- comments or docs that describe behavior the code no longer guarantees

Passing CI does not make brittle design acceptable.

## Review Layers

Review is layered:
1. self-review local diff
2. route-required local checks
3. optional local advisory review for risky changes
4. PR review
5. required `check` CI
6. human/code-owner review

Structured autoreview is an experiment, not a merge gate. Use it only when it gives real signal over existing tests, CI, `@codex review`, and human review. Repeated useful findings should become tests, rules, runbooks, or owner-doc updates.

Before merge decisions, inspect latest review state:

```bash
gh pr view <number> --json reviews,comments
gh pr list --state open --json number,title,headRefName,baseRefName,reviewDecision,url
```

## Push And PR Rules

Push only when:
- the user explicitly asked to publish/push, or
- the task has left discussion mode and is ready for delivery, or
- a remote checkpoint is explicitly needed for handoff/preservation.

Do not push when:
- the user is still discussing the idea
- the file is still a draft likely to change
- the branch exists only for exploration
- the next useful step is conversation

Pushes to `YY/**` auto-open or reuse a PR into `main`. Auto-created PRs request review from `@yaacovcorcos` and post `@codex review`. Every non-draft PR open/update should request Codex review once per head commit when the connector is working.

Pushes to `draft/**` are checkpoint pushes. They are not covered by the auto-PR workflow or the protected `check` push trigger. Do not use `draft/**` to hide delivery work from review; promote the coherent slice to `YY/**` when it is ready.

Create PRs non-interactively:

```bash
gh pr create --base main --head YY/<task> --title "<title>" --body "<body>"
```

If `gh pr create` appears to hang, suspect an interactive prompt or editor wait before blaming the GitHub API.

Open a ready PR when:
- the branch has one coherent validated slice
- the PR description explains scope, checks, and remaining risk
- remote CI/review feedback is useful

Use a draft PR only when remote PR visibility is needed before completion. The PR body must say what remains and why CI/review may not yet be final. Prefer a plain `draft/**` branch without PR when the need is only preservation or handoff.

## Branch Protection And CI

Canonical protected-flow sources:
- protected workflow: `.github/workflows/ci.yml`
- auto-PR workflow: `.github/workflows/auto-pr-to-main.yml`
- auto-review workflow: `.github/workflows/codex-auto-review.yml`
- shared testing model: `docs/runbooks/testing-ci-strategy.md`
- governance command inventory: `next-app/package.json` and `docs/plans/plan-lint-governance.md`

Other workflows, such as mobile smoke and performance certification, are intentionally covered by the shared testing model or their owner docs rather than listed here unless they become part of the protected Git flow.

`main` requires:
- pull request before merge
- 2 approvals
- code-owner review
- conversation resolution
- required status check `check`
- no force-push
- no branch deletion

CI publishes required `check` on pushes to `main` and `YY/**`. The `YY/**` push path is required because auto-created PRs rely on push CI as the branch-protection backstop.

Red CI on `main` PRs is release-blocking debt.

Governance exceptions belong in owning phase config, rules, or docs. Do not bypass them through workflow-level path skips, conditional omission, or `continue-on-error`.

Current protected `check` includes:
- Prisma migration deploy against CI Postgres
- shadow database preparation
- schema-drift check
- TypeScript typecheck
- required governance inventory through `npm run governance:ci-required`
- always-run informational governance reporting through `npm run governance:ci-informational`
- governance audit artifact upload with `if: always()`
- chat stream architecture guard
- agent quality gate
- Vitest with `RUN_DB_TESTS=1`
- production `next build`

The exact command list is not duplicated here on purpose. If a workflow, gate, trigger, or blocking posture changes, update the canonical protected-flow sources above and this summary in the same task.

Schema drift note: CI currently allows only the known Prisma-unmodelled `MemoryEmbedding.embedding` pgvector index drift; other drift fails. Treat new drift as DB/governance work, not as a Git-flow exception.

## Multi-Agent Coordination

Every active branch should have an understandable owner and scope.

Once a PR exists, the PR body is the live coordination surface. Before PR creation, use the task thread or a local scratch note. Do not hide critical state in memory another agent cannot discover.

Before resuming a branch:
1. `git fetch origin --prune`
2. confirm repo-root `main` is clean and synced
3. inspect open PRs touching the same domain
4. inspect local worktrees
5. confirm the branch is still the intended execution surface

If two agents need the same files, choose one owner for those files. Split by ownership boundary when possible; otherwise serialize the work and rebase from `origin/main` after the first PR lands.

Allowed only with explicit justification:
- temporary integration branch for a tightly coupled sequence

Not allowed:
- treating an integration branch as canonical baseline
- merging unrelated task branches into each other just to avoid rebasing
- leaving stale finished worktrees as passive history

Handoffs should include:
- branch/worktree path
- current commit or dirty status
- last checks run and result
- open blockers
- whether a PR exists
- unresolved review findings
- files intentionally left untouched because they are user-owned or owned by another branch

## Merge And Cleanup

A task is not complete at PR creation.

Before merge:
1. required checks are green
2. required review and code-owner state is satisfied
3. conversations are resolved
4. latest feedback has been inspected
5. final diff remains scoped

After merge, from repo root:

```bash
git fetch origin --prune
git switch main
git pull --ff-only origin main
git worktree remove .worktrees/<task>
git branch -d YY/<task>
git status --short --branch
```

Do not leave merged PRs, merged worktrees, or merged local branches behind for later cleanup.

## Cleanup Manifest

Before deleting or re-homing any worktree, record a cleanup manifest entry.

Preferred storage:
- PR body or PR comment when a PR exists
- local scratch note when no PR exists

Each entry must include:
- worktree path
- branch name or detached HEAD SHA
- status: `active`, `rescue`, `stale`, or `unknown`
- decision: `keep`, `rehome`, `review`, or `delete`
- short reason

If a task is abandoned, remove the worktree and either delete the branch or intentionally archive it. If a rescue worktree exists, promote it, archive it, or delete it after review.

Do not remove a parent worktree directory while it contains active nested child worktrees.

## GitHub CLI Auth

Do not infer GitHub access from `GH_TOKEN`.

Before declaring GitHub unavailable, verify:

```bash
gh auth status
gh auth token
gh api user
```

GitHub CLI auth may come from the local keyring rather than shell environment variables.

## Emergency Hotfixes

Use `YY/hotfix-<task>`.

Hotfix rules:
- keep the change minimal and reversible
- run the narrowest credible validation plus required release/DB/security gates
- open a PR to `main`
- request immediate human review
- after merge, create a follow-up issue or plan entry if the hotfix leaves deeper cleanup

Do not use emergency flow to bypass normal quality review for non-emergencies.
