# LitRev Plan Index

This directory contains the canonical, active plans for LitRev.

## Ownership Scopes
- [**Architecture & Infrastructure**](plan-backend.md): DB schema changes, Auth, server-side actions, export generation logic.
- [**Agentic Systems & AI Orchestration**](plan-agentic.md): Single canonical plan for agent runtime architecture, active fixes, roadmap phases, and maintenance/update rules.
  - Supporting execution detail for active fixes lives under [**agent-runtime-remediation/**](agent-runtime-remediation/README.md).
  - `claude-agentic-plan.md` and `codex-agentic-plan.md` are superseded source documents and should not be used as active trackers.
- [**Memory & Retrieval**](plan-memory.md): Memory extraction, lifecycle, pgvector embeddings, project state sync. (This is the **only** active memory tracker).
- **UI, UX, components** — Canonical + archive:
  - [**UI/UX Canonical Plan**](plan-ux-ui.md): Single active tracker for UI/UX execution and remaining backlog.
  - [**Context Capture Plan**](plan-context-capture.md): Canonical plan for scoped AI entrypoints, semantic selection targets, context receipts/history, and cross-surface context reuse.
  - [**Protocol Live Sync**](plan-protocol-live-sync.md): Canonical plan for shared live protocol state, local durability, immediate copilot acceptance patching, and conflict-safe protocol UX.
  - [**Reliability A0 brief**](reliability-a0-brief.md): Deterministic repro + baseline threshold contract for Track A blocker reliability work.
  - [**Mobile plan**](mobile-plan.md): Canonical mobile strategy + viewport/rollout contract for project conversation, `/ai`, and popup UX quality.
  - [**Thinking + Live Process UX V2**](plan-thinking-v2.md): Sequenced plan for live reasoning visibility, tool activity lane, and user-in-the-loop controls built on shared chat runtime/adapters.
  - [**Chat Unification V2**](plan-chat-unification-v2.md): Full plan to unify `/ai`, project copilot, and popup under one chat engine while preserving feature parity and keeping `/ai` project-optional.
- [**Guided Setup V2**](plan-guided-setup.md): Dedicated onboarding activation plan for visual redesign, AI-enhanced step flow, personalization, and setup-mode agent behavior.
- [**Settings**](plan-settings.md): Canonical tracker for user-configurable behavior defaults and future Settings UI controls.
- [**Speed and Performance**](plan-speed-performance.md): Canonical tracker for Web Vitals budgets, cache/preload policy, route performance, and smooth interaction delivery.
- [**System Prompts & LLM Extraction**](plan-prompts.md): The text of prompts, JSON schemas, extraction rules, model parameters.

## External References
- [**PRD**](../../PRD.md): Product vision and high-level behavioral constraints.
- [**Diagnosis Report**](../reports/diagnosis-03-02.md): Canonical diagnosis and quality-tracking report; supersedes the removed `QUALITY_REPORT.md`.
- [**Repo Health**](../reviews/repo-health.md): Living summary for whole-repo review findings, regressions, repeated mistakes, and improvements.
- [**Architecture Decision Log**](../architecture/decision-log.md): Canonical record of intentional technical tradeoffs that reviewers should preserve unless assumptions change.
- [**Repo Review Baseline**](../runbooks/repo-review-baseline.md): Canonical baseline for comparing repeated deep repo reviews against current in-repo findings and shipped review-driven fixes.
- [**Admin Access Runbook**](../runbooks/admin-access.md): Platform admin bootstrap, guard boundaries, mutation safety, and audit/analytics incident procedures.
- [**Chat Unification Burn-In Runbook**](../runbooks/chat-unification-burn-in.md): Operational U1.6 canary validation steps and sign-off procedure.
- [**Reliability A3 Canary Runbook**](../runbooks/reliability-a3-canary.md): staged sample gates, pass/fail thresholds, rollback triggers, and flag interaction matrix.

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
