# Draft Experience Plan (Canonical)

## Purpose
This is the single canonical plan for LitRev's drafting surface.

It defines the canonical drafting direction for LitRev and the sequence of work around it. The current authoritative route baseline is the restored section-first drafting experience anchored to the March 12, 2026 `8998296` interaction model: top section tabs, real `Section` / `Full Draft`, a dedicated left Evidence Ledger, and an obvious center drafting surface. The canonical manuscript model, citation compiler, and export foundation remain active under that UI, but the rejected continuous-workspace, drawer-first, and segmented-sidebar route shells are not the current product truth.

## Product Contract Boundary
This plan changes how LitRev delivers drafting, not what LitRev is for.

`PRD.md` already requires:
- integrated manuscript drafting with auditable AI support
- evidence-backed authoring
- verification workflows for citation gaps and unsupported claims
- export to shareable manuscript formats
- section-based drafting and revision

No PRD change is required now because the target architecture still supports section-based drafting. The current route is intentionally anchored to the old section-first drafting page, while the normalized manuscript model remains an internal foundation beneath it.

Current route contract:
- fresh drafts restore the older seeded section-first scaffold
- named section tabs are visible immediately
- `Section` mode is the primary drafting surface on open
- `Full Draft` and `Section` are route-level projections over one normalized draft/manuscript state
- top tabs show named sections only
- the center section editor is the primary visible writing surface
- evidence targets the active named section during normal drafting
- `Full Draft` only renders written sections; otherwise it shows the start-drafting empty state
- left Evidence Ledger is the only draft-owned support surface
- right side remains owned by the existing project copilot shell

### Draft UI Approval Rule
- Any draft-route UI change requires explicit user approval before implementation.
- Any draft implementation plan that includes a UI change must clearly mark the UI-changing phase as approval-gated.
- Any such phase must include an explicit warning that visual or interaction behavior will change and must be manually verified before approval.
- Do not bundle draft UI changes into broader draft work without calling them out separately first.

## Deferred Improvements After Route Restore
These items are intentionally preserved as follow-on improvements after the `8998296` route baseline is stable again. They are not the current draft-shell truth, and they must not be reintroduced opportunistically during restore work.

- Preserve the canonical manuscript document and normalized persistence model as the single source of truth beneath the restored route shell.
- Keep blank-start drafting support:
  - no seeded sections
  - `mode: "full"` by default
  - `activeSection: null` by default
- Keep `Whole draft` as a real freeform/root drafting target in the normalized state model, while continuing to keep it off the top tab bar.
- Keep `UNSECTIONED_DRAFT_ID` support where it is needed for save/load, evidence targeting, formatting, and citation compilation.
- Keep the citation/reference compiler improvements:
  - generated references
  - references remain read-only and last
  - no return to manually typed bibliography as the primary references model
- Keep export-path improvements and the canonical export entrypoint, even while the visible draft shell is restored.
- Revisit compact/mobile hardening later, but only if it does not drift the restored desktop baseline:
  - overlay dismissal
  - clear reopen affordances
  - stable focus handling
- Revisit controller cleanup later:
  - keep one normalized draft state
  - keep `Section` and `Full Draft` as projections over that one state
  - do not reintroduce shadow documents or fake section-mode rendering
- Revisit future review/history work later:
  - comments
  - suggestions
  - checkpoints
  - compare/restore
- Revisit any broader visual modernization only after the restored drafting surface is stable and trusted again.

## Goal and Scope
### Problem statement
The draft surface must remain immediately usable for actual writing. The recent continuous-workspace, drawer-first, and segmented-sidebar experiments moved the route away from the last workable section-first experience and created shell/controller drift. The correction is to restore the usable section-first baseline first, then evolve the manuscript system underneath it without forcing another premature route architecture jump.

### Intended outcome
LitRev drafting becomes a manuscript operating system with:
- one canonical, versioned manuscript document underneath the route
- a restored section-first drafting surface on top of that normalized manuscript
- stable block identities and semantic manuscript objects
- first-class citations, evidence links, comments, suggestions, and checkpoints
- inline AI that proposes changes instead of silently rewriting text
- compiler-grade export to real document outputs

### In scope
- Draft information architecture and interaction model
- Editor foundation decision
- Document/domain model for manuscript content
- Review model: comments, suggestions, checkpoints, compare/restore
- Science-native authoring model: citations, evidence, figures, tables, equations, cross-references
- AI edit/rewrite/propose behaviors inside the document
- Export/compiler architecture
- Mobile, accessibility, performance, and reliability requirements for drafting

### Out of scope
- Replacing the repo-wide project shell or global chat architecture
- Changing the product into a generic wiki, PKM app, or no-code workspace
- Turning LitRev into a LaTeX-first editor
- Expanding PRD scope to multi-rater enterprise collaboration without a separate product-contract decision

## Governance and Repo Grounding
### AGENTS routing for this planning task
- This file falls under `docs/plans/**`, so `planning-governance-specialist.md` governs the edit.
- No PRD changes are included because this is an implementation plan, not a product-contract change.

### Required retrieval for future implementation
- UI work under `next-app/app/project/[id]/draft/**`, `next-app/components/**`, `next-app/styles/**`
  - Tier 2: `docs/agents/specialists/frontend-ui-specialist.md`
  - Tier 3: `docs/plans/plan-ux-ui.md`
- Backend/export/domain work under `next-app/lib/server/**`, `next-app/app/actions/**`, `next-app/lib/**`
  - Tier 3: `docs/plans/plan-backend.md`
- Database schema/migration work
  - Tier 2: `docs/agents/specialists/db-ops-specialist.md`
  - Tier 3: `docs/runbooks/db-architecture.md`, `docs/runbooks/db-ops.md`
- Agent/artifact proposal work under `next-app/lib/server/agent/**`
  - Tier 2: `docs/agents/specialists/agent-runtime-specialist.md`
  - Tier 3: `docs/plans/plan-agentic.md`

### Current-state evidence (code-verified)
- `next-app/app/project/[id]/draft/page.tsx`
  - Route-level Draft Studio, localStorage-first paint, section/full modes, project copilot wiring, seeded section-first route restore, and restored left Evidence Ledger + center drafting layout.
- `next-app/app/project/[id]/draft/DraftEditors.tsx`
  - Current editor is Tiptap `StarterKit` + `Underline` + custom `Citation` node + paragraph direction.
  - No native comments, suggestion mode, headings UI, tables, figures, equations, links, footnotes, or outline tooling.
- `next-app/app/project/[id]/draft/useDraftWorkspaceController.ts`
  - Canonical route orchestration now owns section add/remove/drag behavior, whole-draft targeting, ledger collapse state, and save/export wiring against the normalized draft state.
- `next-app/app/project/[id]/draft/useDraftExport.ts`
  - Current "DOCX export" path is placeholder behavior and not a true document-generation pipeline.
- `next-app/components/ExportModal.tsx`
  - Export UX assumes a real DOCX pipeline exists, but current route-level implementation does not satisfy that promise.
- `next-app/lib/server/draft-versions.ts`
  - Immutable draft versions already exist, but only per section and without a first-class draft-page history UX.
- `next-app/lib/server/agent/artifacts.ts`
  - Accepted `draft_diff` artifacts already create immutable `DraftVersion` entries, so LitRev already has a usable provenance hook for AI-generated changes.
- `next-app/lib/citation-compiler.ts`
  - Citation normalization and reference generation already exist and should be reused, not replaced.

## Documentation Impact
### Documentation updated in this planning task
- Add this file as the canonical drafting-experience plan.
- Update `docs/plans/README.md` to register this plan.
- Update `docs/plans/plan-ux-ui.md` to point at this plan as the active draft-domain owner.

### Documentation that future implementation must update
- `docs/runbooks/db-architecture.md`
  - When draft schema evolves beyond the current `Draft` / `DraftVersion` shape.
- `docs/plans/plan-backend.md`
  - When compiler/export, review entities, or draft persistence contracts ship.
- `docs/plans/plan-context-capture.md`
  - When draft block selections, evidence anchors, or suggestion/comment anchors change context-capture behavior.
- `PRD.md`
  - Only if product scope expands beyond the current contract, for example real-time multi-user collaboration as a required product behavior.

## External Benchmark Matrix
Use these as product references and pattern donors. Do not treat them as copy/paste sources.

| Family | Primary references | What LitRev should steal | What LitRev should explicitly reject |
|---|---|---|---|
| Block-native writing | [BlockNote](https://www.blocknotejs.org/), [AFFiNE](https://affine.pro/), [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy), [Outline](https://github.com/outline/outline), [Tiptap Notion-like template](https://tiptap.dev/templates/notion-like-template) | Stable block IDs, slash command insertion, drag handles, block transforms, calm empty states, continuous canvas writing | Generic wiki/database sprawl, workspace clutter, "everything is a page" confusion inside the manuscript |
| Review-grade editing | [CKEditor 5 collaboration](https://ckeditor.com/docs/ckeditor5/latest/features/collaboration/collaboration.html), [ONLYOFFICE Docs](https://github.com/ONLYOFFICE/DocumentServer), [Collabora Online](https://github.com/CollaboraOnline/online), [Overleaf track changes](https://docs.overleaf.com/collaborating/track-changes), [Overleaf history](https://docs.overleaf.com/writing-and-editing/history-and-versioning) | Suggestion mode, threaded comments, compare/restore, checkpoints, page-aware review discipline | Office-suite chrome, bloated ribbons, iframe-like "embedded editor app" feel |
| Scientific authoring | [Curvenote citations](https://docs.curvenote.com/write/citations), [Curvenote collaboration](https://docs.curvenote.com/write/collaboration), [Quarto manuscripts](https://quarto.org/docs/manuscripts/authoring/), [Quarto citations](https://quarto.org/docs/authoring/citations.html), [Typst](https://github.com/typst/typst), [Stencila](https://stencila.io/) | First-class citations, equations, figures, tables, cross-references, provenance, compiler-grade exports | Making code or LaTeX the default editing mode for ordinary users |
| Knowledge-linked drafting | [Logseq linked references](https://blog.logseq.com/instructions-for-how-to-use-linked-references-in-logseq/), [AFFiNE](https://github.com/toeverything/AFFiNE), [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | Backlinks, block references, transclusion, linked notes and evidence queries | Forcing users into a full PKM system just to finish a manuscript |
| Inline AI editing | [Lex](https://lex.page/), [Stencila](https://stencila.io/), [BlockNote](https://github.com/TypeCellOS/BlockNote) | AI as inline proposal, fast selection transforms, reversible edits, provenance-aware assistance | Chat-first writing, silent rewrites, black-box document mutation |
| Reliability and privacy posture | [CryptPad](https://github.com/cryptpad/cryptpad), [AFFiNE](https://affine.pro/), [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | Local-first resilience, sync safety, self-hostability posture, trust through durability | Fragile server-only draft state and hidden data-loss behavior |

### Licensing posture
- AGPL or source-available systems are benchmark inputs, not direct code donors unless licensing posture is reviewed explicitly.
- MIT/Apache/MPL-style sources are safer references for adaptation, but LitRev must still rewrite patterns into its own stack and naming.

## Chosen Strategy
### Core decision
Keep LitRev in the ProseMirror/Tiptap family and evolve the draft surface into a manuscript system on top of that foundation.

### Why this is the smallest reversible strategy
- The current repo already uses Tiptap in `next-app/app/project/[id]/draft/DraftEditors.tsx`.
- The existing citation compiler, project copilot integration, and `DraftVersion` infrastructure can all be reused.
- ProseMirror/Tiptap is capable of supporting both modern block interactions and serious semantic document structures.
- Migrating to Slate/Plate would replace the editor foundation before LitRev has even stabilized its manuscript model.
- Embedding ONLYOFFICE/Collabora/LibreOffice would outsource the product surface to a different product instead of building LitRev's own research-native experience.

### Chosen vs rejected foundations
- Chosen: ProseMirror/Tiptap manuscript core, borrowing interaction patterns from BlockNote/AFFiNE and review rigor from CKEditor/Overleaf.
- Rejected: full migration to Slate/Plate as the primary foundation.
- Rejected: office-suite embedding as the primary editor.
- Rejected: code-first or LaTeX-first primary authoring.
- Rejected: Notion clone behavior where manuscript semantics are secondary to page/database flexibility.

## End-State Drafting Surface
This is the exact target for the LitRev drafting place.

### 1. Overall layout
```
+----------------------+-------------------------------------------+---------------------------+
| Structure rail       | Manuscript canvas                         | Context rail              |
| outline              | continuous block-native document          | evidence                  |
| section map          | inline suggestions/comments/citations     | citations                 |
| unresolved issues    | figures/tables/equations/notes/claims     | comments                  |
| checkpoints          |                                           | versions and AI proposals |
+----------------------+-------------------------------------------+---------------------------+
```

### 2. Primary modes
These are one system's views, not separate products.

- Write mode
  - clean manuscript canvas
  - slash insert, keyboard-first transforms, citation insert, evidence add, AI inline tools
- Structure mode
  - strong outline controls, section ordering, fold/unfold, block move/reparent, section goals, unresolved structural gaps
- Review mode
  - comments, suggestion mode, accept/reject, diff highlights, compare with checkpoint
- Submission mode
  - page view, export validation, journal/template checks, bibliography and cross-reference completeness, final packaging

### 3. Manuscript canvas
- The current route is section-first, with explicit `Section` and `Full Draft` modes over one normalized manuscript state.
- `Full Draft` shows written named sections in order.
- `Section` mode isolates one named section at a time for focused drafting.
- Every block has a stable ID and semantic type.
- The canvas supports:
  - paragraph
  - heading
  - bullet and numbered list
  - quote
  - callout/note
  - citation inline node
  - claim block
  - evidence embed block
  - table block
  - figure block
  - equation block
  - appendix/supplement block
  - section divider / manuscript metadata blocks where needed
- Users can reorder blocks and sections visually without breaking anchors, comments, or evidence links.

### 4. Structure rail
- Live outline of manuscript sections and headings.
- Jump-to-section and jump-to-block navigation.
- Section completion indicators:
  - empty
  - drafting
  - evidence gaps
  - review open
  - export ready
- Named checkpoints appear in the rail and can be compared/restored.
- Unresolved comment threads, unsupported claims, and broken citations surface here without requiring users to scan the full document manually.

### 5. Evidence and citation rail
- Citations are inserted via a command palette, not by manual bracket typing.
- Every citation resolves to the project ledger's study identity.
- Hover and side-panel previews show study metadata, source details, and which claims/blocks use that study.
- Evidence can be attached to:
  - block
  - claim block
  - figure/table/equation note
  - section
- The rail supports:
  - search studies
  - filter by included/excluded/maybe
  - inspect citation coverage per section
  - show unsupported-claim warnings
  - show duplicate or suspicious citation usage
- References are compiled from the manuscript model, not manually typed in a freeform references section.

### 6. Comments and suggestions
- Review comments are threaded, anchor-stable, and resolvable/reopenable.
- Suggestion mode records proposed edits as explicit changes:
  - manual suggestion
  - AI suggestion
  - accepted
  - rejected
  - restored from checkpoint
- Users can accept/reject:
  - one change
  - a selected range
  - all changes in a thread or checkpoint
- Deletions, section removals, and major structural moves require confirmation or immediate undo.

### 7. Versioning and history
- Draft history is first-class in the draft page, not hidden in backend infrastructure.
- Users can create named checkpoints before major rewrites or AI operations.
- LitRev keeps immutable snapshots for:
  - manual checkpoints
  - accepted AI draft operations
  - export checkpoints
- History supports:
  - compare current draft to checkpoint
  - restore whole document
  - restore a single section
  - inspect who/what created the change and why

### 8. AI inside the document
- AI actions run from the selection, block menu, or context rail.
- Core AI actions:
  - rewrite for clarity
  - shorten / expand
  - convert bullet list <-> prose
  - draft from selected studies
  - suggest claim support
  - add citations to unsupported text
  - generate methods/result/discussion scaffolds from ledger evidence
  - create comparison table or evidence summary block
- AI never silently commits text.
- AI returns proposals with provenance and explicit accept/reject controls.
- Existing artifact infrastructure remains the proposal pathway for AI-originated changes.

### 9. Scientific authoring features
- Citation palette with ledger search and source preview
- Study-backed inline citations with stable IDs
- Claim support diagnostics
- Evidence coverage diagnostics by block and section
- First-class figures, tables, and equations
- Cross-references between text and figures/tables/sections
- Journal-aware metadata and export profiles
- Supplement/appendix authoring in the same document system

### 10. Export and submission
- Export is a compiler pipeline, not UI serialization.
- One semantic manuscript model should render to:
  - real DOCX
  - high-quality PDF
  - Markdown
  - future structured submission formats when required
- Export validation checks:
  - unresolved blocking citation issues
  - broken cross-references
  - missing captions or labels
  - unresolved review changes if export profile forbids them
- Export history remains visible in the draft experience with accurate file objects, not placeholder records.

### 11. Mobile and accessibility
- Mobile does not attempt to replicate every desktop rail simultaneously.
- Mobile uses mode-specific drawers/sheets for outline, evidence, and review, while preserving real editing and citation insertion.
- Keyboard navigation, focus visibility, semantic controls, and screen-reader announcements are mandatory.
- Draft controls must stay calm and high-signal; no visible no-op actions.

### 12. Reliability and privacy
- Local-first persistence remains mandatory for fast paint and resilience.
- Draft changes must be recoverable after tab crash or network interruption.
- Draft history and export operations must surface honest state:
  - saving
  - saved
  - sync delayed
  - export generating
  - export failed
- The data model should remain compatible with stronger privacy or self-hosting posture later without changing the drafting UX contract.

## Domain and Data Design
### New logical model
Introduce a manuscript domain model that sits above raw editor JSON.

Core concepts:
- `ManuscriptDocument`
  - root document with schema version, metadata, blocks, and section structure
- `ManuscriptBlock`
  - stable block ID, type, content payload, formatting attrs, citations, evidence anchors
- `ManuscriptAnchor`
  - block/range locator used for comments, suggestions, context capture, and QA diagnostics
- `ManuscriptCheckpoint`
  - named immutable snapshot for compare/restore and export provenance

### Persistence strategy
- `Draft` remains the current document record for a project.
- `DraftVersion` evolves from per-section history into document-aware snapshot history.
- Add durable review entities:
  - `DraftCommentThread`
  - `DraftComment`
  - `DraftSuggestion`
  - `DraftCheckpoint` if checkpoint metadata cannot fit cleanly inside generalized `DraftVersion`
- Reuse `Artifact` for AI-originated proposals rather than introducing a second proposal system.

### Anchor model
- Anchor comments and suggestions to stable block IDs first.
- Use text-range offsets only as secondary precision inside a block.
- Keep a textual fallback snippet for recovery when a block changes significantly.

### Backward compatibility
- Current section-based draft content migrates into a single document with section wrapper blocks.
- Existing `contentBySection` data remains importable during migration.
- References continue to compile from current citation compiler until the manuscript compiler takes over final reference rendering.

## Reuse vs New
### Reuse
- `next-app/app/project/[id]/draft/page.tsx`
  - route ownership, shell embedding, project copilot integration, local draft boot path
- `next-app/lib/draftStorage.ts`
  - local-first durability concepts
- `next-app/lib/citation-compiler.ts`
  - citation normalization/reference derivation logic
- `next-app/lib/server/drafts.ts`
  - current draft persistence entry point
- `next-app/lib/server/draft-versions.ts`
  - immutable history foundation
- `next-app/lib/server/agent/artifacts.ts`
  - proposal/apply/undo path for AI changes
- `docs/plans/plan-context-capture.md`
  - selection-scoped actions and popup/copilot handoff model

### New
- `next-app/types/manuscript.ts`
  - semantic manuscript types and schema versioning
- `next-app/lib/manuscript/**`
  - schema helpers, block transforms, anchors, compiler, compare utilities, migration helpers
- `next-app/components/draft/**`
  - modular drafting UI components instead of a large route-local monolith
- New server services for comments, suggestions, checkpoints, and export compilation

## Implementation Design and Touched Paths
### Primary paths that will change
- `next-app/app/project/[id]/draft/**`
  - route shell, layout, interactions, drawers, rail composition, editor orchestration
- `next-app/components/**`
  - shared comment/thread, suggestion, dialog, and history primitives where appropriate
- `next-app/lib/**`
  - manuscript schema, serialization, compiler, diff/compare helpers, citation/evidence integration
- `next-app/lib/server/**`
  - persistence, versioning, export pipeline, comment/suggestion/checkpoint services
- `next-app/app/actions/**`
  - server actions for save/export/review mutations
- `next-app/prisma/**`
  - when durable review entities or generalized history schema are introduced

### Design boundary
The draft route should no longer own the full editor domain in one file. Route-level orchestration stays there; document model, transforms, review logic, and compiler logic move into shared domain modules.

## Long-Term Quality, Scalability, and Operability
### Maintainability
- The manuscript schema must be versioned explicitly.
- Migration helpers must exist for stored older draft shapes.
- UI logic must be decomposed into focused drafting components and domain helpers.

### Scalability
- Comments, suggestions, and history should be queryable without loading the full manuscript diff state into the client at once.
- Export compilation should run through a dedicated server-side path that can scale independently from client editing.

### Reliability
- Local-first draft state remains required.
- Recovery from crashes and failed sync must be explicit and testable.
- Restore/undo must work for destructive actions and accepted AI edits.

### Operability
- Export jobs need honest progress and failure reporting.
- History/restore actions need audit-friendly metadata.
- Compiler errors should point to manuscript objects, not generic "export failed" states.

### Security and compliance posture
- Ledger remains the canonical evidence set for drafting.
- Drafting stays within current single-user product posture unless PRD changes.
- Provenance for AI-originated suggestions must remain inspectable.

## Delivery Tracks
These are implementation tracks for one target state, not separate product versions.

### `DRX-001` Manuscript domain model and migration foundation
- Define `ManuscriptDocument`, block types, anchors, and schema versioning.
- Add migration from current `DraftState.contentBySection` into the manuscript model.
- Keep save/load backward compatible during transition.
- Blast radius: high; touches persistence, editor orchestration, and export assumptions.

### `DRX-002` Draft canvas shell and structural navigation
- Establish the single canonical manuscript editor, structure mapping, and section-aware document model underneath the route.
- Add stable section and block identity, manuscript outline extraction, and section-level transforms.
- Preserve project-shell embedding and mobile-safe layout contracts.
- Blast radius: high UI change concentrated in the draft route.
- Historical note (March 13, 2026): the first route implementation exposed the manuscript model directly as the primary UX. That foundation stays useful, but the shell direction was too manuscript-first for actual drafting and was later corrected.

### `DRX-002R` Draft visual reset with one left utility drawer
- Correct the first `DRX-002` shell implementation so the manuscript becomes visually primary again.
- Replace the permanent draft-owned structure and context rails with one host-owned left utility drawer.
- Reserve the right side exclusively for the existing project copilot shell; draft does not add a second right-side panel.
- Historical note (March 14, 2026): this reset improved clutter but still removed the section-first drafting workflow users needed. It is retained as an intermediate correction, not the final drafting direction.

### `DRX-003` Seeded section-first drafting restore
- Restore the older usable drafting interaction model on top of the canonical manuscript model, using `ead2ac8` as the interaction baseline rather than as a literal code restore source.
- Fresh routes restore the older seeded section scaffold and open in `Section` mode.
- Restore top section tabs, real `Section` / `Full Draft`, and the dedicated left Evidence Ledger.
- Keep right-side ownership exclusively in the existing project copilot shell.
- Treat `Whole draft` freeform content as a compatibility target in `Full Draft`, while keeping named sections as the primary tabbed workflow.
- Preserve manuscript normalization, citation compilation, export entrypoint, and project-shell embedding.
- Blast radius: high UI correction concentrated in the draft route plus draft-state normalization.
- Implementation note (March 17, 2026): the route baseline is the restored section-first shell. `Section` and `Full Draft` are route-level projections over one normalized manuscript state, fresh routes reopen with the seeded section scaffold, `Whole draft` remains available for compatibility, and the left Evidence Ledger is the only draft-owned support surface. Compact/mobile hardening remains a follow-on concern, but desktop stays anchored to the restored section-first baseline.

### `DRX-004` Comments, suggestions, and checkpoints
- Introduce review entities, anchor model, review rail, suggestion mode, and compare/restore UI.
- Generalize history from backend-only `DraftVersion` to first-class draft UX.
- Blast radius: high across UI, server, and DB.

### `DRX-005` Citation and evidence authoring system
- Replace detection-only citation warnings with repairable diagnostics.
- Add citation palette, source preview, evidence coverage views, claim support linking, and reference integrity checks.
- Blast radius: medium/high; reuses ledger and citation compiler heavily.

### `DRX-006` AI proposal lane inside drafting
- Move AI assistance from generic side actions toward inline draft operations and proposal review.
- Reuse artifacts for propose/apply/undo and make draft-page review first-class.
- Blast radius: medium/high; touches artifact UX, context capture, and draft interactions.

### `DRX-007` Compiler-grade export and submission packaging
- Replace placeholder DOCX flow with real compiler output and truthful export history.
- Add export validation, journal/profile rules, and accurate generated-file lifecycle.
- Blast radius: high; touches backend, file storage, and user trust.

### `DRX-008` Mobile, accessibility, and performance hardening
- Validate drawer strategy, touch targets, keyboard/focus behavior, a11y announcements, large-document rendering, and local retention limits.
- Blast radius: medium; must run across draft, shell, and shared primitives.

### `DRX-009` Observability, triage, and supportability
- Add logging/telemetry for save conflicts, export failures, restore events, suggestion accept/reject flows, and unresolved diagnostics.
- Define fast repro paths and first triage boundaries for export, comments, and history regressions.
- Blast radius: medium; cross-cuts UI and backend.

## Risks, Failure Modes, and Rollback
### Primary risks
- Schema migration introduces draft-state incompatibility.
- Review anchors drift after structural edits.
- Compiler pipeline lags behind editor capability and creates false "ready to export" confidence.
- Large documents degrade client performance if block virtualization and history loading are not bounded.

### Detection signals
- Save/load mismatches between local and server state
- Comments or suggestions attached to missing anchors
- Export files with incorrect structure or missing citations
- Frequent recovery prompts or local restore events
- Large draft render latency and editor typing lag

### Rollback posture
- Each delivery track must preserve the ability to read legacy draft shapes until migration is proven stable.
- Export rewrite should ship behind an implementation flag until generated files and storage paths are verified end to end.
- History and suggestion entities should be additive first; do not delete legacy paths until restore and compare are trustworthy.

## Verification Strategy
### Test matrix
- Happy path
  - create manuscript, write blocks, cite studies, save, restore, export
- Edge cases
  - delete/reorder sections with comments and citations attached
  - offline/local-first editing and later sync
  - restore prior checkpoint after multiple AI proposals
  - export with unresolved issues in warn vs strict profiles
- Regression scenarios
  - project-shell embedding
  - mobile/coarse pointer behavior
  - citation numbering and reference compilation
  - artifact apply/undo for draft proposals

### Test layers
- Unit
  - manuscript transforms, anchors, migration helpers, compiler steps, compare logic
- Integration
  - save/load, comments/suggestions/checkpoints services, export generation path
- Route/UI
  - draft page interactions, destructive-action safety, keyboard flows, mobile drawers
- Contract
  - export file existence and metadata truthfulness, version/checkpoint semantics

### Acceptance signals
- Draft opens with the seeded section scaffold and `Section` mode active.
- Draft can be edited in either `Section` or `Full Draft` mode without forking the underlying normalized manuscript.
- The left Evidence Ledger stays usable while drafting and can collapse/reopen without a draft-owned right panel.
- Citation and claim-support issues are actionable, not merely displayed.
- AI changes are always reviewable and reversible.
- Export produces real files with accurate history metadata.
- Restore/checkpoint behavior works for both manual and AI-driven changes.

## Validation Mapping
### Planning task
- No code changed in this planning task, so no code validation gate is required.

### Future implementation gates by work type
- UI changes
  - `cd next-app && npx tsc --noEmit`
  - `cd next-app && npx vitest run`
  - catches type regressions, route behavior regressions, and shared component breakage
- DB/schema changes
  - `cd next-app && bash scripts/db-ops.sh diagnose`
  - `cd next-app && npx prisma validate`
  - `cd next-app && npx prisma migrate status`
  - catches schema drift, migration state errors, and invalid schema changes
- Production/export-critical changes
  - follow `docs/runbooks/db-ops.md` and `docs/plans/db-production-runbook.md` if migrations are involved
  - run manual generated-file verification for DOCX/PDF outputs in addition to automated tests

## Debuggability and Triage
### Failure surface signals
- UI: saving/export/history/comment banners and inline diagnostic badges
- Logs: export compiler stage failures, anchor resolution failures, history restore errors
- Telemetry: export success rate, restore success rate, unresolved diagnostic counts, large-draft render latency

### Fast reproduction path
- Create a seed project with:
  - at least 10 studies
  - 6 populated manuscript sections
  - cross-section citations
  - one table block
  - one figure block
  - open comments and suggestions
- Reproduce on desktop and mobile layouts before triage deep-dives.

### First triage boundaries
- Editor shape / layout bugs -> draft route + component domain
- Save/history bugs -> manuscript schema + draft persistence services
- Suggestion/comment bugs -> anchor model + review services
- Export bugs -> compiler + file storage path

## Assumptions and Defaults
- LitRev remains single-user in product contract for now, but the draft review model should be multi-actor-safe in its data design.
- The ledger remains the canonical evidence source; drafting does not create a second evidence authority.
- The current Tiptap foundation remains the default unless a future implementation spike proves a direct BlockNote adoption materially better without compromising semantics.
- Journal-specific export rules are profile-driven and additive; the manuscript model itself should stay journal-agnostic.

## Recently Completed
- `DRX-003` restored the seeded section-first drafting baseline on top of the canonical manuscript model, bringing back top tabs, real `Section` / `Full Draft`, and the left Evidence Ledger while keeping the right side copilot-only.
- `DRX-002R` shipped the one-left-drawer manuscript shell and removed the draft-owned right panel from the route; it remains documented as an intermediate correction that `DRX-003` superseded.
- [x] `DRX-001` Defined the canonical manuscript schema, stable block identity, and `DraftState v2` migration contract. Draft save/load now normalize legacy payloads into a canonical manuscript document plus `contentBySection` compatibility projection, and direct draft writers use the same normalizer.

## Active Tasks
- [x] `DRX-002` Establish the canonical manuscript document and structural editing foundation.
- [x] `DRX-003` Restore the draft route to the seeded section-first drafting baseline with a left Evidence Ledger.
- [ ] `DRX-004` Add first-class comments, suggestion mode, checkpoints, and compare/restore.
- [ ] `DRX-005` Add citation palette, evidence coverage, claim support diagnostics, and repair flows.
- [ ] `DRX-006` Move AI drafting actions into inline proposal/review flows.
- [ ] `DRX-007` Build the real compiler/export pipeline and truthful export history.
- [ ] `DRX-008` Certify mobile, accessibility, and large-document performance for the draft surface.
- [ ] `DRX-009` Add telemetry, logging, and supportable failure states for drafting operations.
