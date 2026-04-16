# LitRev Plan Index

This directory contains the canonical, active plans for LitRev.
This file is the active plan registry and the canonical owner for plan-maintenance rules; `AGENTS.md` owns routing and repo-wide policy, and `docs/agents/cold-memory-index.md` owns Tier 3 retrieval mapping.

## Ownership Scopes
- [**Architecture & Infrastructure**](plan-backend.md): DB schema changes, Auth, server-side actions, export generation logic.
- [**Lint Governance**](plan-lint-governance.md): Canonical tracker for repo-local lint architecture, staged governance rules, audit baselines, and CI rollout.
- [**Testing Execution**](plan-testing-execution.md): Canonical tracker for shared test command taxonomy, CI lane clarity, changed-scope execution policy, smoke-lane discipline, and cross-cutting testing operations.
- [**Agent Platform**](plan-agentic.md): Single canonical plan for the agent platform: runtime architecture, orchestration, decisioning, tool boundaries, shared-surface truth, and the long-range agent product roadmap.
  - Supporting execution detail for active fixes still lives under [**agent-runtime-remediation/**](agent-runtime-remediation/README.md).
  - Historical/supporting runtime and transparency notes remain in [**Chat Runtime**](chat-runtime.md) and [**Transparency UI**](transparency-ui.md), but active status now lives in `plan-agentic.md`.
- [**Agent Quality**](plan-agent-quality.md): Canonical plan for agent reliability, security, executable evals, rollout discipline, observability, performance efficiency, and long-term benchmark intake.
- [**Memory, Grounding, and Prompting**](plan-memory.md): The only active memory tracker, now expanded to also own grounding, retrieval-quality, prompt-library, and extraction work for the agent's knowledge layer.
- **UI, UX, components** — Canonical + archive:
  - [**UI/UX Canonical Plan**](plan-ux-ui.md): Single active tracker for UI/UX execution and remaining backlog. Permanent frontend doctrine lives outside the plan layer.
  - [**Evidence Ledger**](plan-ledger.md): Canonical plan for the Evidence Ledger as a product area: study list/detail architecture, duplicate-safe ingestion, PDF/file processing UX, cross-surface evidence reuse, and ledger-specific state/performance sequencing.
  - [**Draft Experience**](plan-drafting-experience.md): Canonical plan for the manuscript editor, evidence-linked drafting, review workflows, inline AI proposals, and export-grade manuscript compilation.
  - [**Draft Authoring Platform**](plan-draft-authoring-platform.md): Supporting implementation plan for rebuilding the draft surface around non-AI-first writing quality, scientific authoring primitives, reliability/performance, and agent-ready seams.
  - [**Context Capture Plan**](plan-context-capture.md): Canonical plan for scoped AI entrypoints, semantic selection targets, context receipts/history, and cross-surface context reuse.
  - [**Protocol Live Sync**](plan-protocol-live-sync.md): Canonical plan for shared live protocol state, local durability, immediate copilot acceptance patching, and conflict-safe protocol UX.
  - [**Reliability A0 brief**](reliability-a0-brief.md): Deterministic repro + baseline threshold contract for Track A blocker reliability work.
  - [**Mobile plan**](mobile-plan.md): Canonical app-wide responsive foundation tracker, including mobile/chat follow-up waves.
  - [**Mobile layout contract**](mobile-layout-contract.md): Operational contract for shared phone/compact height, safe-area, and scroll-ownership rules.
  - [**Transparency UI**](transparency-ui.md): Supporting reference for truthful process visibility across chat surfaces. Active ownership now lives in `plan-agentic.md` and `plan-agent-quality.md`.
  - [**Chat Runtime**](chat-runtime.md): Supporting reference for shared runtime parity history and burn-in context. Active ownership now lives in `plan-agentic.md` and `plan-agent-quality.md`.
- [**Guided Setup V2**](plan-guided-setup.md): Dedicated onboarding activation plan for visual redesign, AI-enhanced step flow, personalization, and setup-mode agent behavior.
- [**Settings**](plan-settings.md): Canonical tracker for user-configurable behavior defaults and future Settings UI controls.
- [**Speed and Performance**](plan-speed-performance.md): Canonical tracker for Web Vitals budgets, cache/preload policy, route performance, and smooth interaction delivery.
- [**System Prompts & LLM Extraction**](plan-prompts.md): Supporting reference only; active prompt and extraction ownership now lives in `plan-memory.md`.

## Plan Filename Policy

- `docs/plans/` already conveys the artifact type, so plan filenames should emphasize the durable domain subject.
- Top-level canonical plans keep the repo's current `plan-*` naming convention unless a later governance task intentionally changes that policy repo-wide.
- Supporting plans that live inside a scoped subdirectory should use lowercase kebab-case subject names without adding extra process labels unless the parent directory needs that distinction.
- Avoid camelCase, transient status labels, and version markers in plan filenames unless the concept is truly canonical.
- When a plan filename changes, update every in-repo reference in the same task so routing docs, runbooks, and supporting plans stay grep-clean.

## External References
- [**PRD**](../../PRD.md): Product vision and high-level behavioral constraints.
- [**Diagnosis Report**](../reports/diagnosis-03-02.md): Canonical diagnosis and quality-tracking report; supersedes the removed `QUALITY_REPORT.md`.
- [**Repo Health**](../reviews/repo-health.md): Living summary for whole-repo review findings, regressions, repeated mistakes, and improvements.
- [**Architecture Decision Log**](../architecture/decision-log.md): Canonical record of intentional technical tradeoffs that reviewers should preserve unless assumptions change.
- [**Open Source References**](../../OPEN_SOURCE_REFERENCES.md): Active registry of upstream GitHub repositories that current owner docs or retained review artifacts still cite for adaptation or benchmark comparison.
- [**Frontend Quality Bar**](../architecture/frontend-quality-bar.md): Durable frontend doctrine, control hierarchy, and anti-patterns for LitRev UI work.
- [**Agentic UI Glossary**](../architecture/agentic-ui-glossary.md): Canonical vocabulary bridge for chat timeline items, transparency/process UI, artifacts, composer controls, and clarification flow.
- [**Repo Review Baseline**](../runbooks/repo-review-baseline.md): Canonical baseline for comparing repeated deep repo reviews against current in-repo findings and shipped review-driven fixes.
- [**Internal Advisory Reviews**](../runbooks/internal-advisory-reviews.md): Internal review-lens map for security, runtime-boundary, and soft-signal advisory reviews without creating a second source of truth.
- [**Testing and CI Strategy**](../runbooks/testing-ci-strategy.md): Cross-cutting execution contract for shared local validation, CI lane meaning, local reproduction, changed-scope rules, and lane-promotion discipline.
- [**Security Baseline**](../runbooks/security-baseline.md): Repo-local security operating baseline covering auth, authorization, storage, AI/tool boundaries, secrets handling, and the primary external canon for this stack.
- [**Frontend Review Loop**](../runbooks/frontend-review-loop.md): Repeatable frontend implementation and review procedure, including thesis framing and QA checklists.
- [**Admin Access Runbook**](../runbooks/admin-access.md): Platform admin bootstrap, guard boundaries, mutation safety, and audit/analytics incident procedures.
- [**External Pattern Intake**](../runbooks/external-pattern-intake.md): Procedure for evaluating external repos, vendor examples, and adapted skill packs before they become LitRev-local code, rules, or docs.
- [**Chat Runtime Burn-In Runbook**](../runbooks/chat-runtime-burn-in.md): Operational U1.6 canary validation steps and sign-off procedure.
- [**Reliability A3 Canary Runbook**](../runbooks/reliability-a3-canary.md): staged sample gates, pass/fail thresholds, rollback triggers, and flag interaction matrix.

Plans not listed here as active defaults should be treated as supporting detail, archive material, or superseded source plans rather than routing defaults.

---

## Maintenance Governance

**CRITICAL: Updating these files**
These files must never become historical change logs. They track current truth and remaining work. When completing a task:
1. **Remove** it from `Active Tasks`.
2. Move it to `Recently Completed` (cap this section at 10 items to prevent bloat).
3. If the task created a new rule or structural decision, add a 1-2 sentence description to `Current Architecture`.
4. Never append chronological changelogs or diary entries to these files.

**CRITICAL: PRD vs. Domain Plans Policy (The "What vs. How" Rule)**
- **Change `PRD.md` ONLY IF:** A decision changes **WHAT** the product does, **WHO** it is for, or **WHY** we are building it (e.g., changes to user-visible behavior, product scope, trust/safety rules, or success metrics).
- **Change Domain Plans (`docs/plans/*.md`) ONLY IF:** A decision changes **HOW** the product is built (e.g., architectural choices, prompt structures, server actions, technical refactors).
