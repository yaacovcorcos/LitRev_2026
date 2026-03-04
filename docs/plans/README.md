# LitRev Plan Index

This directory contains the canonical, active plans for LitRev.

## Ownership Scopes
- [**Architecture & Infrastructure**](plan-backend.md): DB schema changes, Auth, server-side actions, export generation logic.
- [**Agentic Systems & AI Orchestration**](plan-agentic.md): The tool loop, context windows, model autonomy, planning algorithms.
  - [**Claude agentic execution plan**](claude-agentic-plan.md): Claude-specific implementation plan for `ask_user`, delegation, and lazy context loading.
  - [**Codex agentic execution plan**](codex-agentic-plan.md): Codex-specific consolidated roadmap for next-gen orchestration, retrieval, sub-agents, and eval operations.
- [**Memory & Retrieval**](plan-memory.md): Memory extraction, lifecycle, pgvector embeddings, project state sync. (This is the **only** active memory tracker).
- **UI, UX, components** — Two companion execution plans:
  - [**Claude UI plan**](claude-ui-ux-plan.md): Holistic, root-cause-driven stability sweep (CLU-001–008). Includes Current Architecture reference.
  - [**Codex UI plan**](codex-ui-ux-plan.md): Full product roadmap — stability sweep (CUX-001–A03) + onboarding, citations, copilot features, performance, deferred items.
  - [**Reliability A0 brief**](reliability-a0-brief.md): Deterministic repro + baseline threshold contract for Track A blocker reliability work.
  - [**Mobile viewport contract**](mobile-viewport-contract.md): Flag-gated mobile viewport policy, telemetry schema, and canary/rollback gates for route migrations.
  - [**Thinking + Live Process UX V2**](plan-thinking-v2.md): Sequenced plan for live reasoning visibility, tool activity lane, and user-in-the-loop controls built on shared chat runtime/adapters.
  - [**Chat Unification V2**](plan-chat-unification-v2.md): Full plan to unify `/ai`, project copilot, and popup under one chat engine while preserving feature parity and keeping `/ai` project-optional.
- [**Guided Setup V2**](plan-guided-setup.md): Dedicated onboarding activation plan for visual redesign, AI-enhanced step flow, personalization, and setup-mode agent behavior.
- [**System Prompts & LLM Extraction**](plan-prompts.md): The text of prompts, JSON schemas, extraction rules, model parameters.

## External References
- [**PRD**](../../PRD.md): Product vision and high-level behavioral constraints.
- [**Quality Report**](../../QUALITY_REPORT.md): Audit findings and concrete technical debt.
- [**Chat Unification Burn-In Runbook**](../runbooks/chat-unification-burn-in.md): Operational U1.6 canary validation steps and sign-off procedure.

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
