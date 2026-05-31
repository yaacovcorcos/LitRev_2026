# Claude Memory Review Comparison

## Source

The pasted Claude review was compared against the current `YY/memory-system-redesign` worktree, not against the older review-only state it described.

## Current-State Verdict

Claude's review was directionally strong, but several of its concrete findings are already fixed in the current branch:

- Importance ordering: fixed. Project memories now store `importanceRank` and retrieval orders by `importanceRank desc`.
- Project-memory versioning: fixed. Revision creates a new row, marks the older row `revised`, points `supersededBy` to the new row, removes stale embeddings, and the default path runs inside a transaction.
- `citedStudyIds` authorization: fixed. Retrieval actions require project scope and authorize every cited study before calling retrieval; retrieval itself uses project-scoped study-memory loading.
- Action validation: fixed. Memory actions are wrapped in Zod validation schemas.
- Provenance flattening: improved. Prompt context now carries compact source/authority/polarity labels.
- Hard-delete UI: already contained. The memory page uses archive actions for project, study, and user memories.

## Additional Improvement Applied

Claude's strongest remaining current-state critique was that conversation-extracted decisions and facts were auto-written into `ProjectMemory`. That violated the capture-vs-belief boundary.

Applied change:

- Conversation extraction now returns parsed candidates but persists them only as `memory_proposal` artifacts when a reviewable run exists.
- Decision candidates preserve `projectMemoryType = decision`, category, rationale, and confidence.
- Fact candidates preserve `projectMemoryType = definition`, category, and confidence.
- The artifact handler now respects reviewed project-memory type, category, polarity, and confidence when an accepted proposal becomes durable project memory.

## Deferred Architecture

The larger ideas in Claude's review remain valid but should not be bundled into this branch:

- unified `MemoryItem`
- typed `KnowledgeContextPacket`
- async embedding outbox
- bi-temporal validity intervals
- consolidation/reflection passes
- full UX split between candidate, current, archived, and superseded memories

Those should be staged behind retrieval-quality evals and migration plans, not hidden inside this hardening pass.
