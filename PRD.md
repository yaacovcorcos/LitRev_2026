# Product Requirements Document: LitRev_2026

**Status:** Draft (Comprehensive Evolution)
**Version:** 2.0
**Last Updated:** 2026-02-03

---

## 1. Executive Overview

LitRev_2026 is an AI-powered platform designed for medical scientists to plan research, review literature, and write scholarly articles. It transforms a research question into a structured research plan, executes database searches, triages evidence into an **Evidence Ledger**, and composes manuscripts with evidence-binding.

The **Evidence Ledger** is the architectural keystone—the source of truth that grounds AI-generated claims in vetted, traceable sources with specific locators (page/paragraph/sentence).

**Design Philosophy:** LitRev is not a chatbot. It is an **IDE-like environment for scientific reasoning**, where the AI agent is constrained, inspectable, and collaborative.

---

## 2. Core Principles

1. **Workspace for Scientists:** A professional environment for writing, regardless of automation level.
2. **Automation by Choice:** Users can toggle between fully automated, AI-assisted, or manual workflows at any step.
3. **No Claim Without a Source:** Every substantive statement must cite a vetted source with a precise locator.
4. **Clarity & Control:** High-complexity AI features remain transparent, observable, and reversible.
5. **Auditability:** Every generated artifact is traceable back to its input sources and the logic used to create it.
6. **Inspectable Agent:** The AI agent's actions are always visible to the user through: retrieved sources with provenance, tool calls and their results, task steps with inputs/outputs, confidence indicators, and citation links. No "black box" behavior.
7. **Tasks Over Magic:** Every significant AI action is represented as an explicit task with status, inputs, outputs, and audit trail. The agent never feels magical or unpredictable.

---

## 3. User Profiles

1. **Guided Scientist:** Mixes manual steps with AI assistance. Requires responsive UI and fine-grained control.
2. **Automated Scientist:** Prefers end-to-end automation. Requires robust logging, resumable jobs, and clear progress indicators.

---

## 4. Product Roadmap & Feature Status

LitRev_2026 follows a phased release strategy:

> **Status definitions:**
> - **DONE** = Feature complete and usable
> - **In Progress** = Partial implementation exists (may have backend but incomplete UI, or vice versa)
> - **Planned** = Designed but not yet implemented (may have schema/scaffolding)
>
> For current implementation details, see `FILE_INDEX.md`.
* **Parent Version (Current Focus):** Core workspace, basic literature review engine, and article drafting.
* **Descendant Version (Future):** Advanced meta-analysis engine, federated discovery, and multi-rater collaboration.

### 4.1 Research Planning & Protocol

| Feature | Description | Status |
| :--- | :--- | :--- |
| **PICO Framing** | Helping users define Population, Intervention, Comparison, Outcome. | **Planned (Parent)** |
| **Query Strategy Builder** | Generating Boolean strings, synonyms, and MeSH terms. | **Planned (Parent)** |
| **Initial Outline Gen** | Producing an editable article/review outline from the plan. | **Planned (Parent)** |
| **Protocol Memory** | Persistent storage of project-level definitions and decisions. | **Planned (Parent)** |

### 4.2 Discovery & Triage (AI Research Assistant)

| Feature | Description | Status |
| :--- | :--- | :--- |
| **Metadata Extraction** | Basic study metadata (Title, Authors, Year, etc.). | **Planned (Parent)** |
| **PDF Text Extraction** | Extracting clean text from uploaded PDF files. | **Planned (Parent)** |
| **Triage Cards** | Presenting candidates with rationale, integrity flags, and Ask-AI. | **Planned (Parent)** |
| **Integrity Checks** | Retraction alerts, predatory journal flags, citation anomalies. | **Planned (Descendant)** |
| **Evidence Ledger** | Centralized, vetted repository of "Kept" references. | **In Progress** |

### 4.3 Authoring & AI Compose

| Feature | Description | Status |
| :--- | :--- | :--- |
| **Ledger-Based Compose** | Writing sections using only vetted sources from the Ledger. | **Planned (Parent)** |
| **Source Locators** | Mapping claims to specific page/paragraph/sentence IDs. | **Planned (Parent)** |
| **Draft Management** | Versioned storage of draft state (DraftState JSON). | **DONE** |
| **Project Copilot** | Context-aware assistant available on all pages. | **In Progress** |
| **Multi-level Memory** | User preferences + Project goals + Study facts. | **Planned (Parent)** |

### 4.4 Artifacts & Exports

| Feature | Description | Status |
| :--- | :--- | :--- |
| **MS Word/DOCX Export** | Exporting structured manuscripts with citations. | **In Progress** |
| **PRISMA Diagram** | Generating flowcharts for study selection. | **Planned (Parent)** |
| **Bibliography Export** | BibTeX / EndNote support. | **Planned (Parent)** |
| **Provenance Tracking** | Recording query strategies and triage logic for reproducibility. | **Planned (Parent)** |

### 4.5 AI Agent Capabilities

| Feature | Description | Status |
| :--- | :--- | :--- |
| **Context-Aware Suggestions** | AI suggests next actions based on project state. | **Planned (Parent)** |
| **Agent Mode Routing** | Automatic routing to specialized agents with visible indicator. | **Planned (Parent)** |
| **Task System** | Explicit task tracking with audit trail, visible in chat. | **Planned (Parent)** |
| **Tool Registry** | PubMed, Crossref, PDF parser integration. | **Planned (Parent)** |
| **Interactive Chat Controls** | Inline buttons, filters, study cards in chat. | **Planned (Parent)** |
| **Negative Memory** | Track exclusion rationale for PRISMA compliance. | **Planned (Parent)** |
| **Self-Checks & Confirmations** | Agent pauses for high-stakes actions. | **Planned (Parent)** |
| **Dynamic Model Selection** | Automatic model selection with user override. | **Planned (Parent)** |

---

## 5. AI Agent Architecture

LitRev's AI is not a simple chatbot. It is a **constrained, inspectable research agent** that follows explicit workflows, maintains memory, and always grounds claims in evidence.

### 5.1 Context-Aware Agent Behavior

When a user opens the AI Assistant, the system evaluates project state and proactively suggests next actions:

| Project State | Suggestions |
| :--- | :--- |
| Empty project | "Would you like to define a research question?" / "Help framing a PICO?" |
| Research question exists, no protocol | "Shall we design inclusion/exclusion criteria?" / "Suggest a search strategy?" |
| Protocol complete, ledger empty | "Ready to search for studies?" / "Import existing references?" |
| Ledger populated | "Screen studies?" / "Summarize current evidence?" / "Draft introduction?" |
| Draft in progress | "Continue writing?" / "Add citations?" / "Review for unsupported claims?" |

**Behavior:**
* Suggestions appear as clickable chips, not just text
* Dismissible but remembered (don't suggest same thing repeatedly)
* User can always ignore and ask something else

### 5.2 Prompt Routing & Agent Modes

The system uses **modular, specialized agents** instead of one giant prompt. A router layer selects the appropriate agent based on user intent and project context.

#### Agent Modes

| Mode | Trigger | Responsibilities | Available Tools |
| :--- | :--- | :--- | :--- |
| **Protocol Agent** | Questions about PICO, eligibility, methodology | Define criteria, suggest search terms, explain methodology | Protocol editor |
| **Search Agent** | Requests to find studies | Query databases, parse results, deduplicate | PubMed API, Crossref, OpenAlex |
| **Screening Agent** | Study triage requests | Evaluate against criteria, flag conflicts, track exclusions | Ledger access, PDF viewer |
| **Drafting Agent** | Writing requests | Compose text with citations, check claim support | Draft editor, Ledger retrieval |
| **QA Agent** | Verification requests | Check claims, find conflicts, verify citations | Full retrieval, source comparison |

#### Routing Behavior

* **Automatic detection:** Router analyzes user intent and selects appropriate agent
* **Visible mode indicator:** Badge in chat header shows current mode (e.g., "Screening Mode")
* **User override:** User can manually select mode via dropdown if needed
* **Handoff:** Agents can suggest switching modes ("This is a drafting question—switching to Drafting Agent")

### 5.3 Task System

Every significant AI action is represented as an explicit **task** with full audit trail.

#### Task Structure

```
Task {
  id: string
  title: string
  status: "planned" | "running" | "done" | "blocked"
  inputs: string[]           // What the task needs
  outputs: string[]          // What it produced
  toolsUsed: string[]        // Which tools were invoked
  artifacts: ArtifactLink[]  // Links to protocol, studies, draft sections
  createdAt: timestamp
  completedAt: timestamp?
}
```

#### Task Visibility

* **Location:** Collapsible panel inside chat window
* **Shows:** Active tasks, recent completed, blocked items
* **Interaction:** Click to expand and see inputs, outputs, linked artifacts

#### Task Creation

* **AI proposes:** Agent creates tasks based on user requests
* **User can add:** Manual task creation for personal tracking
* **Batch operations:** "Screen 42 studies" creates one task, not 42

#### Task States

Tasks have four states: **planned** (queued), **running** (in progress), **done** (completed), **blocked** (needs user input).

### 5.4 Memory Architecture

Memory is not "just chat history." LitRev uses a **multi-layered, scoped memory system**.

#### Memory Layers

| Layer | Scope | Examples | Storage |
| :--- | :--- | :--- | :--- |
| **User Memory** | Global preferences | "Prefers APA citations", "Formal tone", "Often works in cardiology" | `UserMemory` table |
| **Project Memory** | Project decisions | "Exclude N<50", "Primary outcome: sensitivity", "Focus on RCTs" | `ProjectMemory` table |
| **Study Memory** | Per-study facts | "RCT design", "N=500", "85% accuracy reported", "Limitations: small sample" | `StudyMemory` table |
| **Negative Memory** | Exclusion rationale | "Study X excluded: wrong population", "Study Y excluded: retracted" | `Study.status` + `Study.details` JSON (schema update needed for dedicated field) |

#### Memory Visibility & Management

* **Queryable:** User can ask "What do you remember about this project?" or "What are my preferences?"
* **Management UI:**
  * Project settings → "Project Memory" tab (view/edit project-level memory)
  * User profile → "My Preferences" section (view/edit user-level memory)
* **Editable:** User can correct or delete memories
* **Scoped:** Memory is always scoped to user/project—no cross-contamination

#### Memory Retrieval

When responding to user queries, the agent retrieves relevant memories:
1. Always: User preferences (tone, citation style)
2. When in project: Project memory (scope, decisions, criteria)
3. When discussing studies: Relevant study memories
4. When screening: Negative memory (previous exclusions and reasons)

### 5.5 Self-Checks & Confirmations

The agent does not blindly continue when confidence is low or stakes are high.

#### Confirmation Triggers (Action-Type Based)

**Note:** These confirmations apply to **AI-initiated mutations**, not direct user edits in the UI. When users manually edit the protocol, draft, or ledger through the editor interface, no AI confirmation is required.

| Action Type | Requires Confirmation? | Rationale |
| :--- | :--- | :--- |
| Add study to ledger | Yes (batch: "Add 15 studies?") | Modifies source of truth |
| Exclude study | Yes (with reason selection) | Irreversible in workflow |
| Insert text in draft | Yes (show preview) | Modifies user content |
| Search databases | No | Low risk, read-only |
| Retrieve memories | No | Read-only operation |
| Delete conversation | Yes | Data loss |

#### Conflict Handling

When studies or sources disagree:
* Agent presents side-by-side comparison
* Highlights specific points of conflict
* Requests user decision: "How should we handle this disagreement?"
* Records decision in Project Memory

#### Confidence Indicators

| Level | Display | Meaning |
| :--- | :--- | :--- |
| High | Normal text | Agent is confident |
| Medium | Yellow highlight + "Verify this" | User should double-check |
| Low | Red flag + "I'm uncertain" | Requires user decision |

### 5.6 Model Selection Strategy

Not every task requires the most expensive model.

#### Automatic Selection

| Task Type | Recommended Tier |
| :--- | :--- |
| Fast/cheap | Metadata parsing, deduplication, simple extraction |
| Mid-tier | Summaries, study extraction, screening rationale |
| Top-tier | Evidence synthesis, drafting, complex reasoning |

#### User Experience

* **Default:** Automatic selection (user sees nothing for routine tasks)
* **For expensive tasks:** Show recommendation with override option
  * "Using [Model X] for synthesis (recommended). [Change model ▾]"
* **Settings:** User can set default preferences per task type

---

## 6. Research Tools & Retrieval

### 6.1 Tool Registry

The AI agent does not "browse the web"—it uses **structured tools** that return traceable, citable results.

#### Available Tools (Parent Version)

| Tool | Purpose | Status |
| :--- | :--- | :--- |
| **PubMed API** | Search medical literature | **Planned** (tool framework scaffolded) |
| **Crossref** | DOI resolution, metadata enrichment | **Planned** |
| **OpenAlex** | Open access discovery | **Planned** |
| **PDF Parser** | Extract text and structure from uploads | **Planned** |

#### Future Tools (Descendant Version)

| Tool | Purpose |
| :--- | :--- |
| Semantic Scholar | Citation graph analysis |
| Europe PMC | European medical literature |
| ClinicalTrials.gov | Trial registry search |
| Perplexity API | Broader web research (with provenance) |

### 6.2 RAG Architecture

Retrieval-Augmented Generation ensures **no claim without a source**.

#### Retrieval Pipelines

| Pipeline | Source | Use Case |
| :--- | :--- | :--- |
| Protocol context | Protocol JSON | Understanding project scope and criteria |
| Ledger studies | Study records | Evidence for claims in drafting |
| PDF chunks | Uploaded documents | Specific quotes, data extraction |
| Memory | Memory tables | User preferences, project decisions |

#### Retrieval Contract

Every retrieval returns:
* **Source ID:** Traceable reference
* **Relevance score:** How well it matches the query
* **Provenance:** Where it came from (table, document, page)

**Rule:** The model never makes factual claims about studies without retrieved context.

**Enforcement:** This is enforced through the RAG architecture—the Drafting Agent and QA Agent always query retrieval pipelines before generating claims. Unsupported claims are flagged with confidence indicators (Section 5.5). Full enforcement requires the verification pipeline (Planned).

### 6.3 Tool Invocation Flow

#### Invocation Modes

Tools are either **automatic** (low-risk, e.g., memory retrieval, PDF parsing) or **approval required** (high-risk, e.g., database search, ledger modification). Users can configure most tools; ledger modification always requires approval.

#### Standard Flow

AI proposes tool use → user approves (or auto-approved) → tool executes → AI presents results with triage options → user decisions update Evidence Ledger → task logged with audit trail.

---

## 7. User Interface Philosophy

> **Note:** This section describes the **target UI architecture**. Current implementation has basic pages (Projects, Protocol, Ledger, Draft, AI Chat). The tabbed interface and rich inline controls are planned enhancements.

### 7.1 Dual Interface: Chat + Search

Different users think differently. LitRev supports both conversational and visual workflows.

#### Tabbed Interface

| Tab | Purpose | Best For |
| :--- | :--- | :--- |
| **Chat** | Conversational interaction | Exploratory questions, guidance, complex requests |
| **Search** | Traditional search UI with filters | Systematic queries, precise filtering, batch operations |
| **Results** | Review found/imported studies | Triage, comparison, detail inspection |

#### Sync Behavior

* All tabs update the same Evidence Ledger
* Changes in one tab reflect immediately in others
* Single source of truth maintained

### 7.2 Interactive Controls in Chat

Chat is not plain text. It is a **control surface** with rich interactive elements.

#### Inline Controls

* **Study cards:** Title, authors, year with Keep/Exclude/Later buttons
* **Filter chips:** "RCTs only", "Last 5 years", "Exclude reviews"
* **Expandable details:** See abstract, methods without leaving chat
* **Citation insertion:** Click to add reference to draft

### 7.3 Task Visibility in Chat

The task panel is **inside the chat window**, not a separate page. Tasks link to their artifacts (protocol sections, studies, draft paragraphs).

---

## 8. Technical Architecture

LitRev_2026 is built as a **modular monolith** with clear boundaries between:
* **Evidence Ledger:** Source of truth for vetted references
* **Search/Triage Engine:** Discovery and screening workflows
* **Authoring/Compose:** Draft creation with evidence binding
* **AI Agent Layer:** Memory, routing, task management, tool invocation

### 8.1 Resilience & Graceful Degradation

The system handles external API failures gracefully:
* If search providers are down → User can still access Ledger and Draft
* If AI is unavailable → Manual workflows remain functional
* If memory retrieval fails → Agent continues with reduced context (warns user)

### 8.2 Implementation Details

Technical implementation details are maintained in:
* `DB_ARCHITECTURE.md` — Database schema and relationships
* `FILE_INDEX.md` — Codebase structure and module map
* `GLOSSARY.md` — Domain terminology definitions

---

## 9. Future Horizon (Descendant App)

* **Federated Discovery:** PubMed, Crossref, OpenAlex integration (deep)
* **Meta-Analysis Engine:** Statistical pooling, effect size calculations, GRADE profiles
* **Collaborative Screening:** Dual-screening with inter-rater metrics
* **Explorer Drafts:** Parallel, unverified narratives for comparison
* **Advanced Integrity:** Deep paper-mill detection and publisher-level surveillance

---

## 10. Repository Governance

To ensure auditability and maintainability, every project must maintain:
* `FILE_INDEX.md`: A living map of the codebase.

---

## Appendix A: Decision Log

| Decision | Choice | Rationale |
| :--- | :--- | :--- |
| Prompt routing visibility | Visible mode indicator (auto-detected) | Aligns with "Clarity & Control" principle |
| Task list location | Inside chat window (collapsible) | Always accessible, IDE-like experience |
| Task creation | AI proposes + user can add | Supports both user profiles |
| Memory visibility | Queryable + management UI | Transparency + user control |
| Confirmation triggers | Action-type based | High-stakes actions always confirm |
| Model selection | Auto with user override | Balance automation + control |
| Tool invocation | Configurable per tool | Matches "Automation by Choice" principle |
| Search interface | Tabbed (Chat \| Search \| Results) | Serves both user types |
