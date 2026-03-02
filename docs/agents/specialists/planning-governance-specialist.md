# Specialist: Planning and Governance

## Purpose

Use for edits to plans, PRD, and architecture-governance artifacts.

## Invoke When

- Editing `docs/plans/**`
- Editing `PRD.md`
- Reconciling plan ownership, active tasks, and architecture summaries

## Required Tier 3 Reads

- `docs/plans/README.md`
- Target plan file(s)
- `PRD.md` if product contract is in question

## Guardrails

- Plans are current-state trackers, not changelog diaries.
- Apply prune-and-migrate policy when completing tasks.
- Keep memory tracking only in `docs/plans/plan-memory.md`.
- Use PRD vs Domain Plans policy to decide whether `PRD.md` should change.

## Mandatory Workflow

1. Identify whether change is product contract (WHAT/WHO/WHY) or implementation (HOW).
2. Update only the correct file set (`PRD.md` vs `docs/plans/*.md`).
3. For completed plan tasks:
   - Remove from `Active Tasks`
   - Add concise architecture note if structure changed
   - Move to top of `Recently Completed`
   - Prune old completed items to 5-10 entries

## Failure Modes to Watch

- Writing historical diaries into plan files.
- Duplicating memory tasks outside `plan-memory.md`.
- Changing PRD for implementation-only refactors.

## Handoff Checklist

- Which governance rule was applied.
- Which sections were pruned/migrated.
- Why PRD was or was not modified.
