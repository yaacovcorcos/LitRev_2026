# [ARCHIVED]
> **Note:** This file is obsolete. Active plans have moved to `docs/plans/README.md`.

Chat-First Agentic Research Workspace — Implementation Plan
================================================================================

Maintenance: Update this planC file as tasks are completed or changed so all
agents stay in sync. This plan is independent of planB (auth). Both can proceed
in parallel on separate branches.

Vision: LitRev becomes a research workspace where the AI agent is the primary
interaction surface. Users talk to the agent, interactive artifacts appear
inline (study cards, protocol editors, draft blocks, screening decisions), and
the agent handles the research workflow. Manual editing views (Protocol, Ledger,
Draft, Notes) remain fully functional for users who prefer hands-on control or
don't use AI at all. Not an IDE. Not a chatbot. A conversational research
workspace.

================================================================================
Locked-In Decisions
================================================================================

Architecture:
- Chat-first: conversation is the primary workspace surface
- Inline artifacts: interactive cards in conversation for decisions
- Dedicated views: Protocol/Ledger/Draft/Notes for deep manual editing
- Timeline model: typed TimelineItem[] list (not message-centric)
- SSE as transport, DB (RunEvent) as source of truth

Layout:
- Chat at center by default when entering a project
- Chat slides to right panel when a view (Protocol/Ledger/Draft/Notes) opens
- No-AI user: chat collapsed with small icon, tabs work fully standalone
- Mode toggle: per-user default + per-project override

Agent behavior:
- Plan-before-act for multi-step workflows; direct response for questions
- Autonomy: configurable spectrum (manual → assisted → autonomous)
- Agent modes: protocol, scoping, search, screening, drafting, qa, general
- Proactive suggestions based on project state

Artifacts:
- Agent proposes, never silently mutates (the artifact IS the confirmation)
- Compact preview in chat for single items; bottom panel for batches (>3)
- Unified artifact system with typed renderers + apply functions
- Every accepted artifact links to where it landed ("View in Ledger →")

Memory:
- Operates in background regardless of UI mode
- Protocol-memory sync: protocol changes auto-update ProjectMemory
- Negative memory: exclusion rationale stored for PRISMA compliance
- Preference extraction: conservative (inferred = proposed, explicit = auto-stored)

Event logging:
- Full detail, keep everything (prune later if needed)
- Typed query columns alongside JSON payload for performance

Undo:
- Append-only actions (add study, add note): snapshot-based, guaranteed
- Destructive actions (bulk screening): 5-minute window if no intervening edits
- Criteria updates: no undo (always goes through Propose, user reviews)

Safety invariants (hard caps, cannot be overridden by autonomy config):
- update_criteria: max Level 2 (Propose)
- bulk_screening: max Level 3 (Auto-notify)
- delete_study: max Level 2 (Propose)
- edit_draft (full section rewrite): max Level 2 (Propose)

Conversation management:
- Collapsible artifact blocks after acceptance (one-line summary)
- Visual checkpoint dividers ("── Protocol Phase Complete ──")
- Agent offers "summarize and start fresh" for long conversations
- Jump-to-artifact links on every accepted artifact

Notes:
- Scratchpad + save-from-conversation
- Per-project, multiple notes, taggable
- Agent can write notes too

Git:
- Branch v1-stable from current main (preserve current version)
- Branch feat/ide-workspace from main for all IDE work
- Auth (planB Phase 10) proceeds on a separate branch independently

================================================================================
Reference Codebases (steal patterns, not frameworks)
================================================================================

⚠️  ADAPTATION RULES — Read before touching any reference codebase:
  1. NEVER copy-paste code verbatim. Every snippet must be rewritten to fit our
     stack (Next.js 16, React 19, Prisma 7.3, our CSS token system).
  2. Strip framework-specific abstractions. If the reference uses Express
     middleware, Redux, MongoDB, or anything we don't use — extract the idea,
     not the implementation.
  3. Match our naming conventions (camelCase functions, PascalCase components,
     kebab-case CSS modules) and our file layout (lib/server/ for service code,
     app/actions/ for server actions, components/ for UI).
  4. Respect our design system. UI patterns from references must use our tokens
     (tokens.css), glass morphism, warm palette, Outfit font. Never import
     another project's CSS or component library.
  5. Take only what we need. If a reference has a 500-line module and we need
     one pattern from it, extract that pattern — don't port the whole module.
  6. Check licenses before borrowing. MIT and Apache 2.0 are fine. Be cautious
     with AGPL (Open WebUI) and any "source-available" licenses. When in doubt,
     rewrite from scratch using the pattern as inspiration only.
  7. Test after every adaptation. Ported code must pass our existing Vitest
     suite and typecheck (npx tsc --noEmit) before moving on.

Install as dependency:
  1. Vercel AI SDK (npm i ai)               — github.com/vercel/ai
     Streaming (streamText), tool execution loop, tool approval (needsApproval),
     useChat hook, Zod-based tool schemas. Next.js-native. Replaces most of our
     custom streaming plumbing.
  2. cmdk (npm i cmdk)                       — github.com/pacocoursey/cmdk
     Unstyled, composable Cmd+K command palette. ~3KB. Used by Vercel, Linear.
     Style with our CSS tokens. No reason to build from scratch.

Study source code (steal patterns, translate to our codebase):
  3. Mastra                                  — github.com/mastra-ai/mastra
     TypeScript agent framework. Steal: createTool() with Zod + context schema,
     graph-based workflow engine (.then/.branch/.parallel), pause/resume execution
     state, memory retrieval patterns. Study packages/core/src/agent/ and
     packages/core/src/workflows/.
  4. OpenHands Software Agent SDK            — github.com/OpenHands/software-agent-sdk
     Python, but the architecture is gold. Steal: EventStream pub/sub model,
     immutable event log with typed discriminated unions, deterministic state
     replay from event history, event hierarchy (Event → Action/Observation →
     specific types). Study the event model and state reconstruction.
  5. assistant-ui                            — github.com/assistant-ui/assistant-ui
     React chat primitives (Radix-style composable). Steal: ThreadPrimitive /
     MessagePrimitive / ComposerPrimitive decomposition, Tool UI system (render
     tool calls as interactive React components inline), human approval collection
     inline, streaming partial tool call rendering. Study packages/react/src/primitives/.
  6. LibreChat                               — github.com/danny-avila/LibreChat
     Full chat app (Express + MongoDB + React). Steal: conversation list/rename/
     delete/search patterns, artifact version control, mid-stream message persistence,
     per-conversation token tracking. Study api/server/services/ and
     client/src/components/Chat/.
  7. LangGraph.js                            — github.com/langchain-ai/langgraphjs
     Agent orchestration graphs. Steal: State → Node → Edge conditional routing
     pattern, checkpoint snapshots at every step. Too heavy to adopt; just study
     packages/langgraph/src/graph/ for the routing model.
  8. OpenCode                                 — github.com/opencode-ai/opencode
     Open-source coding agent (95K+ stars, from SST team). Go core + TypeScript
     SDK + SolidJS UI. Steal: Permission system (PermissionNext.evaluate() returns
     allow/ask/deny per tool — nearly identical to our autonomy levels), Session
     management (sessions as conversation threads with structured message parts,
     persistent SQLite storage), Question System (structured user input with
     multiple-choice options, pauses execution until user responds — our plan
     approval UX), Agent System (specialized agents with distinct tools/prompts —
     our agent modes), session.compacting hook (injects domain context into
     conversation summarization — our summarize-and-fresh feature), Plugin hooks
     (before/after tool execution — future extensibility). Study packages/opencode/
     for agent logic, packages/sdk/ for typed session/message/tool APIs, and the
     PermissionNext resolution logic.
  9. ASReview LAB                              — github.com/asreview/asreview
     Python systematic review screening tool. The ONLY open-source codebase
     built for our exact domain. Steal: include/exclude labeling UX, exclusion
     reason workflows and ergonomics, ML-assisted screening prioritization
     (rank studies by predicted relevance). Directly informs our ScreeningBatch
     and StudyCard components. Study asreview/webapp/ for the screening UI and
     asreview/models/ for how they rank studies before human review.
  10. Langfuse                                 — github.com/langfuse/langfuse
      LLM observability platform. Best reference for our AgentRun + RunEvent
      infrastructure. Their trace model maps exactly to ours: run = trace,
      tool calls = spans, artifacts = span outputs, timeline = projection of
      the trace. Study their trace schema, cost tracking, and drilldown UI
      for our run inspector. Key insight: model our RunEvent stream as an
      observability trace — this makes Timeline, Inspector, and Context
      Receipts much easier to build (the timeline is a filtered projection
      of the underlying trace, not a separate data structure).

Consider installing if performance requires it:
  11. react-virtuoso (npm i react-virtuoso)    — github.com/petyosi/react-virtuoso
      Virtual scrolling for chat message lists. Built specifically for chat UIs:
      handles reverse scrolling, prepending old messages, maintaining scroll
      position on new arrivals. Only needed if Phase 3.3 (long conversations)
      shows performance issues with large TimelineItem[] lists. Evaluate after
      Phase 3 is built — don't install preemptively.

Testing tooling (adopt early):
  12. promptfoo (npx promptfoo)                — github.com/promptfoo/promptfoo
      Eval harness for regression-testing AI outputs. Use to verify: agent mode
      router accuracy (does "search PubMed" route to search mode?), artifact
      JSON payload validity (do generated payloads pass Zod schemas?), memory
      extraction quality (does extraction hallucinate facts?), citation
      completeness in draft outputs. Set up after Phase 2 is functional.

Evaluated and skipped:
  - Factory.ai / Droid: Interesting concepts (multi-model routing, graph-based
    code understanding) but their GitHub repo is a thin CLI wrapper. The actual
    agent (HyperCode, ByteRank) is proprietary. Nothing actionable to steal.
  - Telegram web clients: Custom Teact framework (not React), WebAssembly TDLib.
    Tech choices too different. react-virtuoso (above) solves the one relevant
    pattern (virtualized message lists) better for our stack.
  - Helicone / OpenLIT: More LLM observability tools. Redundant with Langfuse
    which is the strongest reference for trace/event models. Skip to avoid noise.
  - AnythingLLM: Workspace scoping + PDF ingestion. We already have project
    scoping and pdf-extraction.ts built. Low marginal value.
  - Open WebUI: Chat UI + events. Already covered by LibreChat + assistant-ui.
    License changed in recent versions — adds risk for no new patterns.
  - Microsoft TypeChat: LLM → typed JSON → validation → repair. Good concept
    but we handle this with Zod schemas (Phase 0.4). The retry-on-validation-
    fail idea is worth noting (see 0.4 below) but doesn't warrant a full ref.

================================================================================
Phase 0 — Foundation (no visible changes)
================================================================================

Status:
- [x] 0.1 — Git setup
- [x] 0.2 — Prisma schema additions
- [x] 0.3 — Type definitions
- [x] 0.4 — Tool registry upgrade
- [x] 0.5 — Artifact infrastructure (backend)
- [x] 0.6 — Copilot refactor prep

------------------------------------------------------------------------
0.1 — Git setup
------------------------------------------------------------------------

  git checkout main
  git checkout -b v1-stable     # snapshot of current app
  git push origin v1-stable
  git checkout main
  git checkout -b feat/ide-workspace

------------------------------------------------------------------------
0.2 — Prisma schema additions
------------------------------------------------------------------------

Add to next-app/prisma/schema.prisma:

  model AgentRun {
    id              String    @id @default(cuid())
    projectId       String
    conversationId  String?
    userId          String?   // nullable until auth ships
    trigger         String    // "user_message" | "proactive" | "event"
    agentMode       String    // "protocol" | "scoping" | "search" | "screening" | "drafting" | "qa" | "general"
    status          String    // "running" | "completed" | "failed" | "cancelled"
    model           String?
    costTokensIn    Int       @default(0)
    costTokensOut   Int       @default(0)
    startedAt       DateTime  @default(now())
    completedAt     DateTime?

    events    RunEvent[]
    artifacts Artifact[]

    @@index([projectId, startedAt])
    @@index([conversationId])
    @@index([userId])
  }

  model RunEvent {
    id          String   @id @default(cuid())
    runId       String
    sequence    Int      // auto-increment within run
    type        String   // "message" | "tool_call" | "tool_result" | "artifact_proposed" |
                         //  "artifact_reviewed" | "memory_retrieval" | "context_assembly" |
                         //  "plan_proposed" | "plan_approved" | "checkpoint" | "error"
    payload     Json     // full data
    // Typed columns for querying without scanning JSON:
    toolName    String?
    artifactId  String?
    messageRole String?
    tokensIn    Int?
    tokensOut   Int?
    errorCode   String?
    durationMs  Int?
    createdAt   DateTime @default(now())

    run AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)

    @@index([runId, sequence])
    @@index([runId, type])
    @@index([artifactId])
  }

  model Artifact {
    id              String    @id @default(cuid())
    runId           String
    projectId       String
    conversationId  String?
    userId          String?   // nullable until auth ships
    type            String    // "study_proposal" | "draft_diff" | "screening_batch" |
                              //  "protocol_suggestion" | "criteria_card" | "evidence_table" |
                              //  "plan" | "memory_proposal"
    status          String    // "proposed" | "accepted" | "rejected" | "edited" |
                              //  "auto_applied" | "expired" | "collapsed"
    title           String    // human-readable: "Add 5 studies to ledger"
    payload         Json      // type-specific data
    snapshot        Json?     // before-state for undo
    version         Int       @default(1)   // for re-proposals (edit-first → v2)
    sourceEventId   String?   // links to the RunEvent that created it
    applyId         String?   @unique       // idempotency key
    appliedAt       DateTime?
    appliedByUserId String?
    reviewedAt      DateTime?
    reviewNote      String?
    createdAt       DateTime  @default(now())

    run     AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
    project Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

    @@index([runId])
    @@index([projectId, status])
    @@index([conversationId])
    @@index([type, status])
  }

  model AutonomyConfig {
    id            String   @id @default(cuid())
    userId        String?  // nullable until auth; null = project-level
    projectId     String?  // null = user-level default
    preset        String   // "manual" | "assisted" | "autonomous" | "custom"
    toolOverrides Json     @default("{}") // { "search_pubmed": 3, "add_to_ledger": 2, ... }
    createdAt     DateTime @default(now())
    updatedAt     DateTime @updatedAt

    @@unique([userId, projectId])
    @@index([userId])
    @@index([projectId])
  }

  model Note {
    id                     String   @id @default(cuid())
    projectId              String
    userId                 String?  // nullable until auth
    title                  String?
    content                Json     // TipTap document (same format as Draft)
    tags                   String[] @default([])
    linkedStudyId          String?
    linkedSection          String?
    source                 String   @default("manual") // "manual" | "conversation"
    sourceConversationId   String?
    sourceMessageId        String?
    createdAt              DateTime @default(now())
    updatedAt              DateTime @updatedAt

    project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

    @@index([projectId])
    @@index([projectId, source])
  }

  // Add relation to Project model:
  //   artifacts Artifact[]
  //   notes     Note[]

Push + regenerate:
  cd next-app && npx prisma db push && npx prisma generate

------------------------------------------------------------------------
0.3 — Type definitions
------------------------------------------------------------------------
  STEAL FROM: OpenHands software-agent-sdk — study their multi-level event
  hierarchy (Event → Action/Observation → specific types) for how to structure
  discriminated unions. Also study Vercel AI SDK types/ai.ts for their
  ToolCall, ToolResult, Message type definitions.

CREATE next-app/types/agent.ts:
  - AgentMode = "protocol" | "scoping" | "search" | "screening" | "drafting" | "qa" | "general"
  - RunStatus = "running" | "completed" | "failed" | "cancelled"
  - RunEventType = "message" | "tool_call" | "tool_result" | "artifact_proposed" | ...
  - AgentRunData, RunEventData (matching Prisma models for client use)

CREATE next-app/types/artifacts.ts:
  - ArtifactType = "study_proposal" | "draft_diff" | "screening_batch" | ...
  - ArtifactStatus = "proposed" | "accepted" | "rejected" | "edited" | ...
  - StudyProposalPayload, DraftDiffPayload, ScreeningBatchPayload, etc.
  - Zod schemas for each payload type (validation)

CREATE next-app/types/timeline.ts:
  - TimelineItem union type:
      | { type: "user_message"; content: string; attachments?: ... }
      | { type: "assistant_message"; content: string }
      | { type: "artifact"; artifactId: string; artifactType: ArtifactType;
          status: ArtifactStatus; title: string; payload: unknown }
      | { type: "progress"; message: string; current?: number; total?: number }
      | { type: "checkpoint"; label: string }
      | { type: "error"; message: string; retryable: boolean }

------------------------------------------------------------------------
0.4 — Tool registry upgrade
------------------------------------------------------------------------
  STEAL FROM: Mastra createTool() — study packages/core/src/tools/ for their
  Zod input/output schema pattern + requestContextSchema for runtime validation.
  Also Vercel AI SDK tool() helper (packages/ai/core/tool/) for their
  needsApproval flag and tool definition shape.
  Also OpenCode Permission System — study their PermissionNext.evaluate() which
  returns allow/ask/deny per tool. Their resolution logic (match tool request
  against configured rules) maps directly to our autonomy level checking.
  TypeChat-inspired note: when AI-generated artifact payloads fail Zod
  validation, retry once with the validation error as feedback (repair loop)
  rather than failing the whole tool call.

MODIFY next-app/lib/server/ai/tools/base.ts:
  - Add Zod schemas for input/output validation to AITool interface:
      inputSchema: z.ZodType
      outputSchema: z.ZodType
  - Add autonomy metadata to each tool definition:
      autonomy: {
        defaultLevel: number,      // 1-4
        allowedRange: [min, max],  // e.g. [1, 4]
        hardCap?: number,          // system safety limit, cannot override
      }
  - Add scope parameter to executeTool() for user/project context
  - Wrap executeTool() to:
      1. Validate input against Zod schema
      2. Check autonomy level for current user/project
      3. Execute tool
      4. Validate output against Zod schema
      5. Emit RunEvent (tool_call + tool_result)
      6. If autonomy >= Propose: wrap result as Artifact

MODIFY next-app/lib/server/ai/tools/pubmed-search.ts:
  - Add Zod input/output schemas
  - Add autonomy metadata: { defaultLevel: 2, allowedRange: [1, 4] }

MODIFY next-app/lib/server/ai/tools/add-to-ledger.ts:
  - Add Zod input/output schemas
  - Add autonomy metadata: { defaultLevel: 2, allowedRange: [1, 3] }

------------------------------------------------------------------------
0.5 — Artifact infrastructure (backend)
------------------------------------------------------------------------
  STEAL FROM: OpenHands software-agent-sdk — their EventStream pub/sub model
  and immutable event log with deterministic state replay. Study how they
  reconstruct agent state from event history (our getRunTimeline does the same).
  Also LibreChat — study api/server/services/ for artifact version control
  and mid-stream message persistence patterns.
  Also Langfuse trace model — think of AgentRun as a "trace", RunEvents as
  "spans", and Artifacts as "span outputs". The timeline is a filtered
  projection of the trace, not a separate data model. This framing makes
  future features (run inspector, cost drilldown, context receipts) trivial
  projections rather than new infrastructure.

CREATE next-app/lib/server/agent/artifacts.ts:
  - createArtifact(runId, projectId, type, title, payload, sourceEventId?)
  - reviewArtifact(artifactId, status: "accepted" | "rejected" | "edited", reviewNote?)
  - applyArtifact(artifactId): runs the type-specific apply function
      1. Check idempotency (applyId not already used)
      2. Store snapshot of before-state
      3. Call the registered apply function for this artifact type
      4. Set appliedAt, appliedByUserId
      5. Emit artifact_reviewed RunEvent
  - undoArtifact(artifactId): restore from snapshot
      Only if: append-only action OR within 5-minute window with no intervening edits
  - collapseArtifact(artifactId): set status to "collapsed"
  - getArtifactsForConversation(conversationId)
  - getArtifactsForRun(runId)

  Apply functions registry (type → apply function):
    "study_proposal"       → createStudy() in ledger service
    "draft_diff"           → updateDraft() in drafts service
    "screening_batch"      → bulk updateStudy() status in ledger service
    "protocol_suggestion"  → updateProtocol() in protocols service
    "criteria_card"        → updateProtocol() criteria section
    "memory_proposal"      → createProjectMemory() / createUserMemory()

CREATE next-app/lib/server/agent/run.ts:
  - startRun(projectId, conversationId?, trigger, agentMode, model?)
      Creates AgentRun record, returns runId
  - endRun(runId, status, costTokensIn?, costTokensOut?)
  - cancelRun(runId)

CREATE next-app/lib/server/agent/events.ts:
  - emitEvent(runId, type, payload, extras?): creates RunEvent
      extras = { toolName?, artifactId?, messageRole?, tokensIn?, tokensOut? }
  - getRunEvents(runId): returns ordered RunEvent[]
  - getRunTimeline(runId): returns RunEvent[] formatted for client

CREATE next-app/lib/server/agent/autonomy.ts:
  - getAutonomyConfig(userId?, projectId?): resolves effective config
      Priority: project-specific > user default > system default ("assisted")
  - getToolAutonomyLevel(toolName, config): returns effective level
      Respects hard caps from tool definition
  - HARD_CAPS constant: { update_criteria: 2, delete_study: 2, bulk_screening: 3, edit_draft_rewrite: 2 }

CREATE next-app/app/actions/agent.ts:
  - Server actions wrapping the above for client use
  - reviewArtifactAction(artifactId, status, reviewNote?)
  - undoArtifactAction(artifactId)
  - getRunTimelineAction(runId)
  - updateAutonomyAction(preset, toolOverrides?, projectId?)

------------------------------------------------------------------------
0.6 — Copilot refactor prep (before touching UI)
------------------------------------------------------------------------
  STEAL FROM: assistant-ui — study packages/react/src/primitives/ for their
  composable decomposition: ThreadPrimitive (our TimelineRenderer),
  MessagePrimitive (our message bubbles), ComposerPrimitive (our CopilotInput).
  Their approach of Radix-style primitives with bring-your-own-styles is exactly
  what we want since we have our own CSS token system.

Refactor next-app/components/ProjectCopilot.tsx (currently 38KB) into:

  CREATE next-app/components/copilot/TimelineRenderer.tsx:
    - Receives TimelineItem[] and renders the appropriate component per type
    - Delegates to: MessageBubble, ArtifactCard, ProgressIndicator, Checkpoint

  CREATE next-app/components/copilot/StreamReducer.ts:
    - Pure function: accumulates SSE events into TimelineItem[]
    - Handles: content chunks → assistant_message, artifact events → artifact items,
      progress events → progress items, error events → error items
    - Manages artifact collapse state

  CREATE next-app/components/copilot/CopilotInput.tsx:
    - Extract the input area (text input, send button, attachment, voice)
    - Suggestion chips rendered above the input

  MODIFY next-app/components/ProjectCopilot.tsx:
    - Becomes a thin shell: manages state, delegates rendering to TimelineRenderer
    - Calls StreamReducer to process SSE events
    - Passes TimelineItem[] to TimelineRenderer

  MODIFY next-app/contexts/ProjectCopilotContext.tsx:
    - Replace CopilotMessage[] with TimelineItem[]
    - Add: currentRunId, runStatus
    - Add: artifacts Map<id, Artifact> for quick lookup

Verify: existing copilot behavior unchanged after refactor.
  npx tsc --noEmit
  Manual test: send message, receive streaming response, conversation persistence works.

================================================================================
Phase 1 — Inline Artifact Components
================================================================================

Status:
- [x] 1.1 — ArtifactWrapper (shared shell)
- [x] 1.2 — PlanCard
- [x] 1.3 — StudyCard
- [x] 1.4 — ScreeningBatch
- [x] 1.5 — PICOCard
- [x] 1.6 — CriteriaCard
- [x] 1.7 — DraftBlock
- [x] 1.8 — StreamingProgress
- [x] 1.9 — Message actions (Save to Notes, Copy)

------------------------------------------------------------------------
1.1 — ArtifactWrapper
------------------------------------------------------------------------
  STEAL FROM: assistant-ui Tool UI system — study their ToolUI docs
  (assistant-ui.com/docs/guides/ToolUI) and packages/react/src/ui/ for how
  they render tool calls as interactive React components inline in chat. Their
  pattern of "generative UI displayed in chat, execution on backend" is exactly
  our artifact model. Also study LibreChat client/src/components/Chat/ for
  their artifact card states and version control UI.

CREATE next-app/components/artifacts/ArtifactWrapper.tsx:
  Shared shell for all artifact cards. Handles:
  - Three display states: proposed (full interactive), accepted/rejected (confirmation),
    collapsed (one-line summary with expand toggle)
  - Status badge: proposed (blue), accepted (green), rejected (red)
  - Collapse/expand toggle
  - "Why?" provenance expandable (which criteria matched, which memories used)
  - Error state rendering (tool failed → retry button, partial data → warning)
  - Jump-to-artifact link after acceptance ("View in Ledger →")

CREATE next-app/styles/artifacts.module.css:
  - Card styling consistent with existing glass morphism design system
  - Status colors, collapse animation, button styles
  - Responsive: cards work at various widths

------------------------------------------------------------------------
1.2 — PlanCard
------------------------------------------------------------------------

CREATE next-app/components/artifacts/PlanCard.tsx:
  Proposed state:
    - Numbered step list with descriptions
    - [Run] [Edit query first] [Cancel] buttons
    - Estimated result count if available
  Accepted state:
    "✅ Plan executed: {summary}"
  Collapsed state:
    Same as accepted (plans don't need full re-expansion usually)

  Props: { steps: { label: string; status: string }[]; onRun; onCancel }
  On [Run]: calls reviewArtifactAction(id, "accepted"), triggers agent execution
  On [Cancel]: calls reviewArtifactAction(id, "rejected")

------------------------------------------------------------------------
1.3 — StudyCard
------------------------------------------------------------------------
  STEAL FROM: ASReview LAB — study asreview/webapp/ for their include/exclude
  labeling UX. Their screening flow (one study at a time, clear keep/exclude
  buttons, mandatory exclusion reason) is the gold standard for systematic
  review screening ergonomics. Study how they present key information for
  rapid decisions and how they track exclusion reasons for PRISMA reporting.

CREATE next-app/components/artifacts/StudyCard.tsx:
  Proposed state:
    - Title, authors, year
    - Study type, sample size, key detail
    - Criteria match indicators: ✅P ✅I ✅C ✅O ✅Design ✅N
    - Agent recommendation + confidence percentage
    - [Keep] [Exclude ▾] [Maybe] [See abstract] buttons
    - "Why?" expandable: which criteria matched, source (PubMed search run #N)
  Accepted state:
    "✅ {title} → Kept · View in Ledger"  (or "❌ Excluded: {reason}")
  Collapsed state:
    Same one-liner

  Props: { study: StudyProposalPayload; criteriaMatch: CriteriaMatchResult; onKeep; onExclude; onMaybe }
  On [Keep]: reviewArtifactAction(id, "accepted") → applyArtifact → addStudy to LedgerContext
  On [Exclude]: show reason dropdown first, then reviewArtifactAction(id, "rejected") + create exclusion memory
  On [See abstract]: expand abstract section within card

------------------------------------------------------------------------
1.4 — ScreeningBatch
------------------------------------------------------------------------
  STEAL FROM: ASReview LAB — study their batch screening view and ML-assisted
  prioritization (rank studies by predicted relevance so reviewers see most
  likely includes first). Their exclusion reason categories and "reasons for
  exclusion" summary reporting directly inform our exclusion dropdown and
  PRISMA stats (Phase 5.5).

CREATE next-app/components/artifacts/ScreeningBatch.tsx:
  For >3 study results. Table format with:
    - Row per study: title, type, N, agent recommendation, confidence
    - [Override ▾] per row to change recommendation
    - Filter controls: by recommendation (keep/exclude/maybe), by criteria match count, by study design
    - "Refine query" link if too many results
    - [Accept all recommendations] [Review each] buttons
  Accepted state:
    "✅ Screened {N} studies: {kept} kept, {excluded} excluded, {maybe} maybe"
  Collapsed state:
    Same one-liner

  For batches >10: renders in bottom panel (if available) or as scrollable inline table.
  Props: { studies: StudyProposalPayload[]; onAcceptAll; onReviewEach }

------------------------------------------------------------------------
1.5 — PICOCard
------------------------------------------------------------------------

CREATE next-app/components/artifacts/PICOCard.tsx:
  Proposed state:
    - P, I, C, O fields, each with [edit] button for inline modification
    - [Accept & Save to Protocol] [Discuss more] buttons
  Accepted state:
    "✅ PICO saved to protocol → View Protocol"
  Collapsed state:
    Same one-liner

  Props: { pico: { population, intervention, comparison, outcome }; onAccept; onEdit }
  On [Accept]: reviewArtifactAction → applyArtifact → update protocol.data.pico
  On [edit] per field: inline text editing, then re-propose (version bump)

------------------------------------------------------------------------
1.6 — CriteriaCard
------------------------------------------------------------------------

CREATE next-app/components/artifacts/CriteriaCard.tsx:
  Proposed state:
    - Include list with [remove] per item + [+ Add criterion]
    - Exclude list with [remove] per item + [+ Add criterion]
    - [Save to Protocol] [Discuss more] buttons
  Accepted state:
    "✅ {N} inclusion + {M} exclusion criteria saved"
  Collapsed state:
    Same one-liner

  Props: { inclusion: string[]; exclusion: string[]; onSave; onAdd; onRemove }
  On [Save]: reviewArtifactAction → applyArtifact → update protocol.data.criteria
    Also creates ProjectMemory entries for each criterion (type: "criterion")

------------------------------------------------------------------------
1.7 — DraftBlock
------------------------------------------------------------------------

CREATE next-app/components/artifacts/DraftBlock.tsx:
  Proposed state:
    - Rendered text (not raw markdown) with citations
    - Target section label ("Methods § Study Selection")
    - [Accept → save to draft] [Edit first] [Redo] buttons
  Accepted state:
    "✅ Methods § Study Selection saved → View Draft"
  Collapsed state:
    Same one-liner

  Props: { section: string; content: string; citations: Citation[]; onAccept; onEdit; onRedo }
  On [Accept]: reviewArtifactAction → applyArtifact → update draft.state for that section
  On [Edit first]: opens the draft view focused on that section (user edits manually)
  On [Redo]: sends "redo this section" message to agent

------------------------------------------------------------------------
1.8 — StreamingProgress
------------------------------------------------------------------------
  STEAL FROM: assistant-ui — study how they handle streaming partial tool call
  rendering and loading states. Their useToolUI hook shows tool progress during
  execution.

CREATE next-app/components/copilot/StreamingProgress.tsx:
  Real-time narration during agent work:
    ⏳ Searching PubMed... 47 results found
    ⏳ Deduplicating against ledger... 12 unique studies
    ⏳ Running criteria match on 12 studies... 8/12 complete

  Props: { message: string; current?: number; total?: number }
  Renders: spinner + message + optional progress bar
  Auto-replaces as new progress events arrive (not appended)

------------------------------------------------------------------------
1.9 — Message actions
------------------------------------------------------------------------

MODIFY next-app/components/copilot/TimelineRenderer.tsx:
  Every assistant_message item gets subtle action buttons below:
    [Save to Notes] [Copy]

  [Save to Notes]: calls createNoteAction with content, source: "conversation",
    sourceConversationId, sourceMessageId. Shows brief confirmation toast.
  [Copy]: copies text to clipboard.

Verify: all artifact components render correctly in isolation (Storybook or manual test).
  npx tsc --noEmit

================================================================================
Phase 2 — Agent Streaming + Run Infrastructure
================================================================================

Status:
- [x] 2.1 — AgentRun lifecycle integration
- [x] 2.2 — Artifact-aware tool execution
- [x] 2.3 — Plan-before-act
- [x] 2.4 — Streaming transport upgrade
- [x] 2.5 — Client-side stream processing

------------------------------------------------------------------------
2.1 — AgentRun lifecycle integration
------------------------------------------------------------------------
  STEAL FROM: Vercel AI SDK — their streamText() already handles the full
  tool execution loop with token tracking, max steps, and structured results.
  Study packages/ai/core/generate-text/stream-text.ts for the loop lifecycle.
  Consider using streamText directly as the inner engine and wrapping it with
  our AgentRun/RunEvent recording layer on top. This could replace a large
  chunk of our custom streaming code in ai-service.ts.
  Also OpenHands — their startRun → emitEvents → endRun lifecycle with
  deterministic state replay from the event log is our exact AgentRun model.
  Also Langfuse — study their trace/span schema (github.com/langfuse/langfuse
  packages/shared/prisma/) for how they model traces with nested spans, cost
  rollups, and latency tracking. Our AgentRun = their Trace, our RunEvent =
  their Span. Studying their schema helps ensure our RunEvent model supports
  future features (cost dashboards, latency analysis) without schema changes.

MODIFY next-app/lib/server/ai/ai-service.ts:
  Upgrade streamChatWithTools to create AgentRun:
    1. At start of every user interaction: startRun(projectId, conversationId, "user_message", agentMode)
    2. Emit RunEvents for every tool call, tool result, error
    3. On completion: endRun(runId, "completed", costTokensIn, costTokensOut)
    4. On error: endRun(runId, "failed")
    5. Pass runId through the tool execution flow

  New method: streamChatWithArtifacts()
    - Wraps streamChatWithTools with AgentRun lifecycle
    - Yields extended chunk types (artifact, progress, plan)
    - This becomes the primary streaming method for the copilot

------------------------------------------------------------------------
2.2 — Artifact-aware tool execution
------------------------------------------------------------------------
  STEAL FROM: Vercel AI SDK needsApproval — their tool approval flow is the
  exact same concept as our autonomy levels. Study packages/ai/core/tool/tool.ts
  for the needsApproval flag (can be boolean or function of input), and
  ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage for the client-side
  addToolApprovalResponse pattern. Our Level 1-4 system is a superset of their
  binary approve/deny, but the flow shape is identical.
  Also OpenCode — their Question System pauses execution and presents structured
  choices to the user before proceeding. Same UX as our artifact proposal flow
  where we pause for user review. Study how they handle the async pause/resume.

MODIFY next-app/lib/server/ai/tools/base.ts:
  executeTool now checks autonomy level:
    Level 1 (Suggest): don't execute, return suggestion text for AI to narrate
    Level 2 (Propose): execute, wrap result as Artifact (status: "proposed")
    Level 3 (Auto-notify): execute, create Artifact (status: "auto_applied"), run apply
    Level 4 (Auto-silent): execute, create Artifact (status: "auto_applied"), run apply, no stream event

  For Level 2: yield { type: "artifact", artifact: { id, type, status, title, payload } }
  For Level 3: yield { type: "artifact", artifact: { ... status: "auto_applied" } }

------------------------------------------------------------------------
2.3 — Plan-before-act
------------------------------------------------------------------------
  STEAL FROM: Mastra workflow engine — study packages/core/src/workflows/ for
  their graph-based step orchestration with pause/resume execution state. Their
  .then()/.branch()/.parallel() API shows how to model multi-step plans as
  executable graphs. Our planner is simpler (linear step list), but the
  pause-for-approval → resume-on-accept pattern is the same.

CREATE next-app/lib/server/agent/planner.ts:
  detectMultiStepWorkflow(message, agentMode, tools): boolean
    Simple heuristic: if the resolved intent would use >1 tool, or if the message
    implies a sequence ("search and screen", "find studies and add them"), return true.

  generatePlan(message, agentMode, projectState): PlanStep[]
    Uses a lightweight AI call (fast model) to produce a step list.
    Returns: [{ label, toolName?, description }]

MODIFY next-app/lib/server/ai/ai-service.ts (streamChatWithArtifacts):
  Before executing tools:
    1. Call detectMultiStepWorkflow
    2. If true: generate plan, create plan Artifact, yield as { type: "artifact" }
    3. Wait for plan approval (client sends back "plan_approved" or "plan_rejected")
    4. If approved: execute steps, updating plan step statuses via RunEvents
    5. If rejected or modified: adjust and re-propose

  For single-action requests: skip plan, execute directly.

------------------------------------------------------------------------
2.4 — Streaming transport upgrade
------------------------------------------------------------------------
  STEAL FROM: Vercel AI SDK stream protocol — study ai-sdk.dev/docs/ai-sdk-ui/
  stream-protocol for their data stream format (typed chunks with protocol
  prefixes). If we adopt the AI SDK, this step shrinks dramatically since
  streamText already handles the transport. If not, model our custom protocol
  after theirs — typed JSON lines with event type prefixes, runId on every
  chunk for reconnection.

MODIFY next-app/app/api/ai/stream/route.ts:
  Extended event types in the SSE stream:
    { type: "content", content: string }                    // existing
    { type: "tool_call", toolCall: {...} }                  // existing
    { type: "tool_result", toolResult: {...} }              // existing
    { type: "done", usage: {...} }                          // existing
    { type: "error", error: string }                        // existing
    { type: "artifact", artifact: ArtifactData }            // NEW
    { type: "progress", message, current?, total? }         // NEW
    { type: "plan", plan: PlanArtifactData }                // NEW (subset of artifact)
    { type: "run_start", runId: string }                    // NEW
    { type: "run_end", runId, status, cost }                // NEW

  Include runId in every event so client can reconstruct if stream drops.
  Client can also fetch getRunTimelineAction(runId) to reconcile.

------------------------------------------------------------------------
2.5 — Client-side stream processing
------------------------------------------------------------------------
  STEAL FROM: Vercel AI SDK useChat — study packages/react/src/use-chat.ts
  for their client-side stream accumulation, message state management, loading/
  error handling, and addToolResult / addToolApprovalResponse patterns. If we
  adopt useChat, our StreamReducer becomes a thin adapter that maps AI SDK
  messages to our TimelineItem[] format. If not, replicate their state machine
  (idle → streaming → tool-pending → streaming → done).

MODIFY next-app/components/copilot/StreamReducer.ts:
  Handle new event types:
    "artifact" → add TimelineItem { type: "artifact", ... } to timeline
    "progress" → replace last progress item (or add new one)
    "plan" → add TimelineItem { type: "artifact", artifactType: "plan", ... }
    "run_start" → store currentRunId in context
    "run_end" → clear currentRunId, show completion indicator

MODIFY next-app/contexts/ProjectCopilotContext.tsx:
  - Add currentRunId state
  - Add artifacts Map<string, ArtifactData> for quick lookup
  - When artifact is reviewed (accepted/rejected): update the artifact in the map,
    trigger re-render of the TimelineRenderer

  On artifact accept:
    1. Call reviewArtifactAction(id, "accepted")
    2. Optimistically update local state (artifact status → accepted)
    3. If study_proposal: call addStudy on LedgerContext (real-time view update)
    4. If draft_diff: call saveDraft on DraftContext
    5. If protocol_suggestion/criteria_card: call saveProtocol on ProtocolContext

Verify: end-to-end flow works:
  1. User sends "search PubMed for cardiac MRI"
  2. Agent creates plan → PlanCard appears
  3. User clicks [Run]
  4. StreamingProgress shows "Searching PubMed..."
  5. StudyCard artifacts appear for results
  6. User clicks [Keep] → study appears in Ledger
  npx tsc --noEmit

================================================================================
Phase 3 — Layout + Chat Placement
================================================================================

Status:
- [x] 3.1 — Conversation-centric project view
- [x] 3.2 — No-AI mode
- [x] 3.3 — Conversation management (long sessions)

------------------------------------------------------------------------
3.1 — Conversation-centric project view
------------------------------------------------------------------------
  STEAL FROM: LibreChat — study client/src/components/Chat/ and their
  conversation list sidebar + main chat area layout. Their pattern of
  conversation as primary surface with expandable side panels maps to our
  focusMode concept. Not for visual style (theirs is ChatGPT-clone aesthetic),
  but for the layout state management (which panel is open, resize handles,
  collapse animations). No strong external reference for the focus-mode toggle
  itself — this is novel to our app.

MODIFY next-app/app/project/[id]/layout.tsx:
  Add focusMode state: "conversation" | "view"
  Default: "conversation" (chat at center, full width minus sidebar)

  When focusMode is "conversation":
    - Render conversation (TimelineRenderer) as main content area
    - Tab bar at top: [Overview] [Protocol] [Ledger] [Draft] [Notes]
    - Clicking a tab: sets focusMode to "view", renders that page as main content,
      conversation slides to a collapsible right panel (reuse existing copilot panel layout)

  When focusMode is "view":
    - Selected view renders as main content
    - Copilot panel on right (collapsible, same as current)
    - Clicking "Back to conversation" or closing all view tabs: returns to conversation-centric

  URL behavior: shallow routing or searchParams for view state.
    /project/[id]?view=ledger → focusMode="view", active tab = ledger
    /project/[id] → focusMode="conversation"

  Suggestion chips bar above input:
    - Reads project state (protocol exists? studies count? draft progress?)
    - Shows context-appropriate chips (see Phase 4.2)
    - Clickable: sends as message. Dismissible: remembered in localStorage.

------------------------------------------------------------------------
3.2 — No-AI mode
------------------------------------------------------------------------

  When user hasn't interacted with AI (or explicitly collapses):
    - Tab bar visible, no conversation panel
    - Small AI icon (🤖 or assistant icon) in header to expand chat
    - All views work exactly as they do today
    - Preference stored: per-user default (UserMemory or localStorage)

  Implementation: if isCollapsed and no messages → render full-width view only.

------------------------------------------------------------------------
3.3 — Conversation management (long sessions)
------------------------------------------------------------------------
  STEAL FROM: LibreChat — study their conversation persistence, search, and
  token tracking per conversation. Their per-conversation token budget logic
  informs our summarize-and-fresh threshold. Also study how they handle
  message saving during streaming (not after) for resilience.
  Also OpenCode session.compacting hook — their experimental.session.compacting
  fires before generating a continuation summary and lets you inject domain-
  specific context the default compaction would miss. Exactly what we need:
  inject protocol summary + criteria into the compacted conversation context
  so the agent doesn't lose critical project state after summarize-and-fresh.
  If timeline grows beyond ~100 items, consider react-virtuoso (ref #9) for
  virtual scrolling.

  Artifact collapse: after acceptance, artifact card auto-collapses after 2 seconds
    (with expand toggle). Immediate for auto-applied artifacts.

  Session checkpoints: after major milestones, agent inserts a checkpoint item:
    "── Protocol Defined ──" / "── Screening Complete (8 kept, 3 excluded) ──"
    These are TimelineItem { type: "checkpoint" } and visually distinct.

  Summarize-and-fresh: agent offers periodically (configurable threshold, default: 20 messages):
    "We've covered a lot. Want me to summarize progress and start a fresh conversation?"
    If accepted: creates ConversationSummary, starts new conversation with summary as context.

  Jump-to-artifact: every accepted artifact shows a link:
    "View in Ledger →" / "View in Draft →" / "View Protocol →"
    Clicking sets focusMode to "view" and navigates to the relevant page.

Verify: layout transitions work smoothly, conversation state persists across focus changes.
  npx tsc --noEmit
  Manual test: switch between conversation and view modes, collapse/expand artifacts.

================================================================================
Phase 4 — Agent Intelligence
================================================================================

Status:
- [x] 4.1 — Agent mode router
- [x] 4.2 — Proactive suggestions
- [x] 4.3 — Context-aware system prompts
- [x] 4.4 — Scoping mode (pre-protocol exploration)

------------------------------------------------------------------------
4.1 — Agent mode router
------------------------------------------------------------------------
  STEAL FROM: LangGraph.js — study packages/langgraph/src/graph/ for their
  State → Node → Edge conditional routing pattern. Each "node" is a function
  (our agent mode), each "edge" is a routing decision function based on state
  (our routeToAgent). Their pattern of typed state + conditional edges maps to
  our message + page + projectState → AgentMode router. Our v1 is simpler
  (regex rules), but structuring it as a graph internally makes it easy to
  upgrade to LLM-based routing later.
  Also Mastra — study their agent.ts for how they select tools based on
  agent configuration and context.
  Also OpenCode Agent System — they have specialized agents ("build" for full
  dev access, "plan" for read-only analysis) each with distinct capabilities,
  prompts, and tool access. Same concept as our agent modes. Study how they
  configure per-agent tool sets and system prompts.

CREATE next-app/lib/agent/router.ts:
  routeToAgent(message, currentPage, projectState): AgentMode

  Rules (v1, rule-based):
    - currentPage is "protocol" OR message matches /pico|criteria|inclusion|exclusion|eligib/i
        → "protocol"
    - message matches explicit scoping intent
      /landscape|scoping|what.*out there|research question|exploratory/i
        → "scoping"
    - message matches /search|find stud|pubmed|look for|literature/i AND !projectState.hasProtocol
        → "scoping"
    - message matches /search|find stud|pubmed|look for|literature/i
        → "search"
    - message matches /screen|triage|evaluat|review against|match criteria/i
        → "screening"
    - message matches /write|draft|compose|methods|results|discussion|introduction/i
        → "drafting"
    - message matches /check|verify|cite|unsupported|claim|conflict/i
        → "qa"
    - default → "general"

  Each mode maps to:
    - systemPromptKey: which prompt template to use
    - allowedTools: filtered tool set
    - memoryScope: what memory to retrieve
    - description: shown in mode indicator ("🔍 Search mode")

MODIFY next-app/components/copilot/CopilotInput.tsx:
  Small mode indicator pill above or beside input: "🔍 Search"
  Clicking: shows dropdown to override mode.

------------------------------------------------------------------------
4.2 — Proactive suggestions
------------------------------------------------------------------------

CREATE next-app/lib/agent/suggestions.ts:
  getSuggestions(projectState): SuggestionChip[]

  Rules:
    - No protocol → ["Define your research question", "Help me frame a PICO"]
    - Protocol exists, 0 studies → ["Search PubMed", "Upload PDFs", "Import references"]
    - Unscreened studies > 0 → ["Screen {N} studies", "Review criteria first"]
    - All screened, no draft → ["Draft introduction", "Generate evidence table"]
    - Draft in progress → ["Continue writing", "Check citations", "Review for gaps"]

  SuggestionChip = { label: string; message: string; dismissed: boolean }
  Dismissed chips stored in localStorage per project.

MODIFY next-app/components/copilot/CopilotInput.tsx:
  Render suggestion chips above the text input.
  On click: send chip.message as user message.
  On dismiss (X button): mark dismissed in localStorage.

------------------------------------------------------------------------
4.3 — Context-aware system prompts
------------------------------------------------------------------------

MODIFY next-app/lib/ai/prompts/copilot-prompts.ts:
  Upgrade per-mode prompts to include:
    - Protocol summary (when screening or drafting)
    - Study count and status breakdown
    - Recent decisions from ProjectMemory
    - Relevant criteria (when evaluating studies)
    - Autonomy level context ("the user prefers to review all changes")

  New prompt sections injected dynamically:
    [PROTOCOL_CONTEXT]: PICO + criteria summary (if exists)
    [LEDGER_CONTEXT]: "{N} studies: {kept} included, {excluded} excluded, {maybe} pending"
    [MEMORY_CONTEXT]: relevant memories (from retrieval pipeline)
    [AUTONOMY_CONTEXT]: current preset + any hard caps

  Agent instruction additions:
    - "When proposing studies, format results as structured study_proposal artifacts"
    - "When writing draft text, format as draft_diff artifacts with target section"
    - "For multi-step requests, propose a plan first and wait for approval"
    - "Always explain your reasoning in the 'why' provenance field"

Verify: agent routes correctly and produces appropriate inline artifacts.
  Manual test: send messages that trigger each mode, verify correct system prompt and tools.
  After Phase 4 is stable: set up promptfoo (ref #12) eval suite to regression-test
  router accuracy, artifact JSON payload validity, and citation completeness.

------------------------------------------------------------------------
4.4 — Scoping mode (pre-protocol exploration)
------------------------------------------------------------------------

Implementation progress:
  - [x] Add "scoping" to AgentMode + AGENT_MODE_META
  - [x] Add AGENT_MODE_CONFIG.scoping with mode-level tool allowlist
  - [x] Add router disambiguation rules (explicit scoping intent + no-protocol search-intent)
  - [x] Add AGENT_MODE_PROMPTS.scoping template
  - [x] Expose "scoping" in input mode selector
  - [x] Route with protocol-awareness in input mode detection (hasProtocol signal)
  - [x] Contextual tool filtering: hide recommend_studies when no seedable identifiers exist
  - [x] Add/extend tests: router + tool filtering
  - [x] Low-autonomy batch search-pack approval behavior
  - [x] Deterministic handoff action (selected question -> update_protocol proposal)
  - [x] Strict machine-validated scoping response contract
  - [x] Feature flag + staged rollout wiring
  - [x] Add/extend tests: scoping contract + handoff selection parsing
  - [x] Add explicit tests: contextual recommend_studies filtering + low-autonomy batch-plan trigger
  - [x] Document scoping feature-flag defaults in env/docs
  - [x] Add visible `scoping_report` artifact type + timeline card renderer

Latest implementation notes:
  - Feature flag wired via `NEXT_PUBLIC_ENABLE_SCOPING_MODE` (client) and `ENABLE_SCOPING_MODE` (server fallback):
      - router falls back to `search` when scoping is disabled
      - user mode picker hides `scoping` when disabled
      - server normalizes inbound `agentMode="scoping"` -> `search` when disabled
  - Low-autonomy scoping behavior:
      - if scoping is selected and search autonomy is Suggest-level, server returns one `plan` artifact:
        "Exploratory Search Pack" (single approval path) instead of triggering many per-search approvals
  - Deterministic handoff:
      - server parses latest scoping report from assistant history
      - detects user selection (`question 2`, `option 2`, ordinal words, verbatim question text, or single-option "yes")
      - injects/forces `update_protocol` call with `field=researchQuestion` and selected question text
  - Strict response contract:
      - scoping replies persist a machine-validated contract as hidden HTML comment:
        `<!-- SCOPING_REPORT: {...} -->`
      - schema-validated parser supports comment, XML block, and fenced fallback forms
      - fallback contract is generated server-side when missing to guarantee parseability for handoff
  - Additional hardening:
      - direct unit tests for `getContextualToolDefinitions` seed/no-seed behavior
      - direct unit tests for `shouldUseScopingBatchPlan` + `buildScopingSearchPackPlan`
      - flag defaults documented in `next-app/.env.local.example` and `AGENTS.md`
  - UX visibility:
      - each completed scoping synthesis now emits a `scoping_report` artifact
      - card is rendered inline in timeline with topic, searches, landscape, questions, and next step
      - artifact auto-marked `auto_applied` (informational; no approval buttons)
  - UX iteration:
      - `ScopingReportCard` is now decision-first (recommended questions + direct action buttons)
      - one-click actions from the card now send scoping prompts directly on both project conversation and `/ai`
      - protocol handoff remains proposal-first (`update_protocol`) and requires explicit user approval
      - scoping mode inference in input keeps scoping stable across turns unless protocol transition is explicit

Purpose:
  Add a dedicated "scoping" mode for users who do not yet have a well-formed
  review question and need a landscape view of the literature before protocol
  definition.

Mode behavior (v1):
  - Run 3-5 exploratory searches across different angles
    (population/intervention/outcome/design/timeframe)
  - Synthesize landscape: major themes, evidence density, notable gaps
  - Propose 2-3 refined research questions with feasibility rationale
  - End with a clear handoff question into Protocol mode

Triggering:
  - Keep protocol-intent rules highest priority.
  - Route to scoping when:
      - explicit scoping language ("what's out there", "landscape", "scoping", "exploratory")
      - OR search-intent text while protocol is missing (!projectState.hasProtocol)
  - Route to search (not scoping) for specific search queries when protocol exists.
  - Allow explicit re-entry into scoping even after protocol exists.
  - Router rule examples (next-app/lib/agent/router.ts):
      if (/landscape|scoping|what.*out there|what.*been (?:done|studied)|feasib|is there enough|exploratory/i.test(msg)) return "scoping";
      if (!projectState.hasProtocol && /search|find stud|pubmed|look for|literature/i.test(msg)) return "scoping";
      // keep explicit search rule below this, so protocol-backed search requests stay in "search"

Tool policy:
  - Allowed by default:
      - search_pubmed
      - search_semantic_scholar
  - Conditionally allowed:
      - recommend_studies (only if seed studies exist in ledger)
  - Allowed with strict policy:
      - store_memory only for explicit durable user preferences/decisions
        (not transient literature findings)
  - Disallowed in v1:
      - add_to_ledger, bulk_screening, exclude_study, update_study, update_note
      - update_protocol except explicit handoff step after user choice
  - Context requirement:
      - ensure [LEDGER_CONTEXT] includes study count and seedable studies when present
      - prompt rule: if ledger count is 0, skip recommend_studies entirely
      - seed rule: recommend_studies may run only when at least 1 seed study has DOI/PMID/S2 id

Autonomy UX:
  - Respect existing preset/tool autonomy (no hardcoded mode-level L4).
  - For low-autonomy presets, use one batch-approval step:
      "I plan to run these N exploratory searches. Proceed?"
    If approved, execute as one search pack and return one synthesis.
  - Use existing PlanCard pattern for search pack approval:
      [Run search pack] [Edit queries] [Cancel]

Output contract (v1, structured response first):
  - topic
  - searchesRun[]: source, query, resultCount
  - landscape:
      evidenceDensity (sparse|moderate|dense)
      majorThemes[]
      methodologicalPatterns[]
      timeRange { earliest?, latest? }
      notableGaps[]
  - recommendedQuestions[]:
      question, rationale, feasibility (low|medium|high), novelty (low|medium|high)
  - nextStep (explicit protocol handoff prompt)
  Note: strict structured output remains canonical, and a dedicated
  scoping_report artifact/card UI is now implemented for visibility.
  - Synthesis implementation note:
      - v1 synthesis is prompt-driven from accumulated search results
      - no separate synthesize_literature tool in v1

Handoff flow:
  - Agent ends report with explicit prompt:
      "I recommend Question X. Ready to build your protocol around it?"
  - User confirms ("yes" / "use question X")
  - Agent proposes update_protocol with researchQuestion set to selected question
  - User reviews/accepts (no silent auto-save), then continue in protocol mode

Prompt template stub (add to AGENT_MODE_PROMPTS.scoping):
  - Workflow:
      1. Run 3-5 diverse exploratory searches (PubMed + Semantic Scholar)
      2. Synthesize landscape (themes, methods, gaps, evidence density)
      3. Propose 2-3 refined research questions with rationale
      4. Ask for question selection; on confirmation, propose update_protocol
  - Search diversification guidance:
      1. Broad query: core concepts + synonyms
      2. Intervention/exposure-focused query
      3. Outcome-focused query
      4. Methodological query (study design filters)
      5. Interdisciplinary query (Semantic Scholar)
      - Avoid near-duplicate queries; each query should add new coverage
  - Rules:
      - Do not add studies to ledger in scoping mode
      - Do not update protocol before explicit user selection
      - Use recommend_studies only when seed studies exist
      - Use store_memory only for durable preferences, not transient topic findings
      - store_memory examples:
          YES: "User prefers population-focused questions over intervention-focused"
          YES: "User prioritizes novelty over feasibility"
          NO: "This topic has ~40 RCTs"
          NO: "User asked about mindfulness and pain"

Validation and rollout:
  - Add tests for routing priority and tool filtering in scoping mode
  - Add conditional recommend_studies tests:
      - Scenario A: ledger empty -> skip recommend_studies
      - Scenario B: ledger has seeds -> recommend_studies may be used
  - Add low-autonomy batch-approval test:
      - one search-pack approval instead of per-query approvals
  - Add eval set for synthesis quality and handoff clarity
  - Feature-flag rollout:
      ENABLE_SCOPING_MODE -> internal dogfood -> full rollout after eval pass
  - Implementation checklist:
      - next-app/types/agent.ts:
          add "scoping" to AgentMode and AGENT_MODE_META
      - next-app/lib/agent/router.ts:
          add scoping trigger rules and AGENT_MODE_CONFIG.scoping
      - next-app/lib/ai/prompts/copilot-prompts.ts:
          add AGENT_MODE_PROMPTS.scoping template
      - next-app/lib/server/ai/ai-service.ts:
          enforce mode-filtered tool allowlist + low-autonomy search-pack behavior
      - next-app/lib/server/__tests__/tool-filtering.test.ts:
          add scoping tool allowlist assertions
      - next-app/lib/agent/__tests__/router.test.ts:
          add scoping trigger and disambiguation tests
      - add/extend tests for conditional recommend_studies:
          Scenario A: empty ledger -> skip
          Scenario B: seedable studies present -> may use recommend_studies

================================================================================
Phase 5 — Memory System (Deep Rework)
================================================================================

Status:
- [x] 5.1 — Protocol-memory sync
- [x] 5.2 — Decision memory extraction
- [x] 5.3 — Conversation memory extraction
- [x] 5.4 — Memory retrieval upgrade
- [x] 5.5 — Negative memory for PRISMA
- [ ] 5.6 — Memory dashboard

------------------------------------------------------------------------
5.1 — Protocol-memory sync
------------------------------------------------------------------------
  STEAL FROM: Mastra — study their memory system in packages/core/src/memory/
  for how they handle conversation history + semantic memory retrieval. Their
  context management patterns ("give agents the right context at the right
  time") inform our deterministic scope rules. Our memory system is more
  domain-specific (PICO, criteria, exclusions) but the retrieval + injection
  pattern is the same.

  No strong external reference for protocol-sync specifically — this is
  domain-specific to systematic review workflows.

CREATE next-app/lib/server/memory/protocol-sync.ts:
  syncProtocolToMemory(projectId, protocolData):
    - Extract PICO fields → upsert ProjectMemory (type: "definition", category: "population"|etc.)
    - Extract inclusion criteria → upsert ProjectMemory (type: "criterion", category: "inclusion")
    - Extract exclusion criteria → upsert ProjectMemory (type: "criterion", category: "exclusion")
    - Diff against existing: create new, revise changed, archive removed
    - All created memories: importance = "critical"

MODIFY next-app/app/actions/protocols.ts (saveProtocolAction):
  After saving protocol, call syncProtocolToMemory().

MODIFY artifact apply for criteria_card and protocol_suggestion:
  After applying, call syncProtocolToMemory().

------------------------------------------------------------------------
5.2 — Decision memory extraction
------------------------------------------------------------------------

Triggered automatically by artifact review:

  On study accepted (study_proposal artifact):
    - If AI-extracted metadata available: create StudyMemory entries
      (type: "summary", source: "ai_generated", confidence from AI)

  On study excluded (study_proposal artifact rejected):
    - Create ProjectMemory (type: "decision", category: "exclusion")
      statement: "Excluded: {study title}"
      rationale: user-selected reason from Exclude dropdown
      context: which criteria failed
      tags: [studyId]
      importance: "normal"

  On draft section accepted (draft_diff artifact):
    - Create ProjectMemory (type: "decision")
      statement: "Accepted draft for {section name}"
      context: brief summary of what was written

  On user correction of AI output:
    - If user edits an artifact before accepting: compare original vs edited
    - If pattern detectable (e.g., removed all passive voice): propose as UserMemory preference
      (via memory_proposal artifact, not auto-stored)

------------------------------------------------------------------------
5.3 — Conversation memory extraction
------------------------------------------------------------------------

CREATE next-app/lib/server/memory/conversation-extractor.ts:
  extractMemoriesFromConversation(conversationId, messages):
    - Lightweight AI call (fast model) to identify:
      1. Explicit decisions ("let's exclude case studies")
      2. Stated preferences ("use APA format", "keep it formal")
      3. Key facts mentioned ("the primary outcome is sensitivity")
    - Returns: { decisions: [], preferences: [], facts: [] }

  Trigger: after conversations with >5 substantive messages (user + assistant).
  Policy: explicit decisions → auto-store as ProjectMemory.
           Inferred preferences → propose as memory_proposal artifact.

MODIFY agent run completion (endRun in run.ts):
  After run completes, check message count. If >5, schedule extraction.
  Extraction runs as background task (not blocking the response).

------------------------------------------------------------------------
5.4 — Memory retrieval upgrade
------------------------------------------------------------------------
  STEAL FROM: Mastra — study their context management for how they budget
  tokens across memory layers and decide what to include/exclude. Their
  pattern of combining structured retrieval (always include X) with relevance
  scoring (rank the rest) matches our deterministic scope + keyword fallback.
  For context receipts UX inspiration: study Onyx (github.com/onyx-dot-app/onyx)
  for their "what did we include and why?" display pattern — shows users which
  documents fed into a response. Our context_assembly RunEvent serves the same
  purpose (which memories, how many tokens, what was excluded and why).

MODIFY next-app/lib/server/memory/memory-retrieval.ts:
  Add deterministic scope rules (more reliable than keyword matching alone):
    - Always include ProjectMemory with importance = "critical"
    - When agentMode = "screening": always include all criteria (type: "criterion")
    - When agentMode = "drafting": include StudyMemories for all cited studies
    - When agentMode = "qa": include exclusion rationale (category: "exclusion")
    - Always include active UserMemory preferences

  Keep keyword relevance scoring as secondary ranking within each scope.

  Emit context_assembly RunEvent with:
    - Which memories were included (IDs + content snippets)
    - Token count per memory layer (user, project, study)
    - Total budget used vs limit
    - What was excluded and why (too low relevance, budget exceeded)

  Budget: default 2000 tokens for memory context. Configurable.

------------------------------------------------------------------------
5.5 — Negative memory for PRISMA
------------------------------------------------------------------------

  Already handled by 5.2 (exclusion decisions create ProjectMemory entries).

  Additional:
    CREATE next-app/lib/server/memory/prisma-stats.ts:
      getPRISMAStats(projectId):
        - Count studies by status (identified, screened, excluded, included)
        - Group exclusion reasons from ProjectMemory (category: "exclusion")
        - Return structured data for PRISMA flowchart generation

    This feeds future PRISMA diagram feature (not in this plan, but data is ready).

------------------------------------------------------------------------
5.6 — Memory dashboard
------------------------------------------------------------------------

CREATE next-app/components/MemoryDashboard.tsx:
  Accessible from project shell `Memory` tab and direct `/project/[id]/memory` route.
  Sections:
    - Project Memory: grouped by type (criteria, decisions, goals, exclusions)
    - Study Memory: per study, expandable
    - Your Preferences: UserMemory entries
  Each item:
    - Editable (inline edit → calls updateProjectMemory/updateUserMemory)
    - Deletable (with confirmation)
    - Shows provenance: "AI-extracted" | "User-defined" | "From protocol sync"
    - Shows date created/updated
  "What does the AI know about this project?" button: generates formatted summary.

CREATE next-app/app/actions/memory-dashboard.ts:
  Server actions for the dashboard:
    - getProjectMemoryGrouped(projectId)
    - getStudyMemoriesGrouped(projectId)
    - getUserPreferences()
    - updateMemory(id, changes)
    - deleteMemory(id)

Verify: memory system is functional end-to-end.
  Test: define criteria in protocol → verify ProjectMemory created
  Test: exclude study via StudyCard → verify exclusion memory created
  Test: memory dashboard shows all entries, editable
  npx tsc --noEmit
  npx vitest run

================================================================================
Phase 6 — Notes System
================================================================================

Status:
- [x] 6.1 — Notes service layer
- [x] 6.2 — Notes view
- [x] 6.3 — Save-from-conversation
- [x] 6.4 — Agent note creation

------------------------------------------------------------------------
6.1 — Notes service layer
------------------------------------------------------------------------

CREATE next-app/lib/server/notes.ts:
  - createNote(projectId, input: { title?, content, tags?, linkedStudyId?, source, ... })
  - getNote(id)
  - listNotes(projectId, options?: { tags?, source?, search? })
  - updateNote(id, input)
  - deleteNote(id)
  - searchNotes(projectId, query): full-text search on title + content

CREATE next-app/app/actions/notes.ts:
  Server actions wrapping the above.

------------------------------------------------------------------------
6.2 — Notes view
------------------------------------------------------------------------
  No strong external steal-from reference. This is standard CRUD + TipTap
  editor (already in our codebase for Draft). Reuse the Draft editor component
  and existing list patterns from Ledger view for the note list sidebar.

CREATE next-app/app/project/[id]/notes/page.tsx:
  Left sidebar: list of notes (title, date, tags, source icon)
  Main area: TipTap editor (same as Draft editor)
  Top bar: title (editable), tags (chips), linked study indicator
  Create new note: [+ New Note] button
  Search: text input above note list

CREATE next-app/app/project/[id]/notes/notes.module.css:
  Consistent with existing page styles.

------------------------------------------------------------------------
6.3 — Save-from-conversation
------------------------------------------------------------------------

Already wired in Phase 1.9 ([Save to Notes] button on messages).
  Creates note with:
    source: "conversation"
    sourceConversationId: current conversation
    sourceMessageId: the message ID
    content: the message text (as TipTap JSON)
    title: auto-generated from first ~50 chars

------------------------------------------------------------------------
6.4 — Agent note creation
------------------------------------------------------------------------

  Agent can propose notes as artifacts (type: "memory_proposal" with subtype "note"):
    "I'll save this comparison table as a note for your reference."
  On accept: createNote with source: "conversation", linked to current conversation.

Verify: notes CRUD works, save-from-conversation works, notes appear in list.
  npx tsc --noEmit

================================================================================
Phase 7 — Autonomy Configuration
================================================================================

Status:
- [x] 7.1 — Autonomy resolution logic
- [x] 7.2 — Preset UI
- [x] 7.3 — Fine-grained config UI

------------------------------------------------------------------------
7.1 — Autonomy resolution logic
------------------------------------------------------------------------
  STEAL FROM: Vercel AI SDK needsApproval — study how their approval flag
  can be a function of tool input (dynamic per-call decisions). Their pattern
  of "store user preferences to remember approved patterns" informs our
  per-user/per-project override system. Our 5-level scale (Disabled/Suggest/
  Propose/Auto-notify/Auto-silent) is a superset of their binary model.
  Also OpenCode Permission System — their PermissionNext.evaluate() returns
  allow/ask/deny with configurable rules per tool. Study their resolution
  priority logic (project-level > user-level > default). Maps directly to
  our AutonomyConfig resolution (project-specific > user default > system).

Already implemented in Phase 0.5 (autonomy.ts).
Verify integration with tool execution (Phase 2.2).

Default preset matrix:

  Tool               Manual  Assisted  Autonomous
  search_pubmed        1       2          4
  extract_pdf          1       3          4
  add_to_ledger        1       2          3
  exclude_study        1       2          3
  edit_draft           1       2          3
  update_criteria      1       2          2  (hard cap)
  delete_study         1       2          2  (hard cap)
  bulk_screening       1       2          3  (hard cap)
  retrieve_memory      1       4          4
  create_note          1       3          4

------------------------------------------------------------------------
7.2 — Preset UI
------------------------------------------------------------------------

MODIFY next-app/components/copilot/CopilotInput.tsx (or header area):
  Preset selector: three buttons or dropdown:
    [Manual] [Assisted] [Autonomous]
  Currently active preset highlighted.
  Changing preset: calls updateAutonomyAction(preset, null, projectId).

------------------------------------------------------------------------
7.3 — Fine-grained config UI
------------------------------------------------------------------------

CREATE next-app/components/AutonomySettings.tsx:
  Accessible from project settings or from the preset selector ("Customize...").
  Table of tools with slider or dropdown per tool (levels 0-4).
  Hard caps shown as disabled max values.
  "Reset to preset" button.

  Per-user default: set from user settings (no projectId).
  Per-project override: set from project settings.

Verify: autonomy levels are respected during agent runs.
  Test: set to Manual → agent only suggests, never executes tools
  Test: set to Autonomous → agent auto-applies with notifications
  Test: hard cap → criteria update always prompts even at Autonomous

================================================================================
Phase 8 — Command Palette + Polish
================================================================================

Status:
- [x] 8.1 — Command palette
- [x] 8.2 — Keyboard shortcuts
- [x] 8.3 — Status indicator

------------------------------------------------------------------------
8.1 — Command palette
------------------------------------------------------------------------
  USE DIRECTLY: cmdk (npm i cmdk) — unstyled, composable Cmd+K component.
  ~3KB. Style with our CSS tokens (glass morphism overlay, warm palette).
  Study github.com/pacocoursey/cmdk for the API. Sections, fuzzy search,
  and keyboard navigation come built-in.

CREATE next-app/components/CommandPalette.tsx:
  Trigger: Cmd+K (Mac) / Ctrl+K (Windows)
  Sections:
    Navigation: "Go to Protocol", "Go to Ledger", "Go to Draft", "Go to Notes"
    Agent actions: "Search PubMed", "Screen studies", "Draft introduction"
    Quick search: find study by name, search notes
    Mode: "Switch to Manual", "Switch to Autonomous"
    Recent: last 5 actions

  Fuzzy search on action labels.
  Context-aware: available actions change based on current page and project state.

CREATE next-app/styles/command-palette.module.css:
  Overlay with glass morphism, centered, search input at top, results below.

------------------------------------------------------------------------
8.2 — Keyboard shortcuts
------------------------------------------------------------------------

CREATE next-app/hooks/useKeyboardShortcuts.ts:
  Cmd+K: open command palette
  Cmd+/: toggle copilot panel (when in view mode)
  Cmd+B: toggle sidebar
  Escape: close palette/panel
  Cmd+Enter: send message (when input focused)

Wire into app layout.

------------------------------------------------------------------------
8.3 — Status indicator
------------------------------------------------------------------------

MODIFY next-app/app/project/[id]/layout.tsx:
  Small status bar or badge area showing:
    - Current agent mode pill ("🔍 Search")
    - Active run indicator (spinning when agent is working)
    - Token usage today (from AIUsage query, cached)

  Subtle, non-intrusive. Visible in both conversation and view modes.

Verify: command palette works, shortcuts work, status updates correctly.
  npx tsc --noEmit
  npx next build

================================================================================
File Inventory
================================================================================

New files (~30):
  next-app/types/agent.ts                            Agent/run type definitions
  next-app/types/artifacts.ts                        Artifact types + Zod schemas
  next-app/types/timeline.ts                         TimelineItem union type
  next-app/lib/server/agent/run.ts                   AgentRun lifecycle
  next-app/lib/server/agent/events.ts                RunEvent creation/querying
  next-app/lib/server/agent/artifacts.ts             Artifact CRUD + apply/undo
  next-app/lib/agent/router.ts                       Agent mode routing
  next-app/lib/server/agent/planner.ts               Plan-before-act logic
  next-app/lib/server/agent/autonomy.ts              Autonomy level resolution
  next-app/lib/server/notes.ts                       Notes service layer
  next-app/lib/server/memory/protocol-sync.ts        Protocol → memory sync
  next-app/lib/server/memory/conversation-extractor.ts  Memory extraction from conversations
  next-app/lib/server/memory/prisma-stats.ts         PRISMA flowchart data
  next-app/lib/agent/suggestions.ts                  Proactive suggestion logic
  next-app/app/actions/agent.ts                      Agent server actions
  next-app/app/actions/notes.ts                      Notes server actions
  next-app/app/actions/memory-dashboard.ts           Memory dashboard actions
  next-app/app/project/[id]/notes/page.tsx           Notes page
  next-app/app/project/[id]/notes/notes.module.css   Notes styles
  next-app/components/artifacts/ArtifactWrapper.tsx   Shared artifact shell
  next-app/components/artifacts/PlanCard.tsx          Plan-before-act card
  next-app/components/artifacts/StudyCard.tsx         Study proposal/screening card
  next-app/components/artifacts/ScreeningBatch.tsx    Batch screening table
  next-app/components/artifacts/PICOCard.tsx          PICO framework editor
  next-app/components/artifacts/CriteriaCard.tsx      Criteria editor card
  next-app/components/artifacts/DraftBlock.tsx        Draft section acceptance
  next-app/components/copilot/TimelineRenderer.tsx    Timeline item renderer
  next-app/components/copilot/StreamReducer.ts        SSE → TimelineItem accumulator
  next-app/components/copilot/CopilotInput.tsx        Input + suggestions + mode
  next-app/components/copilot/StreamingProgress.tsx   Real-time progress
  next-app/components/MemoryDashboard.tsx             Memory viewer/editor
  next-app/components/AutonomySettings.tsx            Per-tool autonomy config
  next-app/components/CommandPalette.tsx              Cmd+K action launcher
  next-app/hooks/useKeyboardShortcuts.ts              Global keyboard shortcuts
  next-app/styles/artifacts.module.css                Artifact card styles
  next-app/styles/command-palette.module.css          Command palette styles

Modified files (~15):
  next-app/prisma/schema.prisma                      Add AgentRun, RunEvent, Artifact, AutonomyConfig, Note
  next-app/app/project/[id]/layout.tsx               Workspace shell + focus mode
  next-app/contexts/ProjectCopilotContext.tsx         TimelineItem[], artifacts Map, currentRunId
  next-app/components/ProjectCopilot.tsx              Thin shell delegating to copilot/ subcomponents
  next-app/lib/server/ai/ai-service.ts               AgentRun integration, streamChatWithArtifacts
  next-app/lib/server/ai/tools/base.ts               Zod validation, autonomy checks, event logging
  next-app/lib/server/ai/tools/pubmed-search.ts      Add schemas + autonomy metadata
  next-app/lib/server/ai/tools/add-to-ledger.ts      Add schemas + autonomy metadata
  next-app/app/api/ai/stream/route.ts                New event types
  next-app/lib/server/memory/memory-retrieval.ts     Scope rules, context receipts
  next-app/lib/server/memory/project-memory.ts       Protocol sync, exclusion category
  next-app/lib/ai/prompts/copilot-prompts.ts         Mode-specific prompts, context injection
  next-app/app/actions/protocols.ts                  Protocol-memory sync hook
  next-app/components/Sidebar.tsx                    Notes + Memory links

================================================================================
Golden Path (End-to-End Demo Workflow)
================================================================================

1. User creates project, lands on conversation-centric view.
   Suggestion chips: "Define your research question" · "Help me frame a PICO"

2. User: "I want to do a systematic review on the accuracy of cardiac MRI
   for detecting myocarditis in young athletes"
   Agent (Protocol mode): responds with PICOCard artifact inline.
   User clicks [Accept & Save to Protocol].
   Card collapses: "✅ PICO saved → View Protocol"
   Memory: 4 ProjectMemory entries created (P, I, C, O).

3. Agent suggests criteria. CriteriaCard appears.
   User modifies (removes one, adds one), clicks [Save to Protocol].
   Card collapses: "✅ 3 inclusion + 3 exclusion criteria saved"
   Memory: criteria synced to ProjectMemory.

4. Suggestion chips update: "Search PubMed" · "Upload PDFs"
   User clicks "Search PubMed" chip.
   PlanCard appears: "1. Build query from PICO, 2. Search PubMed, 3. Deduplicate"
   User clicks [Run].
   StreamingProgress: "Searching PubMed... 47 found... deduplicating... 12 unique"

5. ScreeningBatch appears (12 studies, table format).
   Agent recommendations shown per row with confidence.
   User reviews, overrides 2 decisions, clicks [Accept all].
   Batch collapses: "✅ Screened 12: 8 kept, 3 excluded, 1 maybe"
   Memory: 3 exclusion memories created with reasons.
   Ledger: 8 studies now visible in Ledger view.

6. Suggestion chips update: "Draft introduction" · "Generate evidence table"
   User: "Draft the methods section"
   DraftBlock appears with rendered text + citations.
   User clicks [Accept → save to draft].
   Block collapses: "✅ Methods § Study Selection saved → View Draft"

7. User clicks "View Draft →" → layout switches to Draft view with chat as side panel.
   User edits the draft directly in TipTap. Chat available for questions.

8. At any point: user can open Memory dashboard to see what the AI knows,
   open Notes to review saved insights, or switch autonomy preset.

================================================================================
Dependencies Between Phases
================================================================================

Phase 0 → everything (foundation must be first)
Phase 1 → Phase 2 (components need streaming to render live)
Phase 2 → Phase 4 (streaming needs router for mode selection)
Phase 3 can proceed in parallel with Phase 2
Phase 5 can proceed in parallel with Phase 2-3 (memory backend independent of UI)
Phase 6 can proceed after Phase 0.2 (needs Note model)
Phase 7 depends on Phase 0.5 (needs autonomy infrastructure)
Phase 8 is independent polish, can be last

Recommended parallel tracks:
  Track A: Phase 0 → Phase 1 → Phase 2 → Phase 4 → Phase 8
  Track B: Phase 0 → Phase 5 → Phase 6
  Track C: Phase 0 → Phase 3 → Phase 7
