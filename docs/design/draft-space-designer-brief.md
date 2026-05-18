# Draft Space Designer Brief

This brief is for a product designer creating the draft space experience for LitRev. It is not a wireframe, visual direction, or component specification. It describes what the draft space must help users do, what the product must preserve, and what future capabilities the design should be able to grow into.

The designer should feel free to rethink the page architecture, interaction model, navigation, workflow sequencing, and feature grouping from first principles. The only hard boundaries are the product truths, user needs, and trust requirements below.

## 1. Product Purpose

LitRev is a scientific writing workspace for turning evidence review work into a defensible manuscript. The draft space is where a user moves from gathered studies, extracted findings, and AI-assisted reasoning into a paper that can actually be revised, cited, exported, and trusted.

The draft space must be excellent even if the user never uses AI. AI should feel like a powerful assistant layered onto a serious scientific authoring environment, not the reason the authoring environment exists.

The core promise:

- A user can write a real scientific manuscript from start to finish.
- Every important claim can be connected back to evidence.
- Citations, references, review comments, AI edits, versions, and exports remain understandable and recoverable.
- The user always knows what changed, why it changed, and whether it is safe to keep.

## 2. Audience And Use Context

The primary user is a medical or scientific author working on evidence-based writing. In the current product, this is optimized for a serious solo researcher/clinician first, with later room for collaboration.

The user may be:

- Writing a literature review, systematic review, clinical background, methods section, discussion, or manuscript draft.
- Working from a structured project that already contains studies, evidence extraction, and source material.
- Moving back and forth between reading evidence, making claims, drafting prose, checking citations, revising arguments, and exporting.
- Using AI sometimes, heavily, or not at all.
- Returning after interruptions, app reloads, crashes, context switches, or multi-day gaps.
- Needing enough trust to use the output in academic or clinical writing.

Important mindset:

- The user is often expert in the domain, not necessarily in the tool.
- They need control more than spectacle.
- They need speed while writing, but also traceability when reviewing.
- They need the system to respect uncertainty, evidence gaps, and incomplete work.

## 3. Design Freedom

The designer is not being asked to preserve the current visual layout. The current product has a working section-first draft page, but the design should not be treated as a constraint unless a behavior is explicitly marked as a product requirement.

The designer may propose:

- A different information architecture for drafting, evidence, review, import, export, and AI support.
- A different way to move between section-level focus and whole-manuscript context.
- A different interaction model for citations, comments, suggestions, checkpoints, and AI proposals.
- A different feature hierarchy, provided the core writing jobs remain fast and trustworthy.
- A staged design that begins with current implementation constraints and grows toward the long-term manuscript platform.

Avoid designing this as:

- A generic AI chat page.
- A generic notes app.
- A generic office-suite clone.
- A document editor with evidence features bolted on as an afterthought.
- A research dashboard where the actual writing surface is secondary.

## 4. Current Product Baseline

The current draft page already supports a functional manuscript workflow:

- Drafts are organized around manuscript sections.
- A fresh draft can be seeded with standard scientific sections.
- The user can focus on one section or inspect the full draft.
- Section order and custom sections can be changed.
- A rich text editor is already in place using a ProseMirror/Tiptap foundation.
- Basic formatting, headings, lists, quotes, undo/redo, and text-direction support exist.
- Citations can be inserted as structured inline objects linked to evidence records.
- A draft support surface currently focuses on the Evidence Ledger.
- The Evidence Ledger can show evidence used by the active section and allow evidence to be cited or removed.
- References are generated from citations rather than manually authored as free text.
- Export supports a compiler-style path for DOCX and Markdown, with export history foundations.
- Save behavior already includes local-first protections and backend synchronization.
- There are backend foundations for draft versions, checkpoints, citation compilation, import contracts, and AI artifact application.

Current weaknesses the design should help us overcome:

- The experience still feels like a basic editor, not a mature manuscript workspace.
- Evidence, citations, references, comments, AI suggestions, history, and export validation are not yet unified into one coherent authoring model.
- Scientific objects such as figures, tables, equations, cross-references, abbreviations, appendices, and supplement material are not first-class in the visible experience.
- Review flows such as comments, suggestions, accept/reject, compare, restore, and issue resolution are not yet native.
- Citation insertion and evidence coverage are not yet powerful enough for heavy scientific writing.
- Import and bibliography support exist underneath the product but are not yet a visible, trusted workflow.
- The current implementation has too much orchestration in the route-level page and is moving toward a cleaner one-manuscript architecture.

The design should respect what already works, but it should not be trapped by the current page structure.

## 5. Long-Term Product Direction

The target is a manuscript operating system for evidence-based writing.

Long-term, the draft space should support multiple projections of the same canonical manuscript rather than separate documents:

- Focused section writing.
- Whole manuscript drafting.
- Page or submission preview.
- Evidence and citation review.
- Comments and suggestion review.
- Version and checkpoint history.
- Export and submission preparation.

These should feel like different ways of working with the same manuscript, not disconnected pages with duplicated state.

The manuscript itself should eventually have stable identities for sections, blocks, claims, citations, comments, figures, tables, equations, suggestions, checkpoints, and AI operations. The designer does not need to define the data model, but the experience should assume that users can act on precise pieces of a manuscript, not only on the whole document.

## 6. Core User Jobs

### Start Or Resume A Draft

The user needs to:

- Create or open a draft without setup friction.
- Understand whether the draft is empty, partially drafted, or already export-ready.
- See what section or manuscript area they were last working on.
- Recover safely after reloads, crashes, sync delays, or interruptions.
- Know whether any local work has not yet synced.

### Write In Flow

The user needs to:

- Type and edit comfortably for long sessions.
- Use familiar manuscript actions without hunting.
- Move between prose, lists, headings, citations, and structured scientific content.
- Use keyboard-first interactions where appropriate.
- Paste content from documents or web sources without corrupting the draft.
- Find and replace text.
- Undo and redo reliably.
- Work without AI being required.

### Work By Section

The user needs to:

- Focus on one manuscript section when writing.
- Understand the role and status of each section.
- Add, rename, remove, reorder, or customize sections.
- Know whether a section has evidence, comments, unresolved issues, export problems, or AI proposals.
- Move quickly between section-level work and manuscript-level context.

### See The Whole Manuscript

The user needs to:

- Read the draft as a continuous paper.
- Understand flow, repetition, missing pieces, and transitions across sections.
- Edit without losing the relationship to section structure.
- See generated references in context while understanding that references are derived from citations.
- Avoid confusion about whether section view and whole draft view are separate copies.

### Use Evidence While Writing

The user needs to:

- Find relevant studies or extracted evidence while drafting.
- Attach evidence to a section, claim, paragraph, table, figure, or other manuscript object.
- Insert citations from evidence without manual formatting work.
- Preview enough source/evidence detail to decide whether it supports the claim.
- Understand which evidence is already used and where.
- Detect claims that lack support.
- Detect evidence that is cited repeatedly, inconsistently, or in the wrong context.

### Manage Citations And References

The user needs to:

- Insert citations quickly from the evidence ledger or auxiliary bibliography.
- Edit citation details such as locator, prefix, suffix, citation mode, and ordering when needed.
- Distinguish evidence-linked citations from bibliography-only citations.
- Know when a citation cannot be resolved.
- Generate references from citations.
- Validate references before export.
- Avoid manually maintaining a reference list that can drift from the manuscript.

### Create Scientific Objects

The user needs first-class support for:

- Tables.
- Figures.
- Equations.
- Footnotes.
- Cross-references.
- Appendices and supplement material.
- Abbreviations or term definitions.
- Evidence summary blocks.
- Claim blocks or other reviewable assertions.

The design should treat these as manuscript objects with actions, metadata, references, and review states, not merely styled paragraphs.

### Review And Revise

The user needs to:

- Leave comments anchored to stable manuscript content.
- Review suggestions without losing the surrounding writing context.
- Accept, reject, or modify suggested changes.
- Compare current text with prior versions or checkpoints.
- Restore a section or whole draft when needed.
- Resolve comments, evidence issues, citation issues, and export issues.
- Understand whether an issue is informational, blocking, or requires author judgment.

### Use AI Safely

AI must support author control. It should never silently rewrite or commit important manuscript changes.

The user needs AI to:

- Draft from selected evidence or study summaries.
- Rewrite, shorten, expand, clarify, or change tone.
- Convert bullets to prose and prose to structured outlines.
- Suggest citations for a claim.
- Flag unsupported claims.
- Summarize evidence into tables or paragraphs.
- Help with section-specific tasks such as methods, results, limitations, or discussion.
- Explain what it changed and what evidence it used.
- Produce proposals the user can accept, reject, edit, or save for later.

The user needs to know:

- What context AI used.
- Whether AI used evidence from the project or general model knowledge.
- Which text would change before accepting.
- Whether a change creates citation or evidence problems.
- How to undo or compare the result.

### Import Existing Work

The user needs to bring in existing materials without losing trust:

- Existing draft text from DOCX, Markdown, HTML, or legacy draft formats.
- Bibliographies from CSL JSON, RIS, or BibTeX.
- Tables or structured data from CSV or TSV.
- Existing references that may not yet be linked to the evidence ledger.

The import experience needs to show what was recognized, what was changed, what could not be mapped, and what requires review.

### Export And Submit

The user needs to:

- Export to formats such as DOCX, Markdown, PDF, or future submission-oriented outputs.
- Validate citations, references, unresolved comments, missing evidence, broken cross-references, and incomplete objects before export.
- Understand whether export problems are blocking or advisory.
- Keep an export history.
- Reproduce or inspect what manuscript state an export came from.
- Eventually target journal or template-specific requirements.

## 7. Required Experience Capabilities

### Manuscript State Awareness

At all times, the user should be able to understand:

- What manuscript they are editing.
- What section or object is active.
- Whether changes are saved locally, syncing, synced, delayed, conflicted, or failed.
- Whether there are unresolved citation, evidence, comment, suggestion, or export issues.
- Whether an AI proposal is pending, applied, rejected, or stale.

This awareness should not require the user to inspect developer-like details. It should be clear enough for a writer to trust.

### Action Hierarchy

The design should separate:

- Frequent writing actions.
- Contextual manuscript actions.
- Evidence and citation actions.
- Review and history actions.
- Export and submission actions.
- Dangerous actions.

No visible control should appear active if it does nothing. Risky actions such as deleting sections, accepting large AI changes, overwriting content, restoring checkpoints, or removing linked evidence should require appropriate confirmation, preview, or undo.

### Multiple Levels Of Context

The draft experience needs to support actions on:

- The whole manuscript.
- A section.
- A paragraph or block.
- A text selection.
- A claim.
- A citation.
- A figure, table, equation, or cross-reference.
- A comment or suggestion thread.
- An evidence item.

The designer should account for users switching between these scopes without confusion.

### Issue And Review System

The design should eventually support a unified way to surface and resolve:

- Unsupported claims.
- Missing citations.
- Broken citation references.
- Duplicate or inconsistent evidence use.
- Unresolved comments.
- Pending AI suggestions.
- Export blockers.
- Import warnings.
- Conflicts between local and synced versions.

The user should be able to work issue-by-issue or stay in writing flow and return later.

### Reliability And Recovery

The draft space must make data loss feel extremely unlikely.

The user needs:

- Immediate local persistence for committed edits.
- Clear backend sync status.
- Protection during reloads, route changes, tab closes, and crashes.
- Conflict handling that preserves both sides until the user decides.
- Checkpoints before high-risk operations.
- Recoverable AI changes.
- Export history tied to manuscript state.

When the system is degraded, the manual writing experience should remain usable as much as possible.

### Accessibility And Responsiveness

The draft space must support serious long-form work:

- Keyboard navigation.
- Screen-reader-friendly labeling and state.
- Visible focus behavior.
- Accessible comments, suggestions, citations, and menus.
- Usable small-screen workflows for review, reading, light editing, citation checking, and status inspection.
- Reduced reliance on hover-only affordances.

Mobile does not need to replicate every desktop authoring workflow, but it should not become a broken or misleading version of the product.

## 8. Pages And Surfaces To Consider

The designer may decide whether these are separate pages, modes, panels, flows, overlays, or states. The important part is that each job has a coherent home.

### Draft Home / Main Authoring Space

Primary place for writing, navigating manuscript structure, using evidence, invoking AI, and understanding manuscript status.

Must support:

- Starting and resuming work.
- Section-level focus.
- Whole-manuscript context.
- Evidence and citation access.
- Save/sync confidence.
- Fast writing actions.
- Clear path to review and export.

### Evidence And Citation Workspace

Place to inspect evidence use across the draft.

Must support:

- Finding evidence.
- Seeing where evidence is used.
- Inserting citations.
- Identifying unsupported claims.
- Distinguishing evidence-linked citations from auxiliary references.
- Resolving citation issues.

### Review Workspace

Place to process comments, suggestions, AI proposals, issue lists, and checkpoints.

Must support:

- Threaded comments.
- Suggestions with accept/reject/modify.
- Compare and restore.
- AI proposal review.
- Issue filtering and resolution.
- Author confidence before applying changes.

### Import Flow

Place to bring external manuscript and bibliography material into LitRev.

Must support:

- Clear pre-import expectations.
- Post-import report.
- Mapping review.
- Warnings for ambiguous or unmapped content.
- Safe rollback or checkpointing.

### Export / Submission Flow

Place to prepare manuscript output.

Must support:

- Format selection.
- Preflight validation.
- Export progress and errors.
- Export history.
- Relationship between export and manuscript version.
- Future journal/template requirements.

### Preferences And Document Rules

Place to distinguish writing comfort from document semantics.

Must support:

- User writing preferences such as comfortable text settings.
- Manuscript rules such as citation style, reference behavior, section model, and export template.
- Avoiding accidental conversion of personal comfort settings into manuscript content.

## 9. Objects The Designer Should Understand

These are not necessarily visual components. They are conceptual objects users may need to inspect, create, act on, or understand.

- Manuscript: the canonical draft document.
- Section: a named manuscript unit such as Introduction or Methods.
- Block: a stable unit of content such as paragraph, heading, list, table, figure, equation, or claim.
- Claim: an assertion that may need evidence support.
- Evidence item: a project-backed study or extracted evidence record.
- Ledger citation: a citation linked to project evidence.
- Auxiliary citation: a bibliography citation not yet linked to project evidence.
- Reference list: generated output from citations.
- Comment: author or reviewer note anchored to manuscript content.
- Suggestion: proposed change that can be accepted, rejected, or modified.
- AI proposal: AI-generated suggested edit or insertion with provenance.
- Checkpoint: named recoverable manuscript state.
- Version: saved section or manuscript history record.
- Import report: record of what was imported, changed, mapped, or left unresolved.
- Export: generated file tied to a manuscript state.
- Issue: actionable problem or warning related to evidence, citations, comments, suggestions, sync, or export.

The experience should make these objects feel connected, not like separate subsystems.

## 10. Non-Negotiable Product Truths

- The draft is a manuscript, not a chat transcript.
- Manual writing quality comes first.
- AI is optional, reviewable, reversible, and never silently authoritative.
- Evidence-linked citations are central to trust.
- References are generated from citations.
- A single manuscript truth should underlie section focus, whole-draft view, review, preview, and export.
- The user must never wonder whether two views contain different copies of the draft.
- No silent data loss.
- No hidden destructive changes.
- No source-less claim should be treated as equally trustworthy as an evidence-backed claim.
- Import, AI, and export must tell the user what happened when something is uncertain.
- The current implementation must remain usable while the future experience is introduced.

## 11. Open Design Problems

The designer should propose solutions for:

- How should the product let users move between focused section writing and whole-paper thinking?
- How should evidence be available during writing without overwhelming the author?
- How should citation insertion feel fast for simple cases and precise for complex cases?
- How should unresolved issues be visible without turning the page into a checklist instead of a writing space?
- How should AI proposals be reviewed in a way that feels powerful but never unsafe?
- How should comments, suggestions, checkpoints, and history relate to one another?
- How should import warnings and bibliography mismatches be made understandable?
- How should export validation help the user finish, not just block them?
- How should the product support long writing sessions, quick returns, and interrupted work?
- How should mobile support serious review and light editing without pretending to be the full desktop workspace?

## 12. Desired Designer Deliverables

The ideal design output should include:

- Information architecture for the draft experience.
- Key user flows for writing, citing, reviewing, importing, exporting, and AI proposal handling.
- Interaction model for section focus versus whole-manuscript work.
- Interaction model for evidence and citation use.
- Interaction model for comments, suggestions, checkpoints, and issue resolution.
- State model for saving, syncing, conflicts, AI proposals, import reports, and export validation.
- Prioritized feature hierarchy for an initial implementation versus future phases.
- Edge cases and empty/degraded states.
- Rationale for major design choices.
- Explicit tradeoffs where the design optimizes for writing flow, evidence trust, review depth, or implementation simplicity.

The designer does not need to produce a visual style guide in the first pass. The first pass should solve the product interaction problem: how a scientist should live inside this draft space while writing a trustworthy manuscript.

## 13. Acceptance Criteria For The Design

A strong design should make the following statements true:

- A user can open the draft space and immediately understand how to continue writing.
- A user can write a manuscript without using AI.
- A user can insert and inspect evidence-backed citations without leaving writing flow.
- A user can tell which claims, citations, comments, and suggestions need attention.
- A user can review an AI proposal before accepting it.
- A user can recover from mistakes, reloads, conflicts, and high-risk edits.
- A user can understand what will block export before waiting for an export to fail.
- A user can export a defensible manuscript with generated references.
- A user can trust that section-level and manuscript-level work are acting on the same document.
- The experience can grow toward figures, tables, equations, cross-references, imports, submissions, and collaborative review without being redesigned from scratch.
