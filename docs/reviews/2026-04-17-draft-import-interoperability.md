# Draft Import and Interoperability

## Purpose
This note is the durable memory for the completed `DAP-03A` implementation work.

It replaces the long-form execution plan once the non-UI import foundation, contracts, and verification assets exist in the repo.

## What Shipped
- Canonical import contracts and report helpers in `next-app/lib/draft-import/`.
- Bibliography adapters for:
  - `CSL JSON`
  - `RIS`
  - `BibTeX`
- Manuscript intake for:
  - `DOCX`
  - Markdown
  - HTML
  - `CSV`
  - `TSV`
- Legacy-draft intake normalization for older LitRev draft payloads.
- Checkpoint-safe reconciliation and apply planning into canonical `DraftState v2`.
- A server-owned import orchestration path in `next-app/lib/server/draft-imports.ts`.
- A typed server action seam in `next-app/app/actions/draft-imports.ts`.
- Auxiliary bibliography support in canonical draft normalization and validation.
- Fixture-backed tests plus benchmark-corpus execution over the committed source fixtures.

## Initial Decisions Locked By `DAP-03A`
- Import remains non-UI first; visible import entrypoints, reports, and repair surfaces still require a separate user-approved UI planning checkpoint.
- Every source format must normalize into one shared import/result/report contract before draft mutation happens.
- Imports preserve scholarly structure where feasible, downgrade explicitly where necessary, and never silently flatten unresolved citations or table structure.
- Bibliography intake merges on stable scholarly identity first and records source-aware repair information instead of inventing silent duplicate resolution.
- Import application is checkpoint-safe by default so manuscript replacement and bibliography merges stay reversible.

## Output Paths
- Import domain logic:
  - `next-app/lib/draft-import/`
- Server orchestration:
  - `next-app/lib/server/draft-imports.ts`
  - `next-app/app/actions/draft-imports.ts`
- Import source fixtures:
  - `next-app/test/fixtures/draft/imports/source/`
- Focused tests:
  - `next-app/lib/draft-import/__tests__/`
  - `next-app/lib/server/__tests__/draft-imports.test.ts`

## What This Enables Next
- Future visible import UX can sit on top of an already truthful parser/report/apply foundation instead of inventing semantics in the route.
- `DAP-03`, `DAP-05`, and `DAP-07` can reuse import-generated scientific objects, auxiliary bibliography, and downgrade reporting instead of creating separate adapters later.
- Scientists can eventually bring existing manuscripts and reference files into LitRev without the editor or compiler having to special-case each source format independently.

## Remaining Discipline
- Any visible import UI remains approval-gated under the draft UI rule.
- Better citation repair flows, richer DOCX fidelity, and journal-aware import review still belong to later slices on top of this baseline.
