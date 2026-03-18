# Structured Assistant Message Parts Plan

## Authority Note

[plan-agentic.md](./plan-agentic.md) remains the canonical owner for:

- roadmap status
- execution order
- current runtime architecture truth
- completion rules

This file is execution-detail only. It does not maintain separate active/completed status tracking.

## Problem Statement

Assistant-side UI metadata is still mixed into normal assistant prose in several current runtime paths.

Repo-grounded facts:

- hidden `MENTIONED_STUDIES` markup is requested in [copilot-prompts.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/ai/prompts/copilot-prompts.ts)
- the main timeline strips/parses that markup in [TimelineRenderer.tsx](/Users/yaacovcorcos/LitRev_2026/next-app/components/copilot/TimelineRenderer.tsx)
- raw assistant text is still persisted through [memory.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/server/ai/memory.ts)
- exports, summaries, popup, and transcript-derived paths still consume raw assistant content in multiple places

This creates a brittle architecture:

- human-readable assistant prose and machine-readable UI protocol share the same storage/render channel
- malformed hidden markup can leak into visible chat
- downstream consumers sanitize inconsistently
- transcript-derived workflows can ingest machine protocol as if it were user-facing narrative

## Design Goal

Visible assistant prose and machine-readable UI state must no longer share one storage/render channel.

The target architecture is:

- server-owned normalization at the assistant-message boundary
- clean visible assistant text persisted separately from typed structured message parts
- clients rendering from canonical structured data instead of reparsing prose
- legacy hidden-markup parsing retained only as a migration fallback for older messages

## Phase 0 — Shared normalization and containment

- Add one shared assistant-content normalization utility for current hidden assistant markup types.
- Make it return clean display text plus extracted structured payloads from the same canonical parsing pass.
- Apply that shared normalization path anywhere assistant text is currently rendered, exported, summarized, copied into transcript-derived flows, or mined for memory.
- Keep this phase additive only: no schema changes and no change to the prompt contract yet.

## Phase 1 — Server-owned assistant content normalization

- Move assistant-content normalization to the server boundary before assistant messages are persisted.
- For new assistant turns, persist only clean visible assistant text into the primary visible-text field.
- Extract structured side payloads at the same boundary and keep them available to runtime consumers even before structured persistence lands.
- Ensure malformed internal markup degrades by dropping the invalid machine payload instead of leaking it into the visible assistant answer.

## Phase 2 — Structured message-part persistence

- Add structured assistant message-part persistence so assistant-side UI payloads no longer need to live inside raw text.
- Keep the storage additive: preserve the existing text field for compatibility while introducing structured message-part storage for new writes.
- Treat typed message parts as validated server-owned data, not client-discovered annotations.
- Do not backfill all historic rows in this phase; old messages should remain readable through fallback parsing.

## Phase 3 — Renderer and consumer migration

- Make main chat surfaces prefer structured message parts over hidden-markup parsing.
- Migrate non-chat consumers to use canonical clean text and structured parts:
  - exports
  - summarization
  - popup transcript/save paths
  - transcript-derived memory extraction
- Keep legacy parsing only as a fallback for historic conversations that do not yet have structured message parts.

## Phase 4 — Prompt/protocol retirement for hidden markup

- Stop relying on hidden HTML comment contracts for features that now have canonical structured message parts.
- Replace prompt-level hidden-markup generation with server-owned structured extraction or provider/tool-supported structured output where appropriate.
- Keep any remaining hidden-markup parsing only as a backward-compatibility path while old conversations still exist.

## Phase 5 — Legacy cleanup and completion criteria

- Remove hidden-markup parsing from primary render paths once structured message parts are the default for active conversations.
- Reduce compatibility parsing to a narrow legacy-reader layer for older transcripts only.
- Ensure all major consumers use canonical clean text plus structured parts instead of reparsing raw mixed assistant content.

## Patterns To Borrow

- **Vercel AI SDK UI message metadata / streaming data**
  - borrow the concept of separating visible text from structured UI-facing message metadata and streamed side data
- **OpenAI Structured Outputs**
  - borrow the boundary rule that machine-readable payloads should be schema-validated and distinct from prose generation
- **LangGraph durable execution**
  - borrow the principle that canonical server-owned state should be normalized once at a trusted boundary rather than reconstructed later from lossy artifacts
- **CopilotKit / AG-UI**
  - borrow high-level typed agent-to-UI event ideas only; do not treat these projects as normative architecture for LitRev

## Non-goals

- no big-bang migration
- no immediate rewrite of historic conversation rows
- no second parallel status tracker outside [plan-agentic.md](./plan-agentic.md)
- no continued reliance on hidden HTML comments as the steady-state architecture

## Acceptance Criteria

- new assistant turns persist clean visible text and typed structured parts
- main consumers stop depending on raw hidden markup for normal operation
- malformed machine payloads no longer leak into visible chat
- old conversations continue to work through fallback parsing during migration
