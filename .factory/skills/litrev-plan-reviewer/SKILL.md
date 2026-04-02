---
name: litrev-plan-reviewer
description: Review LitRev 2026 implementation and governance plans against current repo truth. Use when the user asks for a plan critique, says review:, wants codexR-style findings, or needs runtime/UI/DB/governance/rollout analysis before implementation.
---
# LitRev Plan Reviewer

Use this skill to review plans for LitRev 2026.

This is a review skill, not an implementation skill.
Default to critique unless the user explicitly asks for changes.

## First Principles

Treat these as first principles:

- `AGENTS.md` is Tier 1 authority for routing and repo rules.
- `docs/plans/README.md` is the canonical plan index.
- Repo-root `main` is the canonical baseline.
- Canonical paths are repo-root paths, not detached worktree paths.
- Docs, runbooks, and plan ownership are load-bearing.
- Prefer durable, repo-aligned fixes over expedient local patches that create future cleanup debt.
- If a temporary containment step is necessary, label it as containment and require an explicit follow-up owner or closeout path.

## Read First

Always read:

- `AGENTS.md`
- `docs/plans/README.md`
- the plan file(s) being reviewed

Load `docs/agents/specialists/planning-governance-specialist.md` when the plan touches:

- docs/governance
- ownership or canonical-plan framing
- roadmap/fix status
- burn-in/report authority
- git/process/governance mechanics

Use that specialist as the owner for canonical plan framing, plan-maintenance rules, and PRD-vs-domain-plan boundaries.

Then load the minimum additional docs needed by the actual domain:

- DB/schema/migrations/durable jobs:
  - `docs/agents/specialists/db-ops-specialist.md`
  - `docs/runbooks/db-architecture.md`
  - `docs/runbooks/db-ops.md`
  - `docs/plans/db-production-runbook.md` when production posture matters
- UI/pages/components/project surfaces:
  - `docs/agents/specialists/frontend-ui-specialist.md`
  - `docs/architecture/frontend-quality-bar.md`
  - `docs/runbooks/frontend-review-loop.md`
  - the active relevant UI plan from `docs/plans/README.md`
- agent/runtime/orchestration/recovery/artifacts:
  - `docs/agents/specialists/agent-runtime-specialist.md`
  - `docs/plans/plan-agentic.md`
  - `docs/plans/chatRuntime.md`
  - `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` when detail-level runtime mechanics matter
  - `docs/plans/transparencyUI.md` only when the plan touches process/transparency/message-boundary UI truth, blocked-card semantics, transcript semantics, or process-details behavior
- release/deploy:
  - `docs/agents/specialists/release-deploy-specialist.md`
  - `docs/runbooks/db-ops.md`
  - `docs/plans/db-production-runbook.md`
- git/worktree/cleanup assumptions:
  - `docs/runbooks/github-flow.md`

Use `docs/agents/cold-memory-index.md` when the correct Tier 3 mapping is unclear.

## Core Review Job

Your job is to:

- ground feedback in current repo truth
- catch stale assumptions, wrong ownership, and scope drift
- distinguish local fixes from shared-contract changes
- distinguish code work from docs/evidence/ops work
- distinguish already-shipped work from real remaining delta
- recommend the smallest correct correction in phase or order

## Canonical Ownership Anchors

Verify plan framing against these owners before accepting it:

- `docs/plans/README.md` for active plan status and canonical owners
- `docs/plans/plan-agentic.md` for runtime/fix-status truth
- `docs/plans/chatRuntime.md` for shared runtime architecture and burn-in posture
- `docs/plans/transparencyUI.md` for process/transparency/message-boundary support truth when relevant
- `docs/runbooks/db-architecture.md` and `docs/runbooks/db-ops.md` for DB truth
- `docs/runbooks/github-flow.md` for branch/worktree/cleanup mechanics
- `PRD.md` only when the plan changes WHAT/WHO/WHY rather than HOW

Runbooks own operations, not roadmap status.
Reports own evidence, not roadmap status.
Supporting plans must not become second canonical trackers.
Canonical fix-status changes must also update the canonical owner doc.

## What to Catch

Call these out when present:

- shared route/runtime change mislabeled as local
- contract change described as a mere bugfix
- durable truth mixed with action/UI hint truth
- in-memory behavior described like durable cross-instance behavior
- `atomic` claimed without one real transaction boundary
- `autonomous` claimed without an independent trigger or scheduler
- evidence/ops work mixed into a runtime-code branch
- burn-in/evidence branches being used for implementation
- supporting plans becoming parallel status trackers
- reports or runbooks being used as roadmap owners
- rely on stale filenames, scripts, branches, PRs, worktrees, or plan owners
- treat inactive or supporting plans as canonical owners
- reopen already-shipped work without repo evidence
- create a second tracker instead of updating the canonical owner
- propose renames or broad rewrites before repo-wide verification

## Dependency-Plan Rules

When reviewing dependency or tooling plans:

- use `next-app/package.json` and `next-app/package-lock.json` as the source of truth
- distinguish manifest edits from lockfile-only refreshes
- prefer explicit narrow installs over blanket updates
- do not force docs updates unless compatibility or workflow rules actually changed
- if a baseline-cleanup PR is proposed, require proof that the current gate actually fails
- keep majors, framework-line moves, and safe patch/minor refreshes in separate PRs

## Runtime-Plan Rules

When reviewing runtime or agentic plans:

- `plan-agentic.md` owns fix-status truth
- `chatRuntime.md` owns runtime current architecture and burn-in posture
- `transparencyUI.md` is relevant only when the plan touches process/transparency/message-boundary UI truth
- supporting remediation plans can hold detail, not supersede canonical status
- burn-in evidence branches are docs/evidence only unless the evidence window fails
- shared-path patches must stay tests-first and shared-path only
- do not overstate replay/continue/reconnect guarantees beyond persisted truth
- do not create a second stream/event contract if the repo already has one

## UI-Plan Rules

When reviewing UI plans:

- visible changes on major surfaces usually need the relevant current-architecture plan updated
- no contradictory visible states
- no fake reconnect/wait/retry semantics
- polling, disabled states, and status copy must be truthful
- do not introduce no-op controls
- do not solve shared runtime problems with surface-local render hacks unless the contract explicitly belongs in rendering

## DB / Process / Workflow Rules

When reviewing DB or durable processing plans:

- require DB specialist plus DB runbook preflight
- freeze row lifecycle and mutation rules explicitly
- define the durable source of truth
- avoid a second action/UI truth layer unless it is exactly derived from durable truth
- do not accidentally create a generic job platform when the task is feature-specific

## Severity Model

Use these severities:

- `F0`
  - materially misframed
  - duplicates already-shipped work
  - assigns ownership incorrectly
  - would send implementation in the wrong direction
- `F1`
  - major correction needed
  - scope too broad
  - wrong mechanics or authority
- `F2`
  - important tightening
  - sequencing, terminology, validator, or doc precision
- `F3`
  - minor tightening or explicit keep

## LitRev Heuristics

Use these aggressively when they fit:

- `This is a delta-closeout plan, not a greenfield implementation plan.`
- `Extend the existing shared contract; do not create a second one.`
- `Choose the smallest-churn fix after repo verification.`
- `Use repo-wide grep as the hard gate.`

## Review Workflow

For each plan review:

1. Classify the plan:
   - governance/docs
   - runtime
   - UI
   - DB
   - burn-in/sign-off
   - dependency/tooling
   - mixed
2. Load the matching specialist(s) and required Tier 3 docs.
3. Inspect the exact files and plans the proposal references.
4. Verify:
   - current ownership
   - current filenames
   - current active/inactive plan status
   - current code behavior when technical claims are made
   - current operational owner when rollout/sign-off is claimed
5. Compare plan claims to repo truth:
   - already shipped?
   - partially shipped?
   - ops-blocked rather than code-blocked?
   - over-broad?
   - mis-owned?
   - missing validation or missing tests?
6. Write the review in the codexR-style format below.

## Default Response Format

Use this unless the user explicitly asks for a different format:

```md
here is codexR's feedback, analyze it critically and if you agree with anything, update your plan. if you dont agree, write a message to codexR to explain why you think differently.

This plan is directionally right/wrong because <short repo-grounded assessment>.

**Findings**

**F0**
1. <issue>
- what is wrong: <direct statement>
- why it matters: <practical consequence>
- what to change: <specific correction>

**F1**
2. <issue>
- what is wrong: ...
- why it matters: ...
- what to change: ...

**F2**
3. <issue>
- what is wrong: ...
- why it matters: ...
- what to change: ...

**F3**
4. <issue or explicit keep>
- what is wrong: ...
- why it matters: ...
- what to change: ...

**Missing assumptions/questions**
1. <question>
2. <question>

**Concrete revised phase/order recommendation**
1. <step one>
2. <step two>
3. <step three>

Net: <short closing assessment>
```

Only include severities that are actually needed.
If there is no `F0`, start at `F1`.

## Quality Bar

A good LitRev plan review should:

- cite repo truth, not vibes
- name the real owner doc
- identify whether the work is shared
- identify whether docs updates are mandatory or conditional
- identify missing tests or validation
- identify stale branch/PR/worktree assumptions
- separate implementation delta from evidence/ops delta
- keep corrections narrow and decision-complete

## Anti-Patterns

Do not:

- invent repo state
- treat detached worktree paths as canonical
- recommend broad rewrites without evidence
- force docs churn for every maintenance task
- call something local if it changes shared truth
- call something atomic without a real transaction boundary
- call something autonomous if it still depends on user kicks
- turn a review into implementation unless asked
- approve a plan just because it sounds coherent

## Final Rule

The goal is not to approve or reject plans.

The goal is to make them:

- more truthful
- narrower where needed
- better grounded in the repo
- cleaner in ownership
- safer to implement
- easier to validate
