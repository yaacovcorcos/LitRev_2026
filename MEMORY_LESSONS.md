# Memory Lessons (LitRev)

This document captures the core lessons about memory and how we intend to implement it in LitRev. These are **architectural rules**, not optional features.

## 1) Memory is not context
- **Context** lives in the prompt (short-term working memory).
- **Memory** lives on disk (long-term knowledge base).
- Context is temporary and expensive; memory is persistent and cheap.
- We must not “remember” by bloating prompts.

## 2) Memory must be external, inspectable, and editable
- Memory must be stored outside the model.
- It must be human-readable and editable for auditability.
- This supports scientific trust and reproducibility.

## 3) Memory is structured knowledge, not raw logs
- Raw chat is **not** memory.
- Memory should store distilled, reusable knowledge.
- Examples:
  - Decisions (inclusion criteria, modeling choices)
  - Definitions (outcome definitions, taxonomy)
  - Preferences (citation style, writing tone)
  - Workflows (screening process, PRISMA flow)

## 4) Memory requires multiple layers (cognitive types)
- **Episodic:** what happened (decisions, rejections)
- **Semantic:** what is true (domain facts, definitions)
- **Procedural:** how tasks are done (workflows)
- **Preference:** user-specific style and standards

## 5) Retrieval beats injection
- Never preload all memory into context.
- Retrieve only relevant memory per task.
- Prefer hybrid retrieval (keyword + semantic) later.

## 6) Extract before compress
- Before pruning or summarizing context, extract durable knowledge.
- Long sessions must not lose critical scientific reasoning.

## 7) Memory must be curated and updated
- Memory is **dynamic**, not archival.
- Support updating decisions, archiving outdated info.
- Avoid infinite accumulation (cognitive clutter).

## 8) Memory must be scoped
- At minimum:
  - **User memory** (preferences, style)
  - **Project memory** (goals, criteria, workflows)
  - **Conversation memory** (short-term context + summary)
  - **Study memory** (study-level facts and summaries)
- Scoping prevents cross-project contamination.

## 9) Memory operations are first-class actions
- Memory should be actively managed:
  - store
  - retrieve
  - update
  - archive/forget
- The AI should decide when to store or revise memory.

## 10) Memory entries must be structured
- Each memory entry should include:
  - What (statement)
  - Why (rationale)
  - Scope (user/project/study)
  - Status (active/archived)
  - Tags (for retrieval)

## 11) Memory enables longitudinal intelligence
- Without memory, LitRev is a stateless chatbot.
- With memory, LitRev becomes a long-term research collaborator.

## 12) Separation of concerns is non-negotiable
- **Transcripts** are full history.
- **Context** is working RAM.
- **Memory** is durable knowledge.
- These must remain distinct in storage and usage.

---

## Implementation Intent (summary)
- Store memory in DB (not provider).
- Keep memory auditable and editable.
- Retrieve selectively per task.
- Use layered memory (user, project, conversation, study).
- Add summarization + extraction workflows to avoid loss.
