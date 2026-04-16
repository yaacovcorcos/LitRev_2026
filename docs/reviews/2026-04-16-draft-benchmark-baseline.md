# Draft Benchmark Baseline

## Purpose
This note is the durable memory for the completed `DAP-00` implementation work.

It replaces the long-form execution plan once the corpus, harness, decisions, and rollout gates exist in the repo.

## What Shipped
- A committed draft benchmark corpus in `next-app/lib/draft-benchmark/`.
- Five manuscript fixtures:
  - `short-paper`
  - `medium-review`
  - `large-evidence-heavy`
  - `object-heavy`
  - `metadata-heavy`
- A committed import corpus under `next-app/test/fixtures/draft/imports/source/`.
- A generated DOCX intake sample for future import work.
- Budget definitions and acceptance-gate evaluation helpers.
- Scripts for:
  - fixture summary reporting
  - acceptance-check evaluation
  - DOCX import-fixture generation
- Focused tests for:
  - corpus completeness
  - export viability
  - anchor stability under reorder/move operations
  - measurement-gate evaluation

## Initial Decisions Locked By `DAP-00`
- Keep LitRev on the ProseMirror/Tiptap family for the draft rebuild.
- Continue toward one canonical manuscript editor instance rather than multiple visible editor authorities.
- Treat page mode as a later gated surface, not as a prerequisite for the first editorial-core rebuild slice.
- Treat IndexedDB as the intended primary local durability direction, with localStorage limited to small boot hints and fallback metadata.
- Make import honesty a hard rule:
  - preserve structure first
  - downgrade visibly
  - never silently flatten unresolved references or scholarly objects
- Keep the current draft route as the fallback until the later rebuild proves recovery, anchor stability, and export trust.

## Output Paths
- Corpus and harness code:
  - `next-app/lib/draft-benchmark/`
- Import sources and baseline measurements:
  - `next-app/test/fixtures/draft/`
- Reporting and fixture-generation scripts:
  - `next-app/scripts/draft-benchmark/`

## What This Enables Next
- `DAP-01` can now build `Draft VNext` against a real corpus instead of toy examples.
- Later import, recovery, and export slices now have explicit artifacts and budgets to test against.
- Draft-side decisions can be compared against one stable baseline instead of repeated ad hoc exploration.

## Remaining Discipline
- Visible draft UI work still requires a separate user-reviewed UI planning checkpoint before implementation.
- Browser-matrix smoke remains a required later gate for user-facing slices even though `DAP-00` itself stays non-visual.
