# Citation Strategy

This document captures product and architecture orientation for inline citations and reference-list generation across LitRev draft and chat surfaces. It is intentionally not an implementation plan. The goal is to clarify the strongest direction, the current app gap, and the best open-source references to borrow from.

## Current App State

LitRev already has substantial draft-side citation infrastructure:

- Draft has a real TipTap citation node in [next-app/app/project/[id]/draft/DraftEditors.tsx](/Users/yaacovcorcos/LitRev_2026/.worktrees/citation-strategy/next-app/app/project/[id]/draft/DraftEditors.tsx).
- Draft compiles citation nodes into ordered references and validates ledger linkage in [next-app/lib/citation-compiler.ts](/Users/yaacovcorcos/LitRev_2026/.worktrees/citation-strategy/next-app/lib/citation-compiler.ts).
- Draft auto-generates the references section from cited studies in [next-app/app/project/[id]/draft/page.tsx](/Users/yaacovcorcos/LitRev_2026/.worktrees/citation-strategy/next-app/app/project/[id]/draft/page.tsx).
- Export already treats references as derived output rather than hand-authored content in [next-app/app/project/[id]/draft/useDraftExport.ts](/Users/yaacovcorcos/LitRev_2026/.worktrees/citation-strategy/next-app/app/project/[id]/draft/useDraftExport.ts).

The main gap is that chat does not share that same model:

- Chat currently relies on prompt rules that force clickable DOI or PMID links at first mention in [next-app/lib/ai/prompts/copilot-prompts.ts](/Users/yaacovcorcos/LitRev_2026/.worktrees/citation-strategy/next-app/lib/ai/prompts/copilot-prompts.ts).
- Chat also has an optional hidden `MENTIONED_STUDIES` metadata comment, but that is still weaker than a true shared citation model.

So the app is not missing citations entirely. It is missing one shared citation architecture that both draft and chat can use.

## Core Orientation

The correct direction is to stop treating citations as formatted text and instead treat them as structured references owned by the app.

- The model should not own final citation formatting.
- The model should produce citation intent: which study or studies are being cited, plus optional locator or surrounding context.
- The app should own citation rendering.
- The app should synthesize reference lists from cited studies, not trust the model to write bibliography text directly.
- Citation style should be a rendering concern, not a prompt concern.

That means draft and chat should converge on one shared internal citation layer:

- `study` remains the canonical evidence entity.
- `citation mention` becomes a structured reference to one or more studies.
- `citation renderer` becomes the style-aware formatter.
- `reference synthesizer` builds bibliography output from citation mentions plus study metadata.
- Surface adapters render this for draft, chat, and export.

## Strongest Architecture Direction

LitRev should preserve the current draft citation-node system and extend it rather than replace it.

The likely best end-to-end shape is:

- Keep `studyId` as the canonical internal key for evidence.
- Add a CSL-JSON-compatible projection for each ledger study.
- Introduce a shared citation object model that supports:
  - single citation
  - citation cluster
  - locator or page reference
  - prefix or suffix text
  - style-independent ordering
  - rendered-label caching if useful
- Make chat messages carry structured citation metadata rather than only markdown links or `MENTIONED_STUDIES`.
- Generate chat inline citations and the final references block from that structured metadata after the model produces its answer.
- Let draft continue using TipTap citation nodes, but shift long-term bibliography rendering toward a CSL-based renderer instead of only the local string formatter in [next-app/lib/citations.ts](/Users/yaacovcorcos/LitRev_2026/.worktrees/citation-strategy/next-app/lib/citations.ts).
- Keep the references section derived by default. Manual reference editing should not be the main model.

This preserves the strongest existing asset in LitRev, which is that citations in draft already map to ledger studies structurally.

## What the App Already Does Well

These existing pieces are worth preserving:

- Citation nodes in draft are already structural rather than plain text.
- Reference numbering is already computed across sections.
- Missing-study and missing-metadata validation already exists.
- The references section is already treated as generated output.
- Study IDs already provide a durable internal anchor across draft and ledger.

This is a better base than most apps have. The right move is not a rewrite. It is convergence.

## Main Gap to Close

The app currently has two citation systems:

- Draft uses structural citations.
- Chat uses prompt-enforced links.

That split will create drift unless both surfaces use the same citation contract.

The high-level problem is not formatting. It is ownership:

- today the draft owns citations structurally
- today the chat mostly leaves them to prose conventions

The architecture should make the app own citations everywhere.

## Open-Source References Worth Borrowing From

### Manubot

Best reference for scholarly writing with citations derived from identifiers rather than manually maintained bibliography text.

Why it matters:

- Strong model for deriving references from citekeys and metadata.
- Strong model for separating writing content from bibliography rendering.
- Useful for thinking about manuscript-grade citation pipelines.

Reference:

- [manubot/manubot](https://github.com/manubot/manubot)

What to steal:

- The idea that references are generated from structured identifiers, not trusted as freeform authored bibliography text.
- The idea that metadata normalization should happen upstream of final rendering.

### Citation.js

Best reference for a JavaScript-native metadata and formatting layer.

Why it matters:

- Fits the TypeScript stack.
- Converts multiple source formats into CSL-JSON.
- Supports bibliography rendering in multiple styles.

References:

- [Citation.js docs](https://citation.js.org/)
- [citation-js/citation-js](https://github.com/citation-js/citation-js)

What to steal:

- Use CSL-JSON as the durable citation metadata shape.
- Use a renderer layer rather than hardcoding citation formatting logic for every style.

### Citation Style Language

Best reference for the standard itself.

Why it matters:

- Prevents LitRev from inventing a proprietary citation schema or formatting system.
- Gives a standards-based path for APA, Vancouver, Chicago, and similar styles.

References:

- [citation-style-language/schema](https://github.com/citation-style-language/schema)
- [citation-style-language/styles](https://github.com/citation-style-language/styles)

What to steal:

- The metadata contract.
- The style/rendering model.

### Curvenote Editor

Best reference for a modern scientific editor where citations are first-class authoring objects, not string hacks.

Reference:

- [curvenote/editor](https://github.com/curvenote/editor)

What to steal:

- Editor-level treatment of citations and references as structured document entities.
- UX patterns for scientific authoring inside a ProseMirror-style editor.

### JupyterLab Citation Manager

Best reference for keeping citation items separate from citation placements while keeping bibliography synchronized.

Reference:

- [krassowski/jupyterlab-citation-manager](https://github.com/krassowski/jupyterlab-citation-manager)

What to steal:

- Store bibliographic items once.
- Store citation placements separately.
- Build bibliography from placements plus item metadata.

That separation maps well onto LitRev:

- ledger study = bibliographic item
- citation node or chat citation span = placement
- references section = synthesized output

### PaperQA

Best reference for AI answers grounded in scientific evidence with explicit citation behavior.

Reference:

- [Future-House/paper-qa](https://github.com/Future-House/paper-qa)

What to steal:

- Separate retrieval evidence from answer prose.
- Treat evidence attribution as a first-class output contract.
- Use grounded source objects instead of trusting prose-only citation generation.

### LARS

Useful reference for source-grounded chat UX and provenance display.

Reference:

- [abgulati/LARS](https://github.com/abgulati/LARS)

What to steal:

- Reader-facing citation affordances in chat.
- Source-grounded answer presentation instead of weak “trust the model text” behavior.

### BibLib

Useful reference for CSL-JSON-centric storage and bibliography handling.

Reference:

- [callumalpass/obsidian-biblib](https://github.com/callumalpass/obsidian-biblib)

What to steal:

- Use CSL-JSON as the durable metadata form.
- Keep references interoperable and structured.

### Better BibTeX and Citation Picker Workflows

These are more workflow references than direct product analogs, but still useful.

References:

- [retorquere/zotero-better-bibtex](https://github.com/retorquere/zotero-better-bibtex)
- [chrisgrieser/alfred-bibtex-citation-picker](https://github.com/chrisgrieser/alfred-bibtex-citation-picker)

What to steal:

- Citekey-generation ideas.
- Fast insertion workflows.
- The idea that citation insertion should be fast and ergonomic, not buried.

## Best Conceptual Model for LitRev

The strongest conceptual model is:

1. Ledger studies are the canonical evidence inventory.
2. Every citation in any surface points back to one or more ledger studies.
3. Chat and draft both emit structured citation placements.
4. Reference lists are generated from those placements.
5. Citation style is applied at render or export time.

This would let LitRev support:

- inline citations in draft
- inline citations in chat
- generated references at the end of a chat answer
- generated references in the draft
- consistent export behavior
- future citation-style switching without rewriting content

## Specific Things To Avoid

- Do not let the model free-write the reference list and treat it as canonical.
- Do not keep separate citation semantics for chat and draft.
- Do not make DOI links the citation model. Links are transport, not structure.
- Do not make prompt rules the main enforcement mechanism for citation correctness.
- Do not leave `MENTIONED_STUDIES` as the permanent citation contract. It is too weak for locators, clusters, and bibliography synthesis.
- Do not rely long-term on handwritten style formatters alone if CSL-based rendering is available.

## Practical Bottom Line

LitRev is already stronger on draft citations than many comparable products. The real missing step is unifying citation ownership across surfaces.

The strongest direction is:

- preserve the existing draft citation-node system
- add a shared structured citation contract
- project ledger studies into a CSL-friendly metadata shape
- render inline citations and references from app-owned structured data
- make chat use the same citation layer as draft

The best places to borrow architecture and implementation ideas from are:

- Manubot for identifier-first scholarly writing
- Citation.js and CSL for metadata normalization and style rendering
- Curvenote and JupyterLab Citation Manager for structured editor and bibliography synchronization patterns
- PaperQA and LARS for evidence-grounded chat citation behavior

## Source Links

- [Manubot](https://github.com/manubot/manubot)
- [Citation.js docs](https://citation.js.org/)
- [Citation.js GitHub](https://github.com/citation-js/citation-js)
- [CSL schema](https://github.com/citation-style-language/schema)
- [CSL styles](https://github.com/citation-style-language/styles)
- [Curvenote editor](https://github.com/curvenote/editor)
- [JupyterLab Citation Manager](https://github.com/krassowski/jupyterlab-citation-manager)
- [PaperQA](https://github.com/Future-House/paper-qa)
- [LARS](https://github.com/abgulati/LARS)
- [BibLib](https://github.com/callumalpass/obsidian-biblib)
- [Better BibTeX](https://github.com/retorquere/zotero-better-bibtex)
- [Alfred Citation Picker](https://github.com/chrisgrieser/alfred-bibtex-citation-picker)
