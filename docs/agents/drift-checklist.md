# Drift Checklist

Run this checklist before commit when the task affects DB schema, architecture, plans, prompts, or operational workflows.

## Path-to-Doc Drift Check

1. List changed files: `git diff --name-only`.
2. Map changed files to subsystem using `docs/agents/cold-memory-index.md`.
3. Confirm the matching Tier 2 specialist and Tier 3 docs were consulted.
4. If behavior or invariants changed, update the corresponding docs in the same task.

## Contract Drift Check

1. If `prisma/schema.prisma` changed, verify a migration folder exists under `next-app/prisma/migrations/`.
2. If deploy or DB scripts changed, re-check `docs/runbooks/db-ops.md` and `docs/plans/db-production-runbook.md` for accuracy.
3. If UI behavior changed in `app/project/[id]/...`, confirm shell embedding and UI contract remain true.
4. If plan files changed, apply prune-and-migrate policy (`docs/plans/README.md`).
5. If memory behavior changed, update only `docs/plans/plan-memory.md` for memory tracking.

## Validation and Commit Check

1. Run required commands for the route in `AGENTS.md`.
2. Stage only intended files.
3. Inspect staged diff for secrets or accidental edits.
4. Commit atomically with a conventional message.
