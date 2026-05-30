# Agent Git Flow Plan

## Status

This is a candidate plan, not the active Git policy.

The active operational contract remains [`docs/runbooks/github-flow.md`](../runbooks/github-flow.md) until this plan is explicitly promoted into runbook or `AGENTS.md` changes. Agents must continue following the current runbook while using this file only as design guidance.

## Purpose

Design the next LitRev-specific Git flow for agent work.

The flow must answer:
- how agents start work without dirtying repo-root `main`
- what happens after each small fix
- how larger changes are sliced, reviewed, pushed, and merged
- when PRs should open
- when branches should push to remote
- how local checks, CI, GitHub review, human review, and optional structured autoreview fit together
- how multiple agents coordinate without treating any task branch as the baseline

## Current Baseline

LitRev already has a strong Git spine:
- repo-root `main` is the canonical clean baseline
- normal work happens on `YY/**` task branches in task worktrees
- pushes to `YY/**` auto-open or reuse a PR into `main`
- non-draft PRs request `@codex review`
- protected `check` CI runs migration/drift sanity, typecheck, governance, chat-stream guard, agent-quality, Vitest, and build
- branch protection requires PR review, code owner review, conversation resolution, and green `check`

The main gap is not missing automation. The gap is end-to-end agent discipline around sizing, push timing, local closeout review, multi-agent coordination, and how advisory review findings become fixes, tests, docs, or conscious rejections.

## Principles

1. `main` stays boring.
   - repo-root `main` mirrors `origin/main`
   - no normal task edits happen in repo root
   - no task worktree becomes a new baseline

2. One task, one branch, one clear owner.
   - every active task branch has a named scope and current owner
   - multi-agent work is split into coordinated branches unless an integration branch is explicitly justified

3. Push reviewed slices, not anxious noise.
   - push after a coherent validated commit
   - do not push merely to make local uncertainty remote
   - if a remote checkpoint is necessary before validation, mark the PR as blocked/draft in the PR body or comment

4. Open PRs early enough to get feedback, late enough to be meaningful.
   - small work opens a ready PR after the first validated commit
   - larger work opens a draft or blocked PR only when partial remote review is useful
   - incomplete branches must say what remains

5. Review is layered.
   - self-review the diff before asking another reviewer
   - run route-required checks before push unless explicitly blocked
   - use structured autoreview as advisory closeout for meaningful code changes, not as a merge gate
   - GitHub `@codex review`, CI, and human review remain authoritative external checks

6. Findings must land somewhere real.
   - accepted findings become code, tests, runbooks, owner-plan updates, or a tracked follow-up
   - rejected findings get a short reason
   - repeated advisory findings are promoted into durable repo controls

## Work Size Classes

### Class 0: Read-Only Analysis

Examples:
- answering a repo question
- reviewing a link or proposal
- inspecting current state without edits

Flow:
1. Read `AGENTS.md`, owner docs, and target files as needed.
2. Do not create a branch or task worktree unless inspection requires branch-specific state.
3. Do not run mutation commands.
4. Report evidence, uncertainty, and any recommended next action.

Checks:
- none unless the user asks for live verification

Push/PR:
- never

### Class 1: Tiny Docs or Metadata Fix

Examples:
- typo or small wording correction
- plan pointer update
- non-behavioral docs clarification

Flow:
1. Use a task worktree if edits are required under normal agent workflow.
2. Keep the change single-purpose.
3. Self-review `git diff`.
4. Commit immediately after review.

Checks:
- no code gate unless the doc changes executable workflow truth
- if executable workflow truth changes, run the matching lightweight check when available

Autoreview:
- usually skip
- run only if the doc changes Git, CI, release, security, or agent authority

Push/PR:
- push after the atomic commit
- open/update one PR

### Class 2: Small Code Fix

Examples:
- focused bug fix
- small UI behavior correction
- narrow test repair
- one subsystem, limited files

Flow:
1. Start from repo-root clean `main`.
2. Create a task worktree on `YY/<task>`.
3. Load the Tier 2 specialist and Tier 3 docs required by `AGENTS.md`.
4. Implement the smallest root-cause fix.
5. Add or update focused tests when behavior changes.
6. Run route-required checks.
7. Self-review the diff and touched ownership boundaries.
8. Commit.
9. Push and open/update PR.
10. Inspect CI and review feedback.
11. Address accepted findings in follow-up commits on the same branch.

Checks:
- route-required `AGENTS.md` checks
- conservative fallback when risk is unclear:
  - `cd next-app && npm run typecheck`
  - `cd next-app && npm run lint`
  - `cd next-app && npm run test:vitest`

Autoreview:
- optional
- recommended when the fix touches auth, storage, DB, agent runtime, artifact review/apply, shared UI infrastructure, or CI/governance
- skip when the change is obviously covered by focused tests and low blast radius

Push/PR:
- push after local checks and commit
- open a ready PR unless the branch is knowingly incomplete

### Class 3: Medium Feature or Refactor

Examples:
- shared component extraction
- route-level behavior change
- agent-runtime contract change
- DB or migration change
- feature slice spanning multiple files but still one owner domain

Flow:
1. Start from clean repo-root `main`.
2. Create one task worktree and branch.
3. Write a short implementation thesis in the PR body or task notes before major edits:
   - scope
   - non-goals
   - owner docs read
   - expected validation
4. Implement in coherent commits if that improves review.
5. Run route-required checks and any shared lanes triggered by the touched surface.
6. Run structured closeout review after tests pass, if the helper is available.
7. Verify every accepted autoreview finding manually before changing code.
8. Rerun focused tests and structured review after review-triggered code changes.
9. Push when the branch is ready for meaningful remote review.
10. Keep PR review conversations resolved before merge.

Checks:
- route-required checks from `AGENTS.md`
- plus relevant shared lanes from `docs/runbooks/testing-ci-strategy.md`
- for PR-ready confidence when practical:
  - `cd next-app && npm run check:pr`

Autoreview:
- recommended before first ready PR review
- required by future policy only after trial evidence proves a good signal-to-noise ratio

Push/PR:
- push after a coherent locally validated slice
- if pushed before complete, immediately mark the PR draft/blocked and write remaining work

### Class 4: Large Multi-Surface Project

Examples:
- cross-domain feature
- major runtime/reliability change
- broad UI architecture migration
- task likely to need multiple agents

Flow:
1. Create or update a domain plan before implementation.
2. Split work into small or medium task branches that can merge independently.
3. Assign one coordination owner for the overall effort.
4. Each agent owns one branch/worktree at a time.
5. Use `main` as the integration baseline; avoid long-lived integration branches unless the coordinator explicitly documents why `main` cannot serve that role.
6. Merge vertical slices frequently.
7. Keep feature flags or compatibility paths until enough evidence supports cleanup.
8. Use structured review and specialist review on each risky slice, not only at the end.
9. Record durable decisions in owner docs, not chat.

Checks:
- each slice runs its own route-required checks
- integration-sensitive slices also run shared PR-ready checks
- browser/performance/burn-in lanes run only where owner docs require them

Autoreview:
- recommended for every risky slice
- panel or multi-reviewer mode remains opt-in for high-risk/security/runtime slices only

Push/PR:
- push each validated slice to its own PR
- do not batch a large project into one giant PR unless the change is genuinely inseparable

### Class 5: Emergency Hotfix

Examples:
- production-breaking issue
- deploy-blocking schema drift
- security exposure requiring immediate remediation

Flow:
1. Use `YY/hotfix-<task>`.
2. Keep the change minimal and reversible.
3. Run the narrowest credible validation plus any required release/DB gates.
4. Open PR to `main`.
5. Request immediate human review.
6. After merge, create a follow-up issue/plan entry if the hotfix leaves deeper cleanup.

Checks:
- exact owner-required gates
- release or DB gates when relevant

Autoreview:
- use only when it will not delay urgent remediation beyond reason
- never use autoreview as an excuse to broaden the hotfix

Push/PR:
- push as soon as the minimal validated fix is ready
- PR is mandatory unless the user explicitly invokes emergency direct-main procedure

## Standard Candidate Flow

### Start

From repo root:

```bash
git fetch origin --prune
git switch main
git pull --ff-only origin main
git status --short --branch
git worktree add -b YY/<task> .worktrees/<task> origin/main
```

In the task worktree:

```bash
git status --short --branch
```

Then:
1. route by `AGENTS.md`
2. load the required specialist and Tier 3 docs
3. inspect existing behavior
4. implement
5. validate
6. self-review
7. optional structured closeout review
8. commit
9. push/PR

### After Each Small Fix

For every completed small fix inside a branch:
1. run the focused check that proves the fix
2. run required route checks if the branch is ready to commit
3. inspect `git diff`
4. commit the fix
5. decide whether to push:
   - push immediately if this is the branch's PR-ready slice
   - hold locally only if more edits are needed before meaningful review and the work is not at risk
   - if work must be handed off or preserved remotely before validation, push with an explicit blocked/draft note

Do not accumulate unrelated fixes into one commit to "save PR overhead."

### Before Push

Required:
- branch still targets current `origin/main` or has a clear reason not to
- route-required validation has passed or failures are documented as blockers
- no unrelated files are staged
- self-review has checked ownership boundaries and user-visible behavior

Recommended for meaningful code changes:
- structured closeout review if installed and not noisy for this class

### PR Open Timing

Open a PR when:
- the branch has one coherent validated slice
- the PR description can explain scope, tests, and remaining risk
- remote CI/review feedback would be meaningful

Use a draft/blocked PR when:
- the branch needs remote visibility or multi-agent coordination before completion
- CI is expected to fail for a known reason
- the slice is intentionally incomplete

Do not open a PR when:
- the branch is a scratch exploration
- the diff is still incoherent
- the task has not passed enough local checks to avoid wasting review attention

Current automation auto-opens PRs on `YY/**` pushes. If draft PR behavior becomes important, a future implementation task should add an explicit draft-conversion or non-auto branch path instead of relying on convention alone.

### PR Closeout

Before merge:
1. CI `check` is green.
2. Required human and code-owner review state is satisfied.
3. `@codex review` feedback has been inspected.
4. Any structured autoreview findings have been accepted/fixed or rejected with reason.
5. Conversation threads are resolved.
6. Final branch diff is still scoped.

After merge:
1. sync repo-root `main`
2. remove the task worktree
3. delete the merged local branch
4. confirm repo-root `main` is clean and matches `origin/main`

## Structured Autoreview Position

The upstream OpenClaw `autoreview` skill is useful as a pattern:
- freeze one diff
- run one structured reviewer
- treat results as advisory
- verify every finding against code
- fix only concrete actionable issues
- rerun tests and review after review-triggered changes
- stop when clean

LitRev should not blindly import the skill as policy.

Current candidate posture:
- optional for Class 2
- recommended for Class 3 and risky Class 4 slices
- opt-in panel mode only for high-risk runtime/security/DB/release work
- never a substitute for tests, CI, owner docs, or human review
- never a merge gate until trial evidence proves it catches real issues without excessive noise

If the pattern proves useful, create a LitRev-local closeout skill instead of depending directly on generic upstream wording. The local skill should:
- read `AGENTS.md` routing first
- require owner-doc retrieval based on touched paths
- use `docs/runbooks/testing-ci-strategy.md` for validation vocabulary
- report accepted and rejected findings separately
- require promotion of repeated findings into tests, rules, runbooks, plans, or repo-health
- forbid nested review panels unless explicitly requested
- keep current `@codex review` and protected CI as separate layers

Candidate name:
- `litrev-closeout-review`

## Multi-Agent Coordination

### Ownership

Each active branch must have:
- owner agent
- task summary
- touched domains
- current status
- expected validation
- dependencies on other branches or PRs

The PR body is the preferred live coordination surface once a PR exists. Before PR creation, use the task thread or a local scratch note; do not invent hidden state that another agent cannot discover.

### Collision Avoidance

Before resuming a branch:
1. `git fetch origin --prune`
2. confirm repo-root `main` is clean and synced
3. inspect open PRs touching the same domain
4. inspect local worktrees
5. confirm the branch is still the intended execution surface

If two agents need the same files:
- choose one owner for those files
- split by ownership boundary if possible
- otherwise serialize work and rebase/merge only after the first PR lands

### Integration

Preferred:
- independent PRs into `main`
- each slice remains deployable or safely disabled
- downstream branches rebase from `origin/main` after upstream merge

Allowed with explicit justification:
- temporary integration branch for a tightly coupled sequence

Not allowed:
- treating a task branch, rescue worktree, or integration branch as the canonical baseline
- merging unrelated task branches into each other just to avoid rebasing
- leaving stale finished worktrees as passive history

### Handoff

Every handoff should include:
- branch/worktree path
- current commit
- last checks run and result
- open blockers
- whether PR exists
- review findings still unresolved
- files intentionally left untouched because they are user-owned or owned by another branch

## Skill and Automation Adoption Plan

### `GF-001` Trial Structured Closeout Review

Run optional structured closeout review on a small sample of real branches:
- one small code fix
- one medium UI/backend slice
- one runtime/security-sensitive slice if available

For each trial, record:
- command/tool used
- findings accepted
- findings rejected
- whether a test/doc/rule changed because of the finding
- time cost
- whether the finding duplicated existing `@codex review` or CI

Exit criteria:
- keep if it catches real issues without drowning the branch in speculative review
- drop if it mostly duplicates existing GitHub review or creates noisy delay
- localize into `litrev-closeout-review` only if useful patterns repeat

### `GF-002` Draft PR and Remote Checkpoint Decision

Decide whether the current `YY/**` auto-PR behavior needs a draft/checkpoint path.

Questions:
- should remote checkpoints use a different branch prefix?
- should the auto-PR workflow create drafts for branches with a marker?
- should agents convert auto-created PRs to draft when validation is incomplete?

Exit criteria:
- no ambiguity around when pushing creates review burden

### `GF-003` PR Body Coordination Template

Add or update the PR template or auto-PR body so agent branches expose:
- scope
- owner
- touched domains
- checks run
- structured review status
- remaining risk
- cleanup manifest when relevant

Exit criteria:
- multi-agent handoffs do not rely on chat memory

### `GF-004` Promote Adopted Rules

Only after trial:
1. update `docs/runbooks/github-flow.md`
2. update `AGENTS.md` if the rule becomes Tier 1 policy
3. update workflow automation if behavior changes
4. update `docs/runbooks/testing-ci-strategy.md` if validation vocabulary changes
5. add a local skill only if repeated usage proves it is worth maintaining

## Open Questions

- Should ready PR creation remain automatic on every `YY/**` push, or should incomplete remote checkpoint branches bypass auto-PR?
- Should structured closeout review run before commit, after commit, or both for medium/risky changes?
- Should LitRev use the upstream `autoreview` helper as-is for a trial, or write a tiny repo-local prompt wrapper first?
- What finding threshold justifies making structured closeout review recommended versus mandatory for specific risk classes?
- Where should branch ownership metadata live before a PR exists?

## Non-Goals

- This plan does not change branch protection.
- This plan does not replace `@codex review`.
- This plan does not add new CI gates.
- This plan does not remove the existing GitHub flow runbook.
- This plan does not authorize direct commits to repo-root `main`.
- This plan does not create a second canonical baseline.
