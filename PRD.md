# Product Requirements Document: LitRev_2026

**Status:** Canonical Product Contract  
**Version:** 3.1  
**Last Updated:** 2026-02-20

---

## 1. Product Context and Problem Statement
Medical scientists doing evidence reviews work across disconnected tools: search databases, spreadsheets, reference managers, PDF viewers, and manuscript editors. This fragmentation slows progress, breaks context, and makes provenance hard to verify.

LitRev_2026 exists to provide one integrated workflow for protocol design, literature discovery, screening, and manuscript drafting with auditable AI support.

## 2. Vision and Principles
**Vision:** LitRev_2026 is an AI-powered research workspace that helps scientists move from question to defensible draft with transparent, controllable automation.

**Principles:**
1. **Workspace for Scientists:** Professional research tooling first, AI second.
2. **Automation by Choice:** Manual, assisted, and automated workflows must coexist.
3. **No Claim Without a Source:** Factual claims require traceable evidence.
4. **Clarity and Control:** High-impact actions are inspectable and reversible.
5. **Auditability:** Key AI actions and outputs remain traceable.
6. **Graceful Degradation:** Core manual workflows must remain usable when AI or external providers fail.

## 3. Personas and Jobs-To-Be-Done
1. **Guided Scientist**
- JTBD: "Help me structure the review rigorously while I keep decision control."
- Primary needs: protocol guidance, explainable suggestions, low-friction manual overrides.

2. **Automated Scientist**
- JTBD: "Execute high-volume review operations quickly, with clear checkpoints."
- Primary needs: reliable orchestration, visibility into progress, confidence in outputs.

## 4. Product Scope (v1)
**In scope (v1):**
1. Project-based research workspace.
2. Protocol authoring (PICO, eligibility, strategy, methodology).
3. Literature discovery via vetted integrations.
4. Evidence ledger for triage decisions and rationale.
5. Draft authoring with evidence-aware assistance.
6. Verification and QA workflows for unsupported-claim and citation-gap review.
7. AI agent with visible actions, artifacts, and user controls.

**Out of scope (v1):**
1. Collaborative multi-rater adjudication workflows.
2. Built-in statistical meta-analysis engine (effect-size pooling, forest plots).
3. Unrestricted web crawling as a primary evidence source.
4. Institutional SSO and enterprise tenancy controls beyond single-user baseline.

## 5. Core User Journeys and Outcomes
1. **Protocol Journey**
- User creates project, defines question, completes protocol fields.
- Outcome: protocol is complete enough to drive screening and drafting behavior.

2. **Discovery and Screening Journey**
- User runs searches, reviews candidate studies, marks keep/exclude/maybe with rationale.
- Outcome: ledger reflects current evidence set and exclusion reasoning.

3. **Drafting Journey**
- User writes/revises sections with AI support and citations.
- Outcome: manuscript sections are exportable and evidence-backed at the study level.

4. **Verification Journey**
- User checks for unsupported claims and citation gaps before export.
- Outcome: unresolved evidence issues are surfaced and actionable.

## 6. Functional Requirements (What the Product Must Do)
### 6.1 Protocol Management
- The product must support structured protocol definition and editing.
- The product must allow AI-assisted updates without removing manual control.

### 6.2 Discovery and Evidence Intake
- The product must support literature search through vetted provider integrations.
- The product must support PDF ingestion and extraction workflows for study enrichment.

### 6.3 Screening and Ledger
- The product must capture include/exclude/maybe decisions and rationale.
- The product must keep ledger state as the canonical reference set for drafting and QA behavior.

### 6.4 Draft Authoring and Export
- The product must support section-based drafting and revision.
- The product must provide an export path to shareable manuscript formats.

### 6.5 Agent Behavior
- The product must route user requests into context-appropriate AI behaviors.
- The product must present high-impact AI actions in explicit reviewable form.
- The product must provide visible progress and outcome states for multi-step operations.

### 6.6 Memory and Personalization
- The product must persist user and project preferences across sessions.
- The product must allow users to inspect and manage remembered decisions/preferences.

### 6.7 Traceability
- The product must preserve enough history for users to understand what AI did and why.

**Implementation boundary:** Engineering details for how requirements are implemented are maintained in `docs/plans/*.md`.

## 7. Non-Functional Requirements (NFRs)
### 7.1 Performance
- p95 time-to-interactive for core project pages: <= 2.0s on a typical broadband desktop session.
- p95 first streamed AI token after submit: <= 4.0s (excluding third-party outages).

### 7.2 Reliability
- Core manual pages (Protocol, Ledger, Draft, Notes) must remain usable when AI is unavailable.
- Target monthly availability for core workspace workflows: >= 99.5%.

### 7.3 Accessibility
- v1 target: WCAG 2.2 AA for critical workflows (project navigation, protocol editing, ledger triage, draft editing, AI input).

### 7.4 Security and Isolation
- Project/workspace isolation is mandatory; no cross-project or cross-workspace data leakage.
- All destructive actions must require explicit user confirmation.

## 8. Integrations and Dependency Requirements
### 8.1 Required for v1
- Primary literature discovery integration(s) for biomedical search.
- PDF storage and retrieval infrastructure for uploaded documents.
- At least one production LLM provider for assistant workflows.

### 8.2 Planned/Optional after v1
- Additional discovery providers for broader coverage.
- Extended export and bibliography ecosystem integrations.

### 8.3 Failure Requirements
- Provider failures must be surfaced clearly to the user with retry/alternate-path guidance.

## 9. Data, Privacy, and Compliance Requirements
### 9.1 Ownership and Control
- Users retain ownership of project content and uploaded files.
- The product must provide user-accessible deletion paths for project artifacts.

### 9.2 Isolation and Confidentiality
- The product must not silently share data across projects/workspaces.

### 9.3 Compliance Posture (v1)
- v1 is not positioned as a PHI processing platform; users must avoid uploading protected patient identifiers unless/until compliance posture is explicitly upgraded.

## 10. Trust, Safety, and Evidence Policy
### 10.1 Evidence Grounding Requirement
- Claims about specific studies must include a verifiable study-level citation identifier when available.

### 10.2 Locator Requirement (Target Behavior)
- The product target is claim-to-source locator precision (page/paragraph/sentence) where source material permits.
- Until full locator enforcement is generally available, the product must clearly indicate when locator precision is unavailable.

### 10.3 Conflict and Uncertainty Handling
- Conflicts in evidence or remembered decisions must be surfaced for user review.
- The assistant must never present fabricated identifiers as verified facts.

## 11. Success Metrics and Release Gates
### 11.1 Outcome Metrics
- Time-to-first-complete protocol decreases versus baseline manual workflow.
- Citation integrity defects trend toward zero (fabricated or non-resolving identifiers).
- Screening throughput improves without degrading exclusion-rationale quality.

### 11.2 Adoption and Retention Metrics
- Repeated use across protocol, screening, and drafting workflows within active projects.

### 11.3 Release Gates for v1 Readiness
- Export workflow is end-to-end reliable (not metadata-only placeholder behavior).
- Verification workflows consistently surface unsupported claims before final export.
- Core manual workflows pass accessibility and resilience checks.

## 12. Risks, Assumptions, and Constraints
### 12.1 Risks
- LLM hallucination can erode trust if not controlled by verification workflows.
- Upstream API instability can disrupt discovery throughput.

### 12.2 Assumptions
- Users accept a task- and artifact-driven AI UX instead of a black-box chatbot UX.

### 12.3 Constraints
- Product scope is intentionally limited to evidence-grounded review workflows in v1.

## 13. Decision Log
Only product-contract decisions belong here.

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-03 | Prioritize context-aware AI workflows | Required for multi-step research assistance. |
| 2026-02-20 | PRD v3.0: separated What/Why from implementation plans | Reduced drift and clarified governance boundaries. |
| 2026-02-20 | PRD v3.1: added measurable NFRs, data/privacy requirements, integration contract, and release gates | Made the PRD operational as a product contract for delivery and review. |

## 14. Traceability
`PRD.md` defines **what** and **why**.  
`docs/plans/*.md` defines **how**.

Canonical implementation plans:
- Architecture and Infrastructure: `docs/plans/plan-backend.md`
- Agentic Systems and AI Orchestration: `docs/plans/plan-agentic.md`
- Memory and Retrieval: `docs/plans/plan-memory.md`
- UI and UX: `docs/plans/plan-ux-ui.md`
- Prompts and Extraction Rules: `docs/plans/plan-prompts.md`

Index and governance: `docs/plans/README.md`.
