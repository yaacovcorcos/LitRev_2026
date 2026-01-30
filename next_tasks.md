# Project Roadmap & Task Ideas

This file tracks upcoming features and improvements for the LitRev platform.

## Completed Tasks

### ✅ Protocol Page Enhancements (Completed Jan 28, 2026)
- **Editable Sections**: PICO framework, eligibility criteria, and search strategy are now fully editable inline.
- **Copilot Interaction**: Copilot is context-aware of active section and provides intelligent, section-specific responses.
- **Insert Functionality**: AI suggestions can be inserted directly into protocol fields.
- **Quick Actions**: "Ask Copilot" buttons on each section for one-click assistance.
- **Completeness Indicator**: Visual progress bar showing protocol completion status.
- **Export Protocol**: Download protocol as formatted Markdown document.

## Upcoming Tasks

### 1. Copilot Scrolling Isolation Across Pages
- **Problem**: Copilot on the Protocol page scrolls together with the main page, which causes incorrect page behavior. Copilot should scroll fully independently from the rest of the page.
- **Reference Behavior**: Review the Draft Copilot implementation first. It keeps the input box visible without requiring scroll and behaves like a proper, isolated copilot.
- **Goal**: Make Copilot on all pages behave like the Draft Copilot:
    - The Copilot panel scrolls completely separately from the main page content.
    - The input box remains visible (sticky/pinned) without the user needing to scroll to see it.
    - The main page should not be affected when the Copilot content scrolls.

### 2. Evidence Ledger & Study Details
- **Unfold Studies**: Add the ability to expand/unfold study rows in the evidence ledger to see a quick summary or key data points without leaving the list.
- **Detailed Study View**: Implement a dedicated view for individual studies containing:
    - Full reference information.
    - PDF viewer or direct links to source documents.
    - External links (DOI, PubMed, etc.).
    - **Study-Specific Copilot**: A chat interface dedicated to analyzing that specific study in depth.
- **Reference Detail Page**: Add a per-reference page for the references ledger with:
    - Full reference metadata and fields for missing info.
    - Notes/annotations specific to that reference.
    - Space for additional structured info (tags, summaries, key findings).

### 3. Protocol-Ledger Integration
- Link protocol eligibility criteria to evidence ledger filtering.
- Show which studies match/don't match criteria.
- Generate PRISMA flow diagram data.

### 4. Draft Page Enhancements
- Connect draft sections to referenced studies from ledger.
- Citation insertion from evidence ledger.
- AI-assisted writing with context from protocol and ledger.
- **Export Draft**: Add an export option for the draft (e.g., formatted Markdown or other shareable format).
- **Export Formats & Design**: Support additional export formats (PDF, Word/Docs, etc.) and provide a designed, layout-aware export (not just raw Markdown).

### 5. Import Study Follow-ups (post-baseline)
- **Metadata Auto-Extract**: Later add PDF metadata/filename parsing (and eventually DOI lookup) to prefill title/authors/year.
- **Duplicate Warning**: Detect duplicates and show a non-blocking warning message when a study already exists.

---
*Last updated: January 28, 2026*
