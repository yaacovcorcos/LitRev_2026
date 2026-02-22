# LitRev Plan Index

This directory contains the canonical, active plans for LitRev.

## Ownership Scopes
- [**Architecture & Infrastructure**](plan-backend.md): DB schema changes, Auth, server-side actions, export generation logic.
- [**Agentic Systems & AI Orchestration**](plan-agentic.md): The tool loop, context windows, model autonomy, planning algorithms.
- [**Memory & Retrieval**](plan-memory.md): Memory extraction, lifecycle, pgvector embeddings, project state sync. (This is the **only** active memory tracker).
- [**UI, UX, components**](plan-ui-ux.md): React components, layouts, frontend interaction polish, design tokens.
- [**System Prompts & LLM Extraction**](plan-prompts.md): The text of prompts, JSON schemas, extraction rules, model parameters.

## External References
- [**PRD**](../../PRD.md): Product vision and high-level behavioral constraints.
- [**Quality Report**](../../QUALITY_REPORT.md): Audit findings and concrete technical debt.

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
