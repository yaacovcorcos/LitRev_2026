# Product Requirements Document: AntiGravity

**Status:** Draft (Comprehensive Evolution)  
**Version:** 1.0  
**Last Updated:** 2026-02-01  

---

## 1. Executive Overview
AntiGravity is an AI-powered platform designed for medical scientists to plan research, review literature, and write scholarly articles. It transforms a research question into a structured research plan, executes database searches, triages evidence into an **Evidence Ledger**, and composes manuscripts with evidence-binding.

The **Evidence Ledger** is the architectural keystone—the source of truth that grounds AI-generated claims in vetted, traceable sources with specific locators (page/paragraph/sentence).

---

## 2. Core Principles
1.  **Workspace for Scientists:** A professional environment for writing, regardless of automation level.
2.  **Automation by Choice:** Users can toggle between fully automated, AI-assisted, or manual workflows at any step.
3.  **No Claim Without a Source:** Every substantive statement must cite a vetted source with a precise locator.
4.  **Clarity & Control:** High-complexity AI features remain transparent, observable, and reversible.
5.  **Auditability:** Every generated artifact is traceable back to its input sources and the logic used to create it.

---

## 3. Product Roadmap & Feature Status

AntiGravity follows a phased release strategy:
*   **Parent Version (Current Focus):** Core workspace, basic literature review engine, and article drafting.
*   **Descendant Version (Future):** Advanced meta-analysis engine, federated discovery, and multi-rater collaboration.

### 3.1 Research Planning & Protocol
| Feature | Description | Status |
| :--- | :--- | :--- |
| **PICO Framing** | Helping users define Population, Intervention, Comparison, Outcome. | **Planned (Parent)** |
| **Query Strategy Builder** | Generating Boolean strings, synonyms, and MeSH terms. | **Planned (Parent)** |
| **Initial Outline Gen** | Producing an editable article/review outline from the plan. | **Planned (Parent)** |
| **Protocol Memory** | Persistent storage of project-level definitions and decisions. | **Planned (Parent)** |

### 3.2 Discovery & Triage (AI Research Assistant)
| Feature | Description | Status |
| :--- | :--- | :--- |
| **Metadata Extraction** | Basic study metadata (Title, Authors, Year, etc.). | **Planned (Parent)** |
| **PDF Text Extraction** | Extracting clean text from uploaded PDF files. | **Planned (Parent)** |
| **Triage Cards** | Presenting candidates with rationale, integrity flags, and Ask-AI. | **Planned (Parent)** |
| **Integrity Checks** | Retraction alerts, predatory journal flags, citation anomalies. | **Planned (Descendant)** |
| **Evidence Ledger** | Centralized, vetted repository of "Kept" references. | **In Progress** (Schema ready, UX evolving) |

### 3.3 Authoring & AI Compose
| Feature | Description | Status |
| :--- | :--- | :--- |
| **Ledger-Based Compose** | Writing sections using only vetted sources from the Ledger. | **Planned (Parent)** |
| **Source Locators** | Mapping claims to specific page/paragraph/sentence IDs. | **Planned (Parent)** |
| **Draft Management** | Versioned storage of draft state (DraftState JSON). | **DONE** |
| **Project Copilot** | Context-aware assistant available on all pages. | **In Progress** (wired to backend; verification pending) |
| **Multi-level Memory** | User preferences + Project goals + Study facts. | **Planned (Parent)** |

### 3.4 Artifacts & Exports
| Feature | Description | Status |
| :--- | :--- | :--- |
| **MS Word/DOCX Export** | Exporting structured manuscripts with citations. | **In Progress** |
| **PRISMA Diagram** | Generating flowcharts for study selection. | **Planned (Parent)** |
| **Bibliography Export** | BibTeX / EndNote support. | **Planned (Parent)** |
| **Provenance Tracking** | Recording query strategies and triage logic for reproducibility. | **Planned (Parent)** |

---

## 4. Technical Architecture Philosophy
AntiGravity is built as a **modular monolith** with clear boundaries between the **Evidence Ledger**, **Search/Triage Engine**, and **Authoring/Compose** modules.

### 5.1 AI Memory System (Longitudinal Intelligence)
Unlike simple LLM wrappers, AntiGravity uses a structured retrieval system:
*   **User Memory:** "Citation style is APA," "Writing tone is formal."
*   **Project Memory:** "Exclude studies with N < 50," "Primary outcome is sensitivity."
*   **Study Memory:** "Study A used RCT," "Study B found 85% accuracy."

### 5.2 Resilience & Graceful Degradation
The system is designed to handle external API failures. If search providers are down, the user maintains access to the **Evidence Ledger** and **Draft Workspace** to continue manual or assisted work.

---

## 5. User Profiles
1.  **Guided Scientist:** Mixes manual steps with AI assistance. Requires responsive UI and fine-grained control.
2.  **Automated Scientist:** Prefers end-to-end automation. Requires robust logging, resumable jobs, and clear progress indicators.

---

## 6. Repository Governance
To ensure auditability and maintainability, every project must maintain:
*   `JOURNAL.md`: Running log of working sessions and progress.
*   `DECISIONS.md`: Record of critical architectural and project decisions.
*   `FILE_INDEX.md`: A living map of the codebase.
*   `CHANGELOG.md`: Milestone changes at release boundaries.

---

## 7. Future Horizon (Descendant App)
*   **Federated Discovery:** PubMed, Crossref, OpenAlex integration.
*   **Meta-Analysis Engine:** Statistical pooling, effect size calculations, GRADE profiles.
*   **Collaborative Screening:** Dual-screening with inter-rater metrics.
*   **Explorer Drafts:** Parallel, unverified narratives for comparison.
*   **Advanced Integrity:** Deep paper-mill detection and publisher-level surveillance.
