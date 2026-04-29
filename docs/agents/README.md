# Agents Context Architecture (v2)

This directory contains Tier 2 and Tier 3 context for LitRev.

## Tiers

1. Tier 1 (hot memory): `/AGENTS.md`
2. Tier 2 (specialists): `/docs/agents/specialists/*.md`
3. Tier 3 (cold memory): canonical runbooks/plans indexed in `/docs/agents/cold-memory-index.md`

## Operating Rules

- Tier 1 is always loaded and should stay concise.
- Tier 2 is loaded per trigger table in `AGENTS.md`.
- Tier 3 is retrieved on demand before risky or domain-specific edits.
- If code changes invalidate docs, update docs in the same task.

## Specialist Loading Order

1. Match changed files/task to a trigger in `/AGENTS.md`.
2. Load the matching specialist spec from `specialists/`.
3. Read required Tier 3 docs listed by that specialist.
4. Run required checks before completion.

## Drift Control

Use `/docs/agents/drift-checklist.md` before commit when task scope affects architecture, DB schema, workflows, or operational runbooks.


## Discovery Aid

- `repo-knowledge-map.md` is a fast-path index for cross-domain context discovery; use it after routing through `AGENTS.md` and before deep edits.
