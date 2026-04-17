# Draft Authoring Platform Plan (Supporting)

## Purpose
This is the supporting implementation plan for rebuilding LitRev's draft surface into a scientist-grade authoring platform.

The canonical draft-domain owner remains [plan-drafting-experience.md](./plan-drafting-experience.md). This file exists to make the next rebuild decision-complete and execution-ready, with a deliberate bias toward non-AI writing quality first while preserving the seams needed for inline AI, artifacts, checkpoints, and evidence-aware operations later.

The core intent is simple:
- LitRev Draft must become an excellent place to write a scientific paper even when AI is never used.
- AI and agentic features must be designed in from the start so we do not create a beautiful editor that later fights the runtime.

## Product Contract Boundary
This plan changes how LitRev delivers drafting, not what LitRev is for.

No `PRD.md` change is required. The target still fits the current product contract:
- evidence-backed authoring
- auditable AI support
- section-based drafting and revision
- export to shareable manuscript formats
- verification workflows for unsupported or weakly supported claims

## Overall Goal
Rebuild the draft route around one strong editorial core instead of continuing to layer features onto a light note-style editor.

The end state is a manuscript authoring platform with:
- excellent typing, selection, navigation, and formatting feel
- first-class scientific objects such as citations, figures, tables, equations, and cross-references
- honest local-first reliability and large-document performance
- review-grade comments, suggestions, checkpoints, and compare/restore
- agent-ready document anchors, proposal lanes, and provenance contracts that fit naturally into the editor instead of hijacking it

## Goal + Scope
### Problem statement
The current draft route has several strong foundations already shipped, but the writing experience itself is still too weak for serious paper authoring:
- the live editor in `next-app/app/project/[id]/draft/DraftEditors.tsx` is still essentially `StarterKit + Underline + Citation`
- the route in `next-app/app/project/[id]/draft/page.tsx` still owns too much editor orchestration, save logic, mode switching, and projection logic
- formatting comfort controls exist today, but they are modeled as per-section draft state rather than as a clean separation between user writing preferences and document semantics
- scientific authoring primitives such as figures, tables, equations, cross-references, footnotes, and strong review flows are still missing
- reliability, speed, and recovery are not yet at the level needed for a user to trust LitRev as their primary manuscript tool

### Intended outcome
LitRev Draft becomes the best place in the product for a scientist to:
- think in prose
- structure a manuscript
- link claims to evidence
- insert scientific objects without friction
- revise with confidence
- export a real paper

This must hold true with AI disabled, while also leaving room for:
- inline AI proposal review
- evidence-aware drafting actions
- citation repair and claim-support workflows
- artifact-backed undo/restore

### In scope
- Draft route rebuild strategy
- Editorial-quality interaction model
- Scientific authoring object model and insertion flows
- Reliability, local-first durability, and large-document performance
- Review/history/checkpoint model
- Agent-ready anchors, proposal flows, and context-capture seams
- Execution slices, acceptance gates, and rollback boundaries

### Out of scope
- Replacing the repo-wide project shell
- Replacing the global chat/runtime architecture
- Turning LitRev into a generic wiki/PKM tool
- Making real-time multi-user collaboration a product requirement now
- Making code-first or LaTeX-first authoring the primary editing model

## Governance and Repo Grounding
### AGENTS routing for this planning task
- This file lives under `docs/plans/**`, so `planning-governance-specialist.md` governs the edit.
- No `PRD.md` update is needed because this is implementation planning for draft delivery, not a change to product contract.

### Required retrieval for future implementation
- UI/editor work
  - Tier 2: `docs/agents/specialists/frontend-ui-specialist.md`
  - Tier 3: `docs/architecture/frontend-quality-bar.md`, `docs/runbooks/frontend-review-loop.md`, `docs/plans/README.md`
- Draft domain owner
  - `docs/plans/plan-drafting-experience.md`
- Backend/schema/export work
  - `docs/plans/plan-backend.md`
  - `docs/runbooks/db-architecture.md` and `docs/runbooks/db-ops.md` if schema changes occur
- Agent/runtime compatibility
  - `docs/plans/plan-agentic.md`
  - `docs/plans/plan-agent-quality.md`
  - `docs/plans/plan-context-capture.md`
- Performance/reliability
  - `docs/plans/plan-speed-performance.md`

### Relationship to existing plans
- `plan-drafting-experience.md` remains the canonical draft-domain owner.
- This plan is the execution companion for the next rebuild program and should be treated as the detailed implementation map for `DRX-010` in the canonical plan.
- The completed `DAP-00` baseline now lives in [2026-04-16-draft-benchmark-baseline.md](../reviews/2026-04-16-draft-benchmark-baseline.md), with durable assets in `next-app/lib/draft-benchmark/**`, `next-app/test/fixtures/draft/**`, and `next-app/scripts/draft-benchmark/**`.
- `plan-agentic.md` remains authoritative for runtime and artifact behavior, while `plan-agent-quality.md` owns the release/eval posture for risky draft-side agent changes; this plan may constrain draft-side integration seams but must not fork runtime truth.

### Draft UI planning and approval contract
- Any visible draft UI or interaction change in this plan is approval-gated.
- Before implementing any such slice, prepare a separate UI-planning checkpoint with the user covering layout, visuals, changed behaviors, edge states, and how the change will be verified.
- Do not start implementation of the UI-changing slice until the user explicitly authorizes that UI plan.
- Do not hide UI changes inside reliability, editor-foundation, or feature slices; if the user will see a different draft surface, call it out separately first.

### Current-state evidence
- `next-app/app/project/[id]/draft/page.tsx`
  - Current route still owns projection logic, local-first boot, save timing, multi-editor registration, route-state sync, selection actions, and layout orchestration in one large file.
- `next-app/app/project/[id]/draft/DraftEditors.tsx`
  - Current editor foundation is intentionally light and lacks scientific or review-grade primitives.
- `next-app/app/project/[id]/draft/DraftToolbar.tsx`
  - Current formatting controls expose font, font size, line spacing, and paragraph spacing, but these are persisted as section formatting state rather than being cleanly separated into user comfort preferences versus document/export semantics.
- `next-app/app/project/[id]/draft/draft-studio.module.css`
  - Current route already has editor comfort CSS variables, but the surrounding interaction model remains limited.
- `next-app/lib/server/drafts.ts`, `next-app/lib/server/draft-versions.ts`, `next-app/lib/server/draft-checkpoints.ts`
  - Strong persistence, immutable versioning, and checkpoint foundations already exist and should be reused.
- `next-app/lib/server/agent/artifact-handler-registrations.ts`
  - `draft_diff` already has a real apply/restore/checkpoint contract; future inline AI must build on this rather than inventing a second mutation path.
- `next-app/lib/citation-compiler.ts`
  - Citation normalization and reference generation already exist and should remain part of the semantic backend path, not route-local UI logic.
- `docs/plans/plan-speed-performance.md`
  - Draft is explicitly called out as a local-first surface with growing editor payloads and no central retention policy yet.

## Editorial Principles
The rebuild should preserve these rules:

1. Non-AI quality is the first gate.
   The editor must be great before AI features are considered done.
2. One manuscript, one editor truth.
   Section focus, full manuscript, and page preview are projections over one canonical document, not separate editors with shadow state.
3. Writing comfort is not document semantics.
   Font family, line height, paragraph spacing, page width, focus mode, and similar comfort settings belong to editorial view preferences unless the user explicitly chooses an export/template profile.
4. Scientific objects are first-class.
   Citations, figures, tables, equations, footnotes, supplements, and cross-references cannot be bolted on as text hacks.
5. Evidence remains canonical.
   The ledger remains the evidence authority for included studies, but the manuscript must also support non-ledger bibliography items for background methods/guidelines without letting them masquerade as included evidence.
6. Review is part of drafting, not a later afterthought.
   Suggestions, comments, checkpoints, compare/restore, and unresolved issues must be native to the authoring flow.
7. AI is assistive, reviewable, and reversible.
   Draft mutations remain artifact-backed, anchored, explicit, and inspectable.
8. The route should orchestrate, not own the editor domain.
   Editor model, transforms, anchors, review logic, and save/recovery state belong in shared draft/manuscript modules.
9. Boring reliability beats cleverness.
   Prefer native browser/platform strengths such as spellcheck, IME behavior, clipboard fidelity, and straightforward persistence boundaries before inventing custom editor machinery.
10. No silent data loss.
   Save, import, export, suggestion apply, and restore paths must either succeed truthfully or leave behind an explicit recoverable state with operator-visible diagnostics.
11. Interoperability is adoption, not polish.
   Scientists must be able to bring existing drafts, references, and style expectations into LitRev without re-authoring everything from zero.

## External Benchmark and Intake
### Adoption lanes

| Donor | Primary use for LitRev | Adoption shape | Licensing posture |
|---|---|---|---|
| [TypeCellOS/BlockNote](https://github.com/TypeCellOS/BlockNote) | Block UX, slash/mention menus, comment UI patterns, block-side actions | Selective borrow or local rewrite; no wholesale adoption | MPL core; treat as boundary-aware |
| [umodoc/editor](https://github.com/umodoc/editor) | Pagination, page/web layout, Word-like editing ergonomics, comments/collab patterns | Strong implementation donor for interaction ideas; code reuse only after file-level license review | MIT with additional attribution expectations in project docs |
| [fiduswriter/fiduswriter](https://github.com/fiduswriter/fiduswriter) | Academic writing product behavior, cross-references, tracked changes, offline merge posture | Reference-only for product/behavior; reimplement locally | AGPL-3.0 |
| [stencila/stencila](https://github.com/stencila/stencila) | Scholarly schema thinking, suggestions/provenance model, canonical document representation | Direct schema/architecture donor and selective code idea donor | Apache-2.0 |
| [quarto-dev/quarto-cli](https://github.com/quarto-dev/quarto-cli) | Citation, figure/table/equation, cross-reference, manuscript/export semantics | Reimplement semantics; selectively adapt code/utilities where it fits | MIT |
| [jupyter-book/mystmd](https://github.com/jupyter-book/mystmd) | Scientific markdown semantics, cross-reference thinking, publish pipeline ideas | Reference and selective donor | MIT |
| [typst/typst](https://github.com/typst/typst) | Figure/table reference quality, bibliography model, typesetting/export ambition | Reference and selective donor | Apache-2.0 |
| [citation-style-language/styles](https://github.com/citation-style-language/styles) | Breadth benchmark for journal citation styles and style-distribution expectations | Consume compatible style data with attribution; do not fork style logic casually | CC BY-SA 3.0 |
| [toeverything/blocksuite](https://github.com/toeverything/blocksuite) | Headless collaborative editor architecture, CRDT-first component patterns | Reference and selective donor | MPL-2.0 |
| [toeverything/AFFiNE](https://github.com/toeverything/AFFiNE) | Linked-block/document workflow patterns, local-first ideas | Reference-first | Mixed/MIT + MPL dependencies |
| [AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | Tree/block data structures, editor architecture, local-first collaboration thinking | Reference-only | AGPL-3.0 |
| [outline/outline](https://github.com/outline/outline) | Comments, revision history, find/replace, calm UX, large-doc performance discipline | Reference-only | BSL/source-available |
| [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js) | Semantic DOCX-to-HTML intake benchmark for headings, lists, tables, images, notes, and comments | Selective donor or local rewrite inside a trusted import boundary | BSD-2-Clause |

### Product lessons we are explicitly adopting
- Umo shows that page mode and web mode can coexist on top of a Tiptap-based editor and materially improve serious-document feel.
- BlockNote shows that slash menus, suggestion menus, block insertion, and extensible block UI can be implemented without reinventing the entire editor foundation.
- Fidus Writer shows that academic authoring requires cross-references, tracked changes, comments, and offline/conflict merge honesty, not just richer formatting.
- Quarto and Typst show that figures, tables, equations, citations, and section references must be semantic objects with automatic numbering and reference integrity.
- Stencila shows that suggestions, provenance, and structured scholarly node types should be modeled explicitly, especially if AI will later edit the document.
- Outline shows that calm UI, find/replace, comments, revision history, and large-document performance are quality features, not polish.
- Zotero's official citation workflows show that search-first citation insertion, multi-item citations, locators, prefixes/suffixes, bibliography refresh, and style switching are baseline scholarly-writer expectations rather than advanced power-user features.
- The CSL ecosystem shows that LitRev should architect around style-compatible bibliography rendering instead of hardcoding one long-term citation format.
- Mammoth shows that semantic DOCX intake is feasible if LitRev treats imports as structured conversion with honest downgrade reporting rather than as pixel-fidelity recreation.

### Product lessons we are explicitly rejecting
- No office-suite iframe/embed as the primary editor.
- No generic wiki/database sprawl inside the manuscript route.
- No code-first authoring as the default manuscript UX.
- No AI-first writing flow where chat compensates for weak core editing.

## Chosen Strategy
### Core decision
Keep LitRev in the ProseMirror/Tiptap family, but rebuild the draft route around:
- one canonical manuscript editor
- explicit scientific object semantics
- user-scoped editorial preferences
- route-thin orchestration
- artifact-compatible AI seams

### Why this is the smallest reversible approach
- The repo already has Tiptap, a normalized manuscript state, citation compilation, checkpoint/version foundations, and artifact-backed draft mutation.
- A full editor-family migration would consume most of the effort before we improve writing feel.
- We can borrow product patterns from stronger tools while keeping LitRev-local semantics, types, and runtime contracts.

### Alternatives considered
- Direct BlockNote adoption
  - Rejected as the primary foundation because LitRev needs more custom scientific semantics and tighter evidence/runtime integration than an out-of-the-box block editor gives us.
- Full Umo adoption/embed
  - Rejected because it is Vue-first and would move LitRev toward a separate embedded product rather than a native draft surface.
- Office-suite embedding
  - Rejected because it would outsource core product identity and complicate evidence-aware semantics.
- Code/LaTeX-first editing
  - Rejected because the primary authoring experience must remain accessible to ordinary researchers.

## Decision-Complete Implementation Design
### 1. Experience architecture
The new draft surface should support five tightly related experiences over one manuscript:
- `Focus section`
  - the default fast-writing mode for evidence-heavy work on one section
- `Manuscript canvas`
  - one continuous editable manuscript for flowing through the paper
- `Page preview`
  - pagination, margins, and print-aware preview for serious paper feel
- `Review`
  - comments, suggestions, checkpoints, unresolved issues
- `Submission`
  - export checks, journal profile validation, unresolved-blocker review

The existing `Section` / `Full Draft` distinction should evolve into these projections over one editor, not continue as separate editor populations.

### 2. One canonical editor instance
The rebuild should remove the current “editor per visible section” approach.

Target contract:
- one canonical ProseMirror/Tiptap editor instance owns the editable manuscript tree
- section focus is a projection/filter/navigation mode over that tree
- page mode and manuscript mode are display/layout variants over the same editor state
- non-editable mirrors and inspectors may exist, but editing authority remains singular

This change is foundational for:
- predictable selection behavior
- reduced synchronization bugs
- less JSON diff churn
- lower typing/render cost on long documents
- cleaner AI anchor targeting

### 3. Separate three kinds of state
The rebuild must stop mixing these concerns:

1. `Authoring semantics`
   - manuscript blocks, citations, objects, anchors, comments, suggestions
2. `Editorial comfort preferences`
   - page width, web/page mode, font family, font size, line spacing, paragraph spacing, focus mode, inspector visibility, keyboard hints
3. `Export/template rules`
   - journal profile, numbering rules, bibliography style, page size, heading treatment, submission checks

Rules:
- editorial comfort belongs to user-scoped view state by default
- export/template rules belong to explicit document/export profiles
- authoring semantics remain journal-agnostic canonical manuscript truth

### 4. Manuscript object model
Extend the current manuscript model so the editor can represent first-class objects instead of text conventions.

Required object families:
- structural
  - section
  - heading
  - paragraph
  - list
  - block quote
  - callout/note
  - footnote/endnote
- scholarly inline
  - ledger-linked citation
  - auxiliary bibliography citation
  - cross-reference
  - defined term / abbreviation anchor
- scholarly block
  - figure
  - table
  - equation
  - claim block
  - evidence summary block
  - supplementary / appendix block
- review/provenance
  - comment anchor
  - suggestion anchor
  - checkpoint marker
  - agent operation anchor

### 5. Citation model
The citation system should explicitly support two classes of references:

1. `ledger-linked evidence citations`
   - tied to study identities in the project ledger
   - may power claim support diagnostics and evidence coverage
2. `auxiliary bibliography citations`
   - for methods papers, reporting guidelines, background references, or external sources not part of the included-study ledger
   - must remain visually and semantically distinct from evidence-linked citations where needed

Rules:
- ledger remains the evidence authority
- auxiliary references are allowed, but cannot silently satisfy evidence-linked diagnostics
- citation insertion should use a command palette with search and preview, not manual bracket typing
- prefix, suffix, locator, and citation mode must be supported from the data model forward

### 6. Scientific object flows
The rebuild must include real insertion/editing flows for:
- figures
  - upload/select asset
  - caption
  - label
  - alt text
  - source/provenance metadata
- tables
  - editable grid
  - paste from CSV/TSV/clipboard
  - caption
  - label
  - optional table notes
- equations
  - LaTeX-style input path at minimum
  - numbered block equations
  - inline math
  - cross-reference labels
- cross-references
  - sections
  - figures
  - tables
  - equations
  - supplements/appendices

### 7. Writing-quality features that are mandatory
These are not “nice to have” for the rebuild:
- smooth typing and selection
- strong undo/redo trust
- slash menu / insertion command palette
- floating selection toolbar
- keyboard shortcut system
- outline/document map
- find and replace
- clean heading flows
- paste normalization from Word/Docs/Markdown
- page mode and web mode
- focus mode / reduced chrome mode
- honest save/sync state
- crash recovery and reopen safety

### 8. Reliability and local-first design
Current localStorage-first durability is not enough for the target experience.

Target durability contract:
- move durable local manuscript state to IndexedDB-backed storage
- keep only small route boot hints in localStorage if needed
- use one explicit save/sync state machine
- preserve recoverable local edits across tab crash or transient network loss
- keep checkpoint-safe recovery before risky operations

Target user-visible states:
- saving
- saved
- saved locally, sync pending
- sync delayed
- conflict needs review
- export generating
- export failed

### 9. Review/history design
The rebuild should make review-grade editing native:
- comment threads anchored to stable ranges/blocks
- suggestion mode for insert/replace/delete/restructure
- named checkpoints
- compare current vs checkpoint
- restore section or whole manuscript
- unresolved issue lanes for comments, broken references, missing captions, unsupported claims

### 10. Agent-ready seams from day one
AI work should not block editorial-core delivery, but the rebuild must make future AI integration safe.

Required seams:
- stable block/object IDs
- stable range/block anchors
- artifact-backed draft operations remain canonical
- checkpoints before destructive or multi-block applies
- structured context-capture targets for block/range/object selection
- provenance fields for AI-originated suggestions, citations, tables, and summaries
- clear distinction between `proposal`, `applied`, `rejected`, and `restored`

### 11. Draft runtime integration model
Draft-side AI should eventually use four lanes:

1. `selection transforms`
   - rewrite, shorten, expand, convert bullets <-> prose
2. `evidence transforms`
   - support claim, add citations, summarize selected studies, propose evidence table
3. `structural transforms`
   - scaffold section, propose outline move, convert section shape
4. `review transforms`
   - propose suggestion set, explain comment thread, prepare checkpoint summary

All four lanes must:
- return reviewable proposals
- use artifact/checkpoint contracts from `plan-agentic.md`
- avoid silent mutation
- preserve exact document anchors

### 12. Manuscript metadata and compliance
The manuscript system should treat front matter and submission metadata as first-class structured data, not as ad hoc text blocks.

Required metadata families:
- identity
  - title
  - running title / short title
  - abstract or structured abstract
  - keywords
- authorship
  - ordered author list
  - affiliations
  - corresponding author
  - contact email
  - ORCID where available
  - optional contributor roles
- disclosure and compliance
  - acknowledgements
  - funding
  - conflict-of-interest statement
  - ethics/IRB statement where relevant
  - registration number where relevant
  - data availability
  - code availability
- publication profile
  - manuscript type
  - journal/export profile
  - reporting guideline or checklist profile where relevant

Rules:
- metadata should live in structured manuscript state and compile into exports
- journal/reporting profiles should constrain rules and validation, not fork the editor into separate products
- evidence-synthesis profiles such as PRISMA-aligned checks should be possible where they fit the product without turning the core editor into a narrow single-template flow

### 13. Reference and bibliography interoperability
Scholarly drafting quality depends heavily on citation ergonomics and bibliography trust.

The reference system should support:
- search-first insertion by title, author, year, DOI, PMID, PMCID, or other identifiers where provider coverage exists
- multi-item citations
- locator support
- prefix and suffix support
- citation-mode controls from the data model forward
- bibliography refresh and repair flows
- cited-vs-uncited visibility
- duplicate or near-duplicate auxiliary reference detection
- missing metadata repair workflows

Style architecture rules:
- LitRev should remain CSL-compatible at the style/profile boundary instead of hardcoding one permanent bibliography format
- Vancouver can remain the current baseline profile, but style switching must be architecturally supported
- bibliography rendering, numbering, and style validation should remain compiler-owned rather than route-owned

Interoperability rules:
- optional Zotero-compatible ingest or sync lanes should be possible later without making a Zotero account mandatory
- common research bibliography formats such as RIS, BibTeX, CSL JSON, and EndNote XML should be treated as planned adapters where they materially improve adoption

### 14. Import and manuscript intake
If LitRev aims to become a primary writing surface, it must allow existing drafts to enter the system.

Initial intake targets:
- existing LitRev legacy draft state -> canonical manuscript migration
- semantic DOCX intake from trusted uploads
- Markdown-family intake where practical, especially LitRev-compatible Markdown, Quarto-like content, and MyST-like structures
- high-fidelity paste intake from Word, Google Docs, Markdown, HTML tables, CSV/TSV, and plain text

Import contract:
- preserve structure first: headings, paragraphs, lists, tables, images, notes, comments, and links where possible
- detect citations where possible and convert them into semantic references; when full conversion is not possible, create explicit unresolved external-reference markers instead of silent plain-text loss
- generate an import report that distinguishes:
  - preserved faithfully
  - downgraded but usable
  - unresolved / needs review
- create a checkpoint before import apply
- never overwrite the current manuscript without preview, confirmation, and recovery
- sanitize untrusted import surfaces and avoid running unsafe embedded content

### 15. Deliberate simplicity constraints
The rebuild must stay ambitious on user quality and conservative on architecture.

We should explicitly not build:
- a full office-suite ribbon or app-within-app experience
- a generic plugin marketplace in the first rebuild
- real-time multi-user collaboration as a prerequisite for shipping the editorial core
- a second hidden editor authority for page mode, review mode, or AI mode
- journal-specific forked editors that duplicate the manuscript core

We should explicitly prefer:
- native browser spellcheck and dictionary integration before bespoke grammar machinery
- one anchor model for comments, suggestions, context capture, and AI applies
- paginated view as a presentation over canonical manuscript state, not the storage model itself
- gradual feature-flagged rollout over one irreversible big-bang replacement

### 16. World-class acceptance bar
The rebuild should not ship because features exist; it should ship because the authoring experience clears a measurable quality bar.

Target quality bars:
- no silent data loss across write, reload, crash recovery, import, export, or AI apply
- normal manuscript editing on target desktop hardware should keep text input and cursor movement visually immediate, with no perceptible multi-second stalls
- large manuscript editing should stay usable under heavy citation/object load, with explicit budgets tracked in `DAP-00`
- local save acknowledgement should feel near-instant and remote settlement should expose truthful pending/degraded states instead of pretending success
- command palette, citation search, find/replace, and outline navigation should open quickly enough to feel interactive rather than modal
- moving sections or objects must not corrupt numbering, references, comments, suggestions, or AI anchors
- style/profile switching must be reversible and should not mutate canonical authoring semantics unexpectedly
- import paths must fail honestly with structured downgrade reporting rather than silently flattening scholarly structure

Quality bars should be made concrete in `DAP-00` with:
- fixture-specific latency budgets
- export parity expectations
- recovery success criteria
- anchor-stability thresholds
- import-conversion acceptance reports

### 17. Test and rollout system
This rebuild needs a stronger proof system than the average UI project.

Mandatory automated coverage families:
- schema and transform unit tests for manuscript nodes, numbering, references, and migrations
- property/fuzz tests for random edit sequences, undo/redo, section reorder, and anchor stability
- bibliography golden tests across supported style profiles
- compiler/export golden tests for DOCX/Markdown/PDF-oriented intermediates and metadata projection
- clipboard and import corpus tests using representative Word/Docs/Markdown/table fixtures
- persistence and save-state fault-injection tests for offline, delayed-sync, crash, and conflict flows
- route-level end-to-end authoring journeys for write -> reload -> recover -> review -> export
- performance harness runs on seeded short/medium/large manuscript corpora
- browser-matrix smoke verification for Chromium, WebKit, and Firefox

Mandatory rollout controls:
- feature flag for `Draft VNext`
- internal dogfooding on live manuscripts before broad rollout
- fixture-based migration rehearsal before any canonical-state migration
- canary rollout with telemetry review
- fallback route retained until the new surface proves recovery, export, and anchor stability

### 18. Proposed file/module shape
This is the preferred decomposition target:

```text
next-app/app/project/[id]/draft/
  page.tsx                      # route shell only
  loading.tsx
  error.tsx

next-app/components/draft/
  shell/
  editor/
  outline/
  insert/
  review/
  submission/
  rails/

next-app/lib/manuscript/
  schema/
  projections/
  transforms/
  anchors/
  citations/
  bibliography/
  metadata/
  import/
  objects/
  review/
  checkpoints/
  compare/
  export/

next-app/lib/draft-authoring/
  editor-prefs.ts
  local-cache.ts
  save-state-machine.ts
  commands.ts
  perf.ts
```

## Practical Impact Translation
### User experience
- writing feels like using a real manuscript editor, not a chat-adjacent notes field
- scientists can control their drafting comfort without corrupting export semantics
- citations, figures, tables, and equations feel inserted rather than improvised
- existing drafts and references can enter the system through honest import/interoperability paths instead of forcing greenfield adoption
- AI becomes a native optional assistant instead of the main way to compensate for weak tooling

### Runtime/system behavior
- one editor authority simplifies state, selection, saves, and AI targeting
- local-first durability becomes more scalable than large localStorage snapshots
- manuscript semantics become richer without pushing export responsibility into the client route

### Operational/support impact
- support can reason about save conflicts, anchor failures, and export issues with explicit states
- telemetry can distinguish editor lag, sync delay, object insertion failures, and AI apply issues
- checkpoint and artifact provenance remain inspectable for recovery

## Long-Term Quality and Scalability
### Maintainability
- route logic shrinks
- editor domain moves into reusable modules
- authoring semantics and comfort preferences stop contaminating each other

### Scalability
- one editor + semantic object model scales better than many editable section instances
- IndexedDB durability and explicit retention policy reduce local payload fragility
- comments/suggestions/checkpoints become queryable entities rather than route-local state tricks

### Reliability
- crash recovery, delayed sync, and checkpoint restore are designed in
- section/full/page views stop competing for editing authority
- artifact-backed AI keeps mutation truth consistent

### Operability
- editor and sync states become supportable
- export and review failures can point to exact object/anchor causes
- perf work can benchmark one editor path rather than multiple inconsistent ones

### Security and compliance
- ledger remains evidence authority
- auxiliary citations are explicit, not silent evidence bypasses
- AI provenance remains inspectable and reversible
- self-hosting/privacy posture stays compatible with stronger local-first durability

## Execution Slices
The detailed slices below should be treated as the active implementation map for `DRX-010`.

Shared gate for all slices:
- if a slice changes visible draft UI or interaction behavior, it must stop for a separate user-reviewed UI-planning checkpoint before implementation begins
- no visual draft change ships under this plan without explicit user authorization after that checkpoint

### `DAP-00` Benchmark corpus, spike, and acceptance harness
Implementation note (April 16, 2026): this slice shipped as a non-visual baseline. LitRev now has a committed draft benchmark corpus, import fixtures, acceptance budgets, benchmark scripts, and a durable decision note in `docs/reviews/2026-04-16-draft-benchmark-baseline.md`.
- Build a manuscript fixture pack:
  - short paper
  - medium review
  - large evidence-heavy manuscript
  - object-heavy manuscript with figures/tables/equations/comments/checkpoints
  - metadata-heavy manuscript with authorship/disclosure fields
  - import corpus covering DOCX, Markdown, Word/Docs paste, and bibliography files
- Validate:
  - one-editor feasibility
  - page/web mode approach
  - IndexedDB durability path
  - command/slash menu design
  - cross-browser behavior on Chromium/WebKit/Firefox
- Output:
  - chosen editor architecture
  - latency budget
  - anchor-stability budget
  - import downgrade policy
  - rollout and fallback criteria
  - fallback plan if pagination implementation underperforms
- Blast radius: low/medium

### `DAP-01` Draft VNext shell and one-editor core
Implementation note (April 17, 2026): the first minimal-change foundation pass shipped. The current draft shell remains visually familiar, but the route now has an explicit `DraftSupportPanel` seam for the future left context panel, a dedicated rollout flag (`isDraftVNextMinimalChangeEnabled`), and draft snapshots/local persistence now synchronize back into canonical manuscript state instead of treating the manuscript model as passive metadata. The larger shell/controller split and stronger one-editor projection model still remain before `DAP-01` can be considered fully complete.
- Create a new draft surface behind a feature flag rather than mutating the existing route in place.
- Reduce route responsibilities to shell/layout/URL state.
- Build one canonical manuscript editor with section-focus and manuscript projections.
- Preserve current project shell, copilot embedding, and export hooks.
- Prepare the current left Evidence Ledger lane to evolve into a shared context panel with:
  - `Evidence`
  - `Assets`
  - `Pages`
  - `Review`
- Blast radius: high, approval-gated UI change
- Approval gate:
  - this slice changes visible draft behavior and must be explicitly approved before implementation
  - implementation must wait for a separate user-reviewed UI plan for the shell, layout, and changed interaction model

### `DAP-02` Editorial comfort and writing-quality foundation
- Add:
  - page mode / web mode
  - focus mode
  - clean formatting toolbar
  - writer preference panel
  - slash/command insertion menu
  - outline/document map
  - find and replace
  - improved paste normalization
  - keyboard shortcut layer
  - section folding and fast section reorder/navigation affordances
  - native spellcheck/scientific-dictionary-friendly authoring behavior
- Remove/replace awkward section-formatting persistence with user-scoped comfort preferences.
- Blast radius: high, approval-gated UI change
- Approval gate:
  - implementation must wait for a separate user-reviewed UI plan for visible toolbar, preference, command, outline, and writing-surface behavior changes

### `DAP-03` Scientific object, bibliography, and metadata system
- Add:
  - ledger-linked citation palette
  - auxiliary bibliography items
  - bibliography inspector and repair flows
  - style/profile-aware bibliography rendering contract
  - figures
  - tables
  - equations
  - footnotes/endnotes
  - cross-references
  - manuscript metadata panel
  - author/affiliation/disclosure metadata support
  - journal and reporting profile scaffolds
- Reuse existing compiler where possible, but move the editor to semantic object insertion.
- Blast radius: high across editor, schema, export
- Approval gate:
  - any visible insertion UI, metadata panel, bibliography inspector, or profile surface changes must be separately planned with the user before implementation

### `DAP-03A` Import and interoperability
Implementation note (April 17, 2026): this slice shipped as a non-UI foundation. LitRev now has canonical draft-import contracts under `next-app/lib/draft-import/**`, bibliography adapters for `CSL JSON` / `RIS` / `BibTeX`, manuscript intake for `DOCX` / Markdown / HTML / CSV / TSV, checkpoint-safe reconciliation and apply orchestration under `next-app/lib/server/draft-imports.ts`, and fixture-backed verification plus benchmark-corpus coverage. Durable memory now lives in [2026-04-17-draft-import-interoperability.md](../reviews/2026-04-17-draft-import-interoperability.md).
- Add:
  - DOI/PMID-first reference add flows where provider support exists
  - bibliography import adapters for prioritized formats
  - checkpointed DOCX and Markdown intake path with import reports
  - legacy draft-state migration helpers and fixture validation
- Require:
  - downgrade visibility instead of silent flattening
  - security review for import surfaces
  - bibliography/object reconciliation with the canonical manuscript schema
- Blast radius: medium/high across import, bibliography, compiler, and editor

### `DAP-04` Reliability, sync, and large-document performance
- Move local-first persistence to IndexedDB
- Introduce save/sync state machine
- Add crash/reopen recovery flow
- Add document retention/compaction rules
- Add large-document render and typing budgets
- Add failure-injection coverage for offline, conflict, and restart recovery paths
- Blast radius: medium/high

### `DAP-05` Review-grade editing
- Add:
  - comment threads
  - suggestion mode
  - checkpoints UI
  - compare/restore
  - unresolved issue surfaces
- Reuse existing checkpoint/version foundations instead of inventing new storage paths.
- Blast radius: high
- Approval gate:
  - comment, suggestion, checkpoint, compare, and unresolved-issue surfaces require a separate user-reviewed UI plan before implementation

### `DAP-06` Agentic drafting lane
- Add:
  - selection-scoped AI actions
  - evidence-aware actions
  - structural proposal actions
  - review/repair actions
- Require:
  - artifact-backed proposal creation
  - block/range anchor resolution
  - checkpoint-safe apply/undo
  - context-capture receipts for selections/objects
- Blast radius: medium/high across draft + runtime integration
- Approval gate:
  - any new visible AI action surface, proposal UI, inline controls, or review affordances must be separately planned with the user before implementation

### `DAP-07` Submission, export, and journal profiles
- Add:
  - page-aware export preview
  - journal profile selection
  - reporting-guideline and submission-check surfaces where relevant
  - submission validation
  - figure/table/equation/reference linting
  - high-quality DOCX/PDF parity checks
- Blast radius: medium/high
- Approval gate:
  - any visible preview, validation, profile-selection, or submission UI changes require a separate user-reviewed UI plan before implementation

### `DAP-08` Mobile, accessibility, telemetry, and supportability
- Harden:
  - drawer/sheet model for small screens
  - touch targets
  - keyboard navigation
  - screen-reader announcements
  - browser-matrix support expectations
  - telemetry for authoring and recovery states
  - support runbooks for common draft failures
- Blast radius: medium

## Risk + Rollback
### Primary failure modes
- one-editor migration breaks section/full projection assumptions
- richer object model outruns export/compiler support
- local durability migration causes reopen inconsistencies
- anchor drift breaks comments/suggestions/AI applies
- page mode adds layout cost that harms typing

### Detection signals
- typing latency regressions
- anchor resolution failures
- restore mismatch incidents
- export object omission or numbering mismatch
- import downgrade spikes or unresolved-reference spikes
- unresolved local-vs-server sync divergence

### Rollback path
- keep the current draft route as fallback behind a flag until `DAP-04` is stable
- ship object-model additions additively where possible
- gate page mode separately if necessary
- do not retire the current route until:
  - editorial-core acceptance passes
  - crash recovery is proven
  - export parity is verified

## Verification Strategy
### Happy path
- create manuscript
- import an existing manuscript and review the import report
- write across multiple sections
- switch between section focus, manuscript canvas, and page mode
- insert ledger citation, auxiliary citation, figure, table, equation
- save, reload, recover, checkpoint, export

### Edge cases
- long manuscript with many objects
- offline or delayed network edits
- restore after figure/table insertion
- comment/suggestion anchors after section reorder
- AI proposal on text that changed before apply
- IME composition and spellcheck on citation-heavy prose
- style/profile switch on a metadata-heavy manuscript
- DOCX intake with partial citation conversion

### Regression scenarios
- project shell embedding
- draft route URL state
- copilot side-panel coexistence
- artifact apply/undo
- DOCX/Markdown export fidelity
- import downgrade/reporting truthfulness
- bibliography style/profile switching

### Acceptance signals
- a user can draft a full paper in LitRev without AI and not feel blocked by the editor
- writing comfort preferences feel strong and do not leak into document semantics accidentally
- scientific objects are inserted and referenced semantically
- existing drafts and reference libraries can enter LitRev through honest, reviewable intake paths
- local-first recovery is trustworthy
- AI proposal flows fit the editor instead of fighting it

## Validation Mapping
### Planning task
- No code changed beyond plan/governance docs, so no code validation gate is required for this task.

### Future implementation gates
- UI/editor behavior slices:
  - `cd next-app && npm run lint`
  - `cd next-app && npx tsc --noEmit`
  - `cd next-app && npx vitest run`
  - `cd next-app && npm run lint:styles` when CSS changes
- Schema/export slices:
  - `cd next-app && bash scripts/db-ops.sh diagnose`
  - `cd next-app && npx prisma validate`
  - `cd next-app && npx prisma migrate status`
- Performance slices:
  - route-specific perf checks from `docs/plans/plan-speed-performance.md`
- Acceptance harness slices:
  - manuscript fixture corpus, import corpus, export goldens, and browser-journey tests must pass before widening the feature flag
- Why these gates matter:
  - lint/typecheck catch editor contract drift and projection bugs
  - vitest catches transform/persistence/route regressions
  - Prisma gates catch schema drift for review/checkpoint/comment entities
  - perf checks catch typing and load regressions before they become user trust failures
  - fixture and browser journeys catch the regressions users feel most sharply: import loss, anchor drift, broken restore, and unreliable export

## Debuggability + Triage
### Failure surface signals
- UI
  - save/sync banners
  - unresolved issue badges
  - anchor repair notices
  - export blocker summaries
- Logs/telemetry
  - editor load time
  - typing latency
  - save duration
  - local recovery count
  - anchor resolution failures
  - import downgrade counts and unresolved external reference counts
  - export object-validation failures
  - AI proposal apply failures by anchor kind

### Fast reproduction path
Maintain a seeded draft fixture with:
- 10+ included studies
- 6+ populated sections
- 20+ citations
- figures, tables, and equations
- open comments/suggestions
- at least one AI proposal and one checkpoint

### First triage boundaries
- typing/selection/layout bugs
  - draft editor core
- save/reopen/sync bugs
  - local cache + save state machine + draft persistence service
- object insertion bugs
  - manuscript object transforms + export compiler
- AI apply/undo bugs
  - artifact handlers + manuscript anchors + checkpoint restore

## Assumptions and Defaults
- LitRev remains single-user in product contract for now, but review/comment data should remain multi-actor-safe.
- The first rebuild should optimize for desktop/laptop writing and degrade honestly on mobile rather than pretending equal parity.
- The canonical editor family remains ProseMirror/Tiptap unless `DAP-00` proves otherwise with strong repo-local evidence.
- Auxiliary citations are allowed, but ledger-linked evidence remains the only citation class that satisfies evidence-support workflows by default.
- Zotero interoperability is strategically valuable, but the first rebuild must not depend on external Zotero login to provide a strong citation experience.
- UI-changing execution slices in this plan are approval-gated under the draft UI rule in `plan-drafting-experience.md`.

## Recently Completed
- [x] `DAP-00` Shipped the draft benchmark baseline: committed manuscript and import corpora, acceptance-budget helpers, runnable benchmark scripts, anchor/export verification tests, and a durable decision note now exist before `Draft VNext` implementation begins.
- [x] `DAP-03A` Shipped the non-UI import/interoperability foundation: LitRev now has server-owned draft import orchestration, canonical import/report contracts, bibliography adapters, manuscript intake for the prioritized formats, checkpoint-safe reconciliation, and fixture-backed verification without shipping visible import UI yet.

## Active Tasks
- [ ] `DAP-01` Draft VNext shell and one-editor core
- [ ] `DAP-02` Editorial comfort and writing-quality foundation
- [ ] `DAP-03` Scientific object, bibliography, and metadata system
- [ ] `DAP-04` Reliability, sync, and large-document performance
- [ ] `DAP-05` Review-grade editing
- [ ] `DAP-06` Agentic drafting lane
- [ ] `DAP-07` Submission, export, and journal profiles
- [ ] `DAP-08` Mobile, accessibility, telemetry, and supportability
