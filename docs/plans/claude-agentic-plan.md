# Agent Architecture Improvements — From Article Principles to LitRev Implementation

## Context

An article about building Claude Code agents articulated 7 principles for agent design. Three of those principles expose real gaps in LitRev's current agent architecture. This plan details what we have today, what's broken, how each improvement raises quality and UX, and exact implementation steps.

---

## Improvement 1 — Structured `ask_user` Tool (HIGH PRIORITY)

**Article principle:** "Prompts are not protocols — tools are." Separate cognitive phases (plan vs ask vs act).

### What We Have Today

| Component | Location | How It Works |
|---|---|---|
| `<choices>` XML extraction | [choices-extractor.ts](next-app/lib/server/ai/choices-extractor.ts) | System prompt tells the AI to emit `<choices>` XML at end of response. Server-side `withChoicesExtraction()` parses it from the raw stream via a holdback-buffer state machine. |
| Choice chip rendering | [CopilotInputCore.tsx:371-400](next-app/components/copilot/CopilotInputCore.tsx#L371-L400) | `pendingChoices` state renders as clickable chips above the textarea. Clicking sends the choice value as the next user message. |
| Autonomy Level 1 (Suggest) | [ai-service.ts:590-598](next-app/lib/server/ai/ai-service.ts#L590-L598) | Returns a canned string `"[Suggestion] I would call 'X' with Y. Approve this action to proceed."` — no UI, no approval button, just text the AI reads back. |
| Suggestion chips (static) | [SuggestionChips.tsx](next-app/components/project/SuggestionChips.tsx) + [suggestions.ts](next-app/lib/agent/suggestions.ts) | Context-aware static chips on empty copilot state. Not AI-generated. Uses prefill pattern (fills textarea, user can edit before sending). |

### What's Wrong

1. **Choices are probabilistic.** The model sometimes skips the `<choices>` block, emits malformed XML, or embeds it mid-response. This is exactly "Attempt 2" from the article — prompt constraints as a protocol. It works 80% of the time but fails unpredictably.
2. **No way to pause and wait.** The agent loop has no mechanism to stop mid-execution and wait for user input. If the model needs clarification during a multi-step operation (e.g., "which 3 of these 15 studies should I include?"), it must either guess or emit freeform text and hope the user responds correctly.
3. **Level 1 Suggest is a dead end.** The canned suggestion string has no UI affordance. The user sees the AI's follow-up text but has no structured way to approve/reject. This makes the "manual" autonomy preset nearly unusable.
4. **Two separate choice systems.** Static `SuggestionChips` and AI-generated `<choices>` use completely different rendering paths and interaction models, creating inconsistency.

### How This Improves Quality & UX

| Before | After |
|---|---|
| AI asks freeform text questions — user must parse and type | Structured inline card with typed options — click to answer |
| Choices appear only at end of response, only when model remembers | Tool call is deterministic — if the model decides to ask, the card always renders |
| No way to ask multi-select questions ("which studies?") | Supports single-choice, yes/no, free-text, and multi-select |
| Level 1 Suggest has no UI | `ask_user` replaces the need for Level 1 in many cases |
| Protocol refinement requires back-and-forth chat | Model asks structured PICO questions, user clicks answers, loop continues |
| Screening ambiguity causes wrong include/exclude decisions | Model asks "Should I include studies with animal models?" before bulk screening |

### Implementation

#### Step 1 — Types

**[types/ai.ts](next-app/types/ai.ts)**
- Add `requiresUserInput?: boolean` and `userInputRequest?: UserInputRequest` to `ToolResult`
- Add `UserInputRequest` type: `{ question, questionType, options?, context?, callId }`
- Add `"user_input_required"` to `AIStreamChunk.type` union, with `userInputRequest?` field

**[types/agent.ts](next-app/types/agent.ts)**
- Add `"paused"` to `RunStatus` union

**[lib/agent/loop-controller.ts](next-app/lib/agent/loop-controller.ts)**
- Add `"paused_for_input"` to `StopReason` union

#### Step 2 — The Tool

**New file: `lib/server/ai/tools/ask-user.ts`**
- `name: "ask_user"` — description tells the model when to use it (need user preference, multiple valid paths, wrong guess would waste work)
- `parameters`: `question` (string, required), `questionType` (enum: single_choice/yes_no/free_text/multi_select, required), `options` (string[], optional), `context` (string, optional)
- `autonomy`: hardcap level 4 (always auto-execute — the tool IS the user interaction)
- `execute()`: returns `{ callId, result: "[Waiting for user input]", requiresUserInput: true, userInputRequest: { ... } }`

#### Step 3 — Register in All Modes

**[tools/base.ts](next-app/lib/server/ai/tools/base.ts)** — add to `AVAILABLE_TOOLS` and `GLOBAL_SCOPE_TOOL_ALLOWLIST`

**[router.ts](next-app/lib/agent/router.ts)** — add `"ask_user"` to every mode's `allowedTools` array (protocol, scoping, search, screening, drafting, qa). General mode gets it automatically since it currently has no filter.

#### Step 4 — Loop Integration (Simplified Approach)

**[ai-service.ts](next-app/lib/server/ai/ai-service.ts)** — in the tool execution section of `streamChatWithArtifacts()`:

When a tool result has `requiresUserInput: true`:
1. Yield `{ type: "user_input_required", userInputRequest }` to the stream
2. Push the tool result message with placeholder content into `currentMessages`
3. The LLM sees `"[Waiting for user input]"` as the tool result and naturally produces a text response like "I've asked you a question — please answer above to continue"
4. The run ends normally (not paused — no complex resume infrastructure needed)
5. When the user answers via the inline card, the client sends the answer as a new user message
6. The next run starts fresh with full conversation history containing the Q&A exchange

This avoids server-side pause/resume complexity entirely. The conversation history preserves continuity.

**[chat-runtime/events.ts](next-app/lib/server/chat-runtime/events.ts)** — add `"user_input_required"` to `normalizeStreamChunk()` and `STREAM_EVENT_TYPES`

#### Step 5 — Client

**New type in [types/timeline.ts](next-app/types/timeline.ts) (or equivalent):**
- `TimelineUserInputRequest`: `{ type, id, question, questionType, options?, context?, callId, answered, answer?, createdAt }`

**[StreamReducer.ts](next-app/components/copilot/StreamReducer.ts):**
- Handle `"user_input_required"` chunk — push `TimelineUserInputRequest` item to timeline

**New component: `components/artifacts/UserInputCard.tsx`:**
- Renders inline in the timeline (not a modal)
- For `single_choice`/`yes_no`: button group
- For `multi_select`: checkbox group + Submit button
- For `free_text`: small textarea + Submit button
- `onAnswer(answer)` prop calls `sendMessage()` with the formatted answer

**[TimelineRenderer.tsx](next-app/components/copilot/TimelineRenderer.tsx):**
- Render `UserInputCard` for `type === "user_input_request"` items

#### Step 6 — Update System Prompt

**[copilot-prompts.ts](next-app/lib/ai/prompts/copilot-prompts.ts):**
- Keep `<choices>` instruction but make it secondary: "For lightweight suggestions, you may use `<choices>`. For required user input where you need an answer before proceeding, use the `ask_user` tool."
- Eventually remove `<choices>` entirely once `ask_user` is validated

### Verification
- Send "Search for studies on diabetes" with no protocol → AI should call `ask_user` to clarify PICO
- Verify inline card renders with options
- Click an option → verify new message sent and AI continues with the answer
- `npx tsc --noEmit` clean
- Unit test for `ask-user.ts` execute function

---

## Improvement 2 — General Mode Tool Scoping via Delegation (MEDIUM PRIORITY)

**Article principle:** "Sub-agents scale better than tool explosion." Add capabilities via agents, not tools.

### What We Have Today

| Mode | Tool Count | Scoping |
|---|---|---|
| protocol | 8 | Explicit allowlist |
| scoping | 8 | Explicit allowlist |
| search | 8 | Explicit allowlist |
| screening | 9 | Explicit allowlist |
| drafting | 6 | Explicit allowlist |
| qa | 7 | Explicit allowlist |
| **general** | **19 (ALL)** | `allowedTools: []` = no filter |

- No sub-agent infrastructure exists anywhere in the codebase
- `bulk_screening` is the only tool that makes internal LLM calls (via `chat()`, not the full agentic loop)
- No `parentRunId` in `ToolExecutionContext` — no parent-child run tracing
- 19 tool definitions = ~3-4k tokens of JSON schema sent to the LLM on every general-mode turn

### What's Wrong

1. **Decision paralysis in general mode.** With 19 tools, the model sometimes picks the wrong tool, uses tools in the wrong order, or calls search tools when the user wanted screening.
2. **Cross-mode mutations.** From general mode, the model can call `bulk_screening` or `update_protocol` on a whim — tools that have very specific sequencing requirements.
3. **Token overhead.** 19 tool schemas ~3-4k tokens per request, even for simple questions.
4. **No reuse of mode expertise.** Each mode has a carefully tuned system prompt and tool subset. General mode ignores all of this and gives the raw model everything.

### How This Improves Quality & UX

| Before | After |
|---|---|
| Model in general mode picks wrong tools | Delegation routes to focused sub-agent with correct tool subset + mode prompt |
| 19 tool schemas sent every turn | ~13 tools in general mode (3 delegation + 10 direct) |
| No tracing of sub-agent work | `parentRunId` links parent and child runs in traces |
| Model calls `bulk_screening` from general mode with no screening context | `delegate_screening` sub-agent gets screening system prompt + only screening tools |
| Simple questions pay the same tool-definition tax as complex operations | Delegation tools are only invoked when the model actually needs that capability |

### Implementation

#### Step 1 — Sub-Agent Execution Function

**New file: `lib/server/ai/sub-agent.ts`**

`executeSubAgent(options)` — a focused loop runner:
- Takes `mode`, `messages`, `parentRunId`, `projectId`, `userId`, budget overrides
- Uses `getToolDefinitions(mode, scope)` to get only that mode's tools
- Runs a `LoopState` with conservative budget: `maxIterations: 5`, `maxToolCalls: 10`, `maxWallTimeMs: 60s`
- Returns `SubAgentResult`: `{ summary, toolCallCount, stopReason, error? }`
- Calls `executeTool()` directly (skip autonomy for sub-agent — the parent already authorized the delegation)

#### Step 2 — Three Delegation Meta-Tools

**New file: `lib/server/ai/tools/delegate-search.ts`**
- `name: "delegate_search"` — "Delegate a literature search task to a specialized search agent"
- Input: `{ task: string }` — plain-language search goal
- Calls `executeSubAgent({ mode: "search", ... })`
- Returns compacted summary of what was found and added

**New file: `lib/server/ai/tools/delegate-screening.ts`**
- `name: "delegate_screening"` — "Delegate study screening to a specialized screening agent"
- Input: `{ task: string }` — what to screen and how
- Calls `executeSubAgent({ mode: "screening", ... })`

**New file: `lib/server/ai/tools/delegate-protocol.ts`**
- `name: "delegate_protocol"` — "Delegate protocol/criteria updates to a specialized protocol agent"
- Input: `{ task: string }` — what to define or update
- Calls `executeSubAgent({ mode: "protocol", ... })`

All three: autonomy `defaultLevel: 3`, `allowedRange: [2, 4]`

#### Step 3 — Register and Scope

**[tools/base.ts](next-app/lib/server/ai/tools/base.ts):** Register all three delegation tools in `AVAILABLE_TOOLS`

**[router.ts](next-app/lib/agent/router.ts):** Change general mode from `allowedTools: []` to explicit list:
```
delegate_search, delegate_screening, delegate_protocol,
read_study_content, update_note, update_study,
inspect_memory, store_memory, forget_memory,
list_projects, open_project, create_project,
ask_user
```
This reduces general mode from 19 → 13 tools.

#### Step 4 — Add `parentRunId` to Context

**[tools/base.ts](next-app/lib/server/ai/tools/base.ts):** Add `parentRunId?: string` to `ToolExecutionContext`

#### Step 5 — Update General Mode System Prompt

**[copilot-prompts.ts](next-app/lib/ai/prompts/copilot-prompts.ts):** Add delegation guidance to `AGENT_MODE_PROMPTS.general`:
- "When the user asks to search for studies, use `delegate_search`"
- "When the user asks to screen studies, use `delegate_screening`"
- "When the user asks to update protocol or criteria, use `delegate_protocol`"

#### Rollout Strategy

Add feature flag `NEXT_PUBLIC_GENERAL_MODE_DELEGATION` in [feature-flags.ts](next-app/lib/agent/feature-flags.ts). When disabled, general mode keeps `allowedTools: []` (current behavior). When enabled, uses the new scoped list.

### Verification
- In general mode: "Search for COPD treatment studies" → model calls `delegate_search` (not `search_pubmed`)
- Sub-agent internally runs search tools, adds results to ledger
- Parent receives summary as tool result
- In protocol mode: model still has direct `update_protocol` (not delegated)
- `npx tsc --noEmit` clean
- Unit test for `executeSubAgent` with mocked AI service

---

## Improvement 3 — Lazy Context Loading (LOW PRIORITY)

**Article principle:** "Agents should search, not be fed context." Progressive disclosure beats long context.

### What We Have Today

`assembleSystemPrompt()` in [copilot-prompts.ts](next-app/lib/ai/prompts/copilot-prompts.ts) concatenates ~11 blocks in fixed order. **All project context is pushed unconditionally on every request:**

| Block | Tokens (typical) | Always Pushed? |
|---|---|---|
| Mode prompt + BASE_PROMPT | 1,000-1,300 | Yes (needed) |
| [PROJECT_CONTEXT] | ~15 | Yes (needed) |
| [PROTOCOL_CONTEXT] | 200-400 | **Yes (not always needed)** |
| [AUTONOMY] | ~30 | Yes (needed) |
| [LEDGER_CONTEXT] (20 studies) | 500-800 | **Yes (not always needed)** |
| [LEDGER_CONTEXT] (50 studies) | 1,000-2,000 | **Yes (not always needed)** |
| [LOCATION] | ~10 | Yes (needed) |
| [STUDY_CONTEXT] (on study page) | 500-1,000 | Yes (contextual, needed) |
| Memory (up to 10 memories) | 500-2,000 | Yes (semantically filtered, needed) |
| choices instruction | ~100 | Yes (needed) |

The heavy blocks are protocol (200-400 tokens) and ledger (500-2,000 tokens). For simple turns in general/qa/drafting modes ("hello", "what did we discuss yesterday?", "summarize memory"), these are wasted.

The only pull-based patterns today:
- `read_study_content` — full PDF text on demand
- `inspect_memory` — targeted memory query
- Search tools — external results on demand

### What's Wrong

1. **Wasted tokens on simple turns.** A greeting in general mode pays 2,500-6,000 tokens of system prompt for context it never uses.
2. **Stale context.** The ledger snapshot is computed at request start. If the model adds 5 studies via tool calls during the run, the system prompt's ledger is stale for the rest of the conversation.
3. **No progressive disclosure.** The model gets everything upfront instead of discovering what it needs layer by layer — the article's key insight about how intelligent models prefer exploration.

### How This Improves Quality & UX

| Before | After |
|---|---|
| Every turn pays full system prompt tax | Simple turns get lightweight pointers (~50 tokens instead of ~1,500) |
| Ledger snapshot stale after tool calls modify it | `read_ledger` tool returns live data when called |
| Model skims past protocol context on non-protocol turns | Model actively requests protocol when it needs it — deeper engagement |
| DB always fetches full study list | Conditional fetch: counts-only for pointer modes, full list for push modes |

### Implementation

#### Step 1 — Two New Read Tools

**New file: `lib/server/ai/tools/read-protocol.ts`**
- `name: "read_protocol"` — returns PICO + criteria on demand
- Calls `prisma.protocol.findFirst()` + `buildProtocolContext()`
- Autonomy: level 4 auto-silent (read-only, no artifact needed)

**New file: `lib/server/ai/tools/read-ledger.ts`**
- `name: "read_ledger"` — returns counts + study list on demand
- Needs `computeStudyLedger()` extracted from ai-service.ts to a shared location

**New file: `lib/server/ledger-utils.ts`**
- Extract `computeStudyLedger()` from ai-service.ts
- Add `computeLedgerCounts()` — lightweight count-only query (4 parallel `prisma.study.count()` calls)

#### Step 2 — Register and Scope

Add `read_protocol` and `read_ledger` to `AVAILABLE_TOOLS`. Add to mode allowlists:
- **general, qa**: both tools (protocol + ledger are lazy here)
- **search**: `read_protocol` only (needs protocol to frame searches; ledger is pushed because search adds to it)
- **drafting**: both tools
- **protocol, screening**: neither (context always pushed in these modes)
- **scoping**: neither (pre-protocol by design)

#### Step 3 — Conditional Context Assembly

**[ai-service.ts](next-app/lib/server/ai/ai-service.ts)** — context assembly section:

Define which modes always push which context:
```
PUSH_PROTOCOL_MODES: protocol, screening, drafting
PUSH_LEDGER_MODES: screening, search
```

When mode is NOT in the push list:
- Replace full protocol block with: `"[PROTOCOL] Protocol defined. Use read_protocol tool when you need PICO, criteria, or eligibility rules."`
- Replace full ledger block with: `"[LEDGER] N studies in ledger. Use read_ledger tool for the full list and study IDs."`

When mode IS in the push list: current behavior unchanged.

#### Step 4 — Conditional DB Fetch

In the `Promise.all` block of `streamChatWithArtifacts()`:
- For push-ledger modes: call `computeStudyLedger()` (current behavior)
- For pointer modes: call `computeLedgerCounts()` (new, lightweight)
- Protocol fetch stays unconditional (it's tiny, needed for the pointer text count)

### Verification
- Send greeting in general mode with 100+ study project → system prompt should NOT contain study list
- Switch to screening mode → full protocol and ledger ARE present
- Call `read_ledger` manually in general mode → returns full data
- Compare `usage` token counts before/after for simple turns
- `npx tsc --noEmit` clean

---

## Collaboration Phase Alignment (Codex-Compatible)

Use these shared phases to run Claude and Codex in parallel with minimal file overlap.
Codex's corresponding coordination lives in `docs/plans/codex-agentic-plan.md`.

### Wave 1 — ask_user Runtime + Eval Foundation (Parallel)

| Agent | Scope | CAG IDs |
|---|---|---|
| **Claude** | Full `ask_user` vertical slice: types, tool, loop, client v1, prompt | `CAG-002`, `CAG-002a` |
| **Codex** | Provider reasoning internals (not ai-service.ts) + eval harness scaffolding | `CAG-005` (provider files only), `CAG-021` (scaffold) |

**Claude file lock:** `types/ai.ts`, `types/agent.ts`, `loop-controller.ts`, `tools/ask-user.ts` (new), `tools/base.ts`, `router.ts`, `ai-service.ts`, `chat-runtime/events.ts`, `StreamReducer.ts`, `TimelineRenderer.tsx`, `UserInputCard.tsx` (new), `copilot-prompts.ts`

**Codex file lock:** `providers/openai.ts`, `providers/xai.ts`, provider normalization files, `__tests__/eval-*` (new), `scripts/evals/**` (new)

**Output:** Working `ask_user` end-to-end with minimal but functional client card. Stream event names/payloads frozen after merge.

```
── MERGE GATE: tsc + vitest ──
```

### Wave 1.5 — Short Post-Merge Hardening (Codex only)

| Agent | Scope | CAG IDs |
|---|---|---|
| **Codex** | `CAG-005` policy toggle in `ai-service.ts` + `CAG-004` idempotency middleware | `CAG-004`, `CAG-005` |
| **Claude** | Idle / available for review | — |

- `CAG-005`: Codex moves `includeReasoning` gate in `ai-service.ts` from Anthropic-only to provider-agnostic. Safe because Claude's ask_user changes are merged.
- `CAG-004`: Codex adds idempotency middleware in `tool-middleware.ts`. Depends on Claude's `ToolExecutionContext` type being stable (it is after Wave 1).

```
── MERGE GATE ──
```

### Wave 2 — Delegation + Lazy Context New Files (Parallel)

| Agent | Scope | CAG IDs |
|---|---|---|
| **Claude** | Delegation new files: `sub-agent.ts`, `delegate-search.ts`, `delegate-screening.ts`, `delegate-protocol.ts` | `CAG-011`, `CAG-012` |
| **Codex** | Lazy context new files: `read-protocol.ts`, `read-ledger.ts`, `ledger-utils.ts` | `CAG-006` (new-file slice) |

**Rule:** No shared-file edits in Wave 2. All work is in new files only.

```
── MERGE GATE ──
```

### Wave 3 — Registration + Integration (Sequential)

| Step | Agent | Scope | CAG IDs |
|---|---|---|---|
| **Step 1 (first)** | **Claude** | Register delegation tools in `base.ts`, scope `general` allowlist in `router.ts`, add delegation guidance in `copilot-prompts.ts`, thread `parentRunId` in `ai-service.ts`, add dual feature flags | `CAG-013`, part of `CAG-014` |
| **Step 2 (after Claude merge)** | **Codex** | Register `read_protocol`/`read_ledger` in `base.ts`, add to mode allowlists in `router.ts`, implement conditional context assembly in `ai-service.ts`, add pointer text in `copilot-prompts.ts` | `CAG-006`, `CAG-010` (integration) |

**Rule:** Codex starts Step 2 only after Claude's Step 1 merge. Both modify `tools/base.ts`, `router.ts`, `ai-service.ts`, `copilot-prompts.ts` — sequential ownership prevents conflicts.

**Feature flags:** `ENABLE_DELEGATION` (server) + `NEXT_PUBLIC_ENABLE_DELEGATION` (client) for delegation.

```
── MERGE GATE ──
```

### Wave 4 — Search Quality + UI Polish (Parallel)

| Agent | Scope | CAG IDs |
|---|---|---|
| **Claude** | Query planning inside `delegate_search` flow | `CAG-008` |
| **Codex** | ask_user UI polish + retry UX + OpenAlex search tool + source receipt artifacts | `CAG-003` (UI), `CAG-007`, `CAG-009` |

**Claude files:** `delegate-search.ts` (owns from Wave 2), optional `lib/agent/query-planner.ts` (new)

**Codex files:** `UserInputCard.tsx`, `UserInputCard.module.css`, `StreamReducer.ts`, `TimelineRenderer.tsx`, `search-openalex.ts` (new), `tools/base.ts` (register OpenAlex), artifact type/render files

**Note:** Codex does ask_user UI polish here (not Wave 2) so backend contracts are fully stable first. Codex builds on Claude's working v1 card — adds animations, loading/error states, accessibility, retry affordances.

```
── MERGE GATE ──
```

### Wave 5 — Memory + Coordination (Codex-led, Claude follow-on)

| Step | Agent | Scope | CAG IDs |
|---|---|---|---|
| **Step 1** | **Codex** | Decision-memory dedup + AgentTask dependency graph | `CAG-017`, `CAG-016` |
| **Step 2 (after Codex merge)** | **Claude** | Negative memory extraction (rejected hypotheses, failed paths) | `CAG-018` |

**Rule:** Claude waits for Codex's memory schema unification to merge before starting negative memory work.

```
── MERGE GATE ──
```

### Wave 6 — Eval + Operations (Parallel, split by fixture ownership)

| Agent | Scope | CAG IDs |
|---|---|---|
| **Claude** | Eval scenarios for `ask_user` flows + delegation flows | `CAG-021` (subset) |
| **Codex** | Eval scenarios for search/screening quality + staged rollout template | `CAG-021` (subset), `CAG-022` |

**Rule:** Do not edit the same fixture files in parallel.

### Visual Timeline

```
Wave 1      ┌─ Claude: ask_user full stack (CAG-002/002a) ────┐
            │                                                    │ MERGE
            └─ Codex: provider internals + eval scaffold ───────┘

Wave 1.5    ── Codex: CAG-005 policy + CAG-004 idempotency ──── MERGE

Wave 2      ┌─ Claude: delegation new files (CAG-011/012) ────┐
            │                                                    │ MERGE
            └─ Codex: lazy context new files (CAG-006) ────────┘

Wave 3      ── Claude: delegation integration (CAG-013) ──────── MERGE
            ── Codex: lazy context integration (CAG-006/010) ── MERGE

Wave 4      ┌─ Claude: query planner (CAG-008) ───────────────┐
            │                                                    │ MERGE
            └─ Codex: UI polish + OpenAlex + receipts ─────────┘

Wave 5      ── Codex: memory dedup + task graph (CAG-017/016)── MERGE
            ── Claude: negative memory (CAG-018) ──────────────── MERGE

Wave 6      ┌─ Claude: eval (ask_user + delegation scenarios) ┐
            │                                                    │ MERGE
            └─ Codex: eval (search + screening) + rollout ─────┘
```

## Parallel Ownership Matrix

| Wave | Claude Owns | Codex Owns | Shared Files Locked By |
|---|---|---|---|
| 1 | `types/ai.ts`, `types/agent.ts`, `loop-controller.ts`, `tools/base.ts`, `router.ts`, `ai-service.ts`, `events.ts`, `StreamReducer.ts`, `TimelineRenderer.tsx`, `copilot-prompts.ts` | `providers/openai.ts`, `providers/xai.ts`, `__tests__/eval-*`, `scripts/evals/**` | Claude |
| 1.5 | — | `ai-service.ts` (reasoning toggle), `tool-middleware.ts` | Codex |
| 2 | `sub-agent.ts` (new), `delegate-*.ts` (new) | `read-protocol.ts` (new), `read-ledger.ts` (new), `ledger-utils.ts` (new) | N/A — all new files |
| 3 Step 1 | `tools/base.ts`, `router.ts`, `copilot-prompts.ts`, `ai-service.ts`, `feature-flags.ts` | — | Claude |
| 3 Step 2 | — | `tools/base.ts`, `router.ts`, `ai-service.ts`, `copilot-prompts.ts` | Codex |
| 4 | `delegate-search.ts`, `query-planner.ts` (new) | `UserInputCard.tsx`, `StreamReducer.ts`, `TimelineRenderer.tsx`, `search-openalex.ts` (new), `tools/base.ts`, artifact files | Split — see per-file |
| 5 Step 1 | — | memory services, `prisma/schema.prisma`, task graph files | Codex |
| 5 Step 2 | memory extraction pipeline | — | Claude |
| 6 | eval fixtures (ask_user + delegation) | eval fixtures (search + screening), rollout templates | Split by fixture |

## Alignment Commitments

### Where Claude aligns with Codex:
- Keep registration and schema contracts stable at each handoff point (`ask_user`, `delegate_*`, `read_*`).
- Freeze stream event names/payloads (`user_input_required`, tool result shapes) after Wave 1 merge — Codex builds UI against these contracts.
- Respect Wave 3 sequencing: delegation integration (Claude first) before lazy-context integration (Codex second).
- Gate delegation behind dual flags: `ENABLE_DELEGATION` (server) + `NEXT_PUBLIC_ENABLE_DELEGATION` (client) to avoid client/server drift.
- Do not modify `UserInputCard.tsx` or `StreamReducer.ts` after handing off to Codex in Wave 4.
- Wait for Codex's memory schema unification (Wave 5 Step 1) before starting negative memory work (Wave 5 Step 2).

### Where Codex aligns with Claude:
- Will not touch ask_user runtime/UI files during Claude's Wave 1 ownership.
- Will keep Wave 1 work restricted to provider internals + eval scaffolding; defers `ai-service.ts` toggle + idempotency middleware to Wave 1.5 post-merge.
- Will follow sequential ownership for shared files in Wave 3 and Wave 5.
- Will implement UI strictly against Claude-owned runtime contracts; no parallel schema invention.

## Merge Gate Protocol

Every wave boundary requires:
1. `cd next-app && npx tsc --noEmit` — clean typecheck
2. `cd next-app && npx vitest run` — all tests pass
3. Both agents' changes committed on main before next wave starts
4. No stacking uncommitted changes from both agents across a gate

## Risks & Mitigations

| Risk | Wave | Mitigation |
|---|---|---|
| `<choices>` and `ask_user` coexist — model uses both inconsistently | 1 | System prompt explicitly separates: `ask_user` for required input, `<choices>` for lightweight suggestions. Remove `<choices>` after validation. |
| Run loses in-flight state when ask_user terminates loop | 1 | Simplified approach: run ends, next turn resumes from conversation history. Document that ask_user should be called at decision points, not mid-sequence. |
| CAG-005 touches ai-service.ts during Claude's Wave 1 | 1 | Moved to Wave 1.5 — Codex only modifies ai-service.ts after Claude's merge. |
| CAG-004 needs stable ToolExecutionContext | 1.5 | Sequenced after Claude's type changes in Wave 1. |
| Sub-agent bypasses autonomy pipeline | 2-3 | Acceptable for v1 — parent already authorized delegation. Add autonomy to sub-agent in v2. |
| Both agents edit shared files in Wave 3 | 3 | Sequential: Claude Step 1 merges first, then Codex Step 2 builds on it. |
| General mode behavior regression | 3 | Roll out behind dual feature flags (`ENABLE_DELEGATION` server + `NEXT_PUBLIC_ENABLE_DELEGATION` client). |
| Model doesn't call `read_protocol` when it should | 3 | Pointer text is instructional: "Use read_protocol tool when you need..." Test with representative prompts. |
| Prefix cache busting from variable pointer text | 3 | Keep pointer text static (no counts in the pointer string). |
| Dual edits on UI files in Wave 4 | 4 | Claude only touches `delegate-search.ts` + `query-planner.ts`. Codex owns all UI files. No overlap. |
