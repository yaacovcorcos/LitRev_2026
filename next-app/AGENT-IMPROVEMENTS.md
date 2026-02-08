# Agent System Improvements

## P0: Context Window Management

**Problem:** The tool loop in `streamChatWithArtifacts()` appends every tool result to `currentMessages`, growing linearly. With longer workflows (screening 50 studies, multi-step searches), this will blow through the model's token limit and cause failures.

**What to build:**
- A `ContextWindowManager` that tracks token usage across the message array
- When approaching ~80% of the model's context limit, automatically summarize older messages (keeping system prompt + last N messages intact)
- A `compactMessages(messages, tokenBudget)` function that:
  1. Counts tokens in the current message array
  2. If over budget, summarizes the oldest non-system messages into a single "context so far" message
  3. Preserves the system prompt, most recent user message, and last 2-3 assistant/tool exchanges
- Integration point: inside the `for` loop in `streamChatWithArtifacts()`, call `compactMessages()` before each LLM call

**Patterns to steal from:**
- OpenHands `ContextWindowManager` — most sophisticated open-source implementation
- Claude Agent SDK context compaction — summarize + preserve recent

**Files to modify:** `lib/server/ai/ai-service.ts` (new module: `lib/server/ai/context-manager.ts`)

---

## P1: Dynamic Loop Control (stopWhen + prepareStep)

**Problem:** `MAX_TOOL_ITERATIONS = 5` is a hard-coded arbitrary cap. Some tasks need 1 iteration (simple question), others need 15+ (screen 20 studies one by one). The model should decide when it's done, with a safety limit.

**What to build:**
- Replace the `for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++)` loop with a `while` loop controlled by a `shouldContinue(stepResult)` function
- `shouldContinue` checks:
  1. Safety cap (e.g., 25 iterations max — hard stop)
  2. Token budget remaining (from P0's context manager)
  3. Whether the model emitted tool calls (no tool calls = done, same as now)
- Add a `prepareStep(context, iteration)` hook called before each LLM call that can:
  1. Select a different model for simple follow-up steps (e.g., switch to grok-4-1-fast for routine tool calls)
  2. Adjust the tool set mid-loop (e.g., remove search tools after search phase is done)
  3. Inject step-specific instructions

**Patterns to steal from:**
- Vercel AI SDK v6 `stopWhen` + `prepareStep` callbacks
- Claude Code's `while(tool_call)` loop (no step counter, model decides when done)

**Files to modify:** `lib/server/ai/ai-service.ts`

---

## P3: Implement Missing Tools

**Problem:** Only 2 of 8 planned tools are implemented. The model can search PubMed and add to the ledger, but can't screen, exclude, extract PDFs, update criteria, or edit drafts. This limits the agent to ~30% of its intended workflow.

**Tools to build (in order):**

### 3a. `exclude_study`
- Flips a study's `triageDecision` to "exclude" with a reason
- Input: `{ studyId: string, reason: string }`
- Simple — just a Prisma update on Study.details
- Autonomy default: 2 (propose), hard cap: 2

### 3b. `update_criteria`
- Adds/removes inclusion or exclusion criteria on the protocol
- Input: `{ action: "add" | "remove", type: "inclusion" | "exclusion", criterion: string }`
- Writes to Protocol.data, syncs to memory via existing `protocol-sync.ts`
- Autonomy default: 1 (suggest), hard cap: 2

### 3c. `bulk_screening`
- Screens multiple studies against protocol criteria in one call
- Input: `{ studyIds: string[] }` (or all unscreened if empty)
- For each study: evaluates against criteria, returns include/exclude/maybe with rationale
- Produces a `screening_batch` artifact
- Autonomy default: 2 (propose), hard cap: 3

### 3d. `extract_pdf`
- Triggers the existing PDF extraction pipeline on an uploaded file
- Input: `{ studyId: string }` (study must have a PDF attachment)
- Calls existing `extractFromPDF()` + `deepAnalyzeWithAI()`
- Returns structured study metadata
- Autonomy default: 3 (auto-notify)

### 3e. `edit_draft`
- Writes or edits a section of the review draft
- Input: `{ section: string, content: string, action: "replace" | "append" | "revise" }`
- Produces a `draft_diff` artifact showing what changed
- Autonomy default: 1 (suggest), hard cap: 2

### 3f. `delete_study`
- Removes a study from the ledger entirely
- Input: `{ studyId: string, reason: string }`
- Destructive — lowest priority
- Autonomy default: 1 (suggest), hard cap: 2

**Also need:** Apply functions for artifact types that don't have them yet (study_proposal, draft_diff, screening_batch, evidence_table).

**Files to create:** One file per tool in `lib/server/ai/tools/`, register in `lib/server/ai/tools/base.ts`

---

## P4: AI-Powered Planning

**Problem:** `planner.ts` uses regex patterns to detect multi-step workflows and generates plans heuristically. It can't reason about novel task decompositions like "search for RCTs on metformin, screen them against our criteria, then draft the results section."

**What to build:**
- Replace `generatePlan()` with an LLM call that:
  1. Receives the user message + current project state (protocol exists? how many studies? what's unscreened?)
  2. Returns a structured plan: `{ steps: [{ label, toolName, description, dependsOn? }] }`
  3. Uses a fast/cheap model (grok-4-1-fast) since this is a planning call, not a complex reasoning task
- Keep `detectMultiStepWorkflow()` as a gate (only call the LLM planner when the message looks multi-step)
- The plan gets injected into the system prompt for execution (CrewAI pattern) rather than requiring user approval for every plan
- For `assisted` autonomy: show the plan as an artifact, let user approve/edit before execution
- For `autonomous` autonomy: execute immediately, notify user

**Dual-model pattern (from Aider):**
- Planning: use the user's selected model (GPT-5.2, Claude, etc.) for complex reasoning
- Execution of plan steps: can use a faster model (grok-4-1-fast) for routine tool calls
- This ties into P1's `prepareStep` — the step preparation can switch models based on the plan step

**Files to modify:** `lib/server/agent/planner.ts`, `lib/server/ai/ai-service.ts`

---

## P5: Handoffs Between Agent Modes

**Problem:** Switching agent modes currently just swaps the system prompt. All modes share the same tool set, same loop, same context. A user in `drafting` mode still has `search_pubmed` available even though it's irrelevant, which wastes tool-definition tokens and confuses the model's tool selection.

**What to build:**
- Define each agent mode as a full config:
  ```
  { mode, systemPrompt, allowedTools[], model?, maxIterations? }
  ```
- The router already maps modes to allowed tools in `router.ts` (`AGENT_MODE_TOOLS`) — extend this to be the source of truth for tool filtering
- When the model's response suggests a mode switch (e.g., user in `general` says "search PubMed for..."), perform a handoff:
  1. Detect the intent (keyword matching or model signal)
  2. Switch to the target mode's config (new tools, new system prompt)
  3. Continue the conversation with the new config
  4. Optionally notify the user of the mode switch
- Tool definitions sent to the model should be filtered by mode — `drafting` mode only sends text-related tools, `search` mode sends search + ledger tools

**Patterns to steal from:**
- OpenAI Agents SDK handoff pattern — clean transfer of context between specialized agents
- Continue.dev three-mode architecture — Chat / Plan / Agent as meta-modes

**Files to modify:** `lib/agent/router.ts`, `lib/server/ai/ai-service.ts`, `lib/server/ai/tools/base.ts` (add `getToolDefinitions(mode)`)

---

## P6: Prompt Caching Optimization

**Problem:** Every iteration of the tool loop sends the full message array including the system prompt. Without cache-friendly ordering, we pay full token price on every LLM call. With OpenAI and Anthropic's prompt caching, we can cut costs significantly by ensuring the prompt prefix stays stable.

**What to build:**
- Reorder `assembleSystemPrompt()` so content is sorted by stability:
  1. BASE_PROMPT + mode prompt (never changes within a conversation) — FIRST
  2. Protocol context (changes rarely — only when criteria are updated) — SECOND
  3. Autonomy context (changes rarely) — THIRD
  4. Memory context (changes per-turn as new memories are retrieved) — FOURTH
  5. Ledger context (changes when studies are added/screened) — FIFTH
  6. Additional context (most volatile) — LAST
- Current order in `assembleSystemPrompt`: mode prompt, protocol, ledger, memory, autonomy, additional — needs reordering so memory and ledger (volatile) come after autonomy (stable)
- For multi-iteration tool loops: keep the system prompt message identical across iterations (don't re-assemble it). Only the user/assistant/tool messages change.
- Track cache hit rates in telemetry (add to RunEvent metadata) to measure improvement

**Patterns to steal from:**
- Anthropic prompt caching docs — static prefix, dynamic suffix
- Claude Agent SDK — structures prompts for maximum cache reuse

**Files to modify:** `lib/ai/prompts/copilot-prompts.ts` (reorder `assembleSystemPrompt`), `lib/server/ai/ai-service.ts` (don't re-assemble system prompt per iteration)

---

## P7: Self-Healing JSON (from Instructor JS / zod-gpt patterns)

**Problem:** When the LLM returns a malformed tool result or artifact payload that fails Zod validation, we throw an error and the tool call fails. The LLM never gets a chance to fix its output.

**What to build:**
- When `ARTIFACT_PAYLOAD_SCHEMAS[type].safeParse(payload)` fails, instead of throwing, feed the Zod error messages back to the LLM as a tool result message
- The existing tool loop gives the LLM another iteration to correct the output
- This is the exact pattern used by `@instructor-ai/instructor` (MIT), `zod-gpt` (MIT), and LangChain's `OutputFixingParser`
- Especially important for `ScreeningBatchPayload` where the LLM must produce a well-formed array

**Libraries:** `@instructor-ai/instructor` (MIT) or implement the pattern ourselves (simpler)

**Files to modify:** `lib/server/ai/ai-service.ts`

---

## P8: Semantic Scholar Search + Recommendations (from academic research)

**Problem:** PubMed only covers biomedical literature. Many systematic reviews span multiple disciplines.

**What to build:**
- `search_semantic_scholar` tool — queries Semantic Scholar API (215M+ papers, free, no API key needed)
- `recommend_studies` tool — calls Semantic Scholar Recommendations API with included studies as `positivePaperIds` and excluded as `negativePaperIds` (the "Research Rabbit" pattern)
- Both supplement the existing `search_pubmed` tool

**APIs:**
- Search: `https://api.semanticscholar.org/graph/v1/paper/search`
- Recommendations: `https://api.semanticscholar.org/recommendations/v1/papers/`
- Rate limit: 100 requests / 5 minutes (free tier)

**Files to create:** `lib/server/ai/tools/semantic-scholar-search.ts`

---

## P9: Langfuse Observability (from research)

**Problem:** No visibility into agent run costs, latency breakdown, or tool call success rates. Debugging failed runs requires manually querying RunEvent records.

**What to build:**
- Langfuse tracing wrapper around `streamChatWithArtifacts()`
- Each agent run = 1 Langfuse trace, each tool call = 1 span, each LLM call = 1 generation
- Token counts, latency, model name auto-captured
- Artifact accept/reject decisions become evaluation datapoints (the Braintrust pattern)

**Library:** `langfuse` (MIT) — https://github.com/langfuse/langfuse-js

**Files to create:** `lib/server/ai/tracing.ts`

---

## Future Backlog (from research, not yet prioritized)

### Academic-Specific
- **OpenAlex search tool** — 240M papers, free, powerful filter API
- **Crossref metadata enrichment** — validate DOIs, get reference lists for backward snowballing
- **Active learning screening priority** (ASReview pattern) — rank unscreened studies by predicted relevance
- **Section-aware PDF chunking** — chunk by paper section (Methods, Results, etc.) instead of token count
- **PRISMA flow diagram artifact** — visualize review flow from ledger data
- **Risk of bias assessment** — RoB 2 / ROBINS-I structured domains per study
- **GRADE evidence profile artifact** — certainty assessment per outcome
- **Table/figure extraction** — Marker (GPL-3.0) or Nougat (Apache 2.0) for structured table extraction from PDFs

### Agent Infrastructure
- **MCP server** — expose tools as Model Context Protocol server for universal access from any MCP client
- **Inngest integration** — serverless-safe long agent loops (bypasses Vercel timeout limits)
- **LlamaIndex.TS ADW pattern** — per-paper agents with orchestrator for precise retrieval
- **Promptfoo testing** — declarative agent test cases in CI/CD
- **Checkpoint/crash recovery** (LangGraph pattern) — save state mid-tool-loop for resumability
- **Citation graph analysis** — snowballing via Semantic Scholar citation data
