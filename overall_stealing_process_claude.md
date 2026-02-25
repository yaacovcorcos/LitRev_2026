# Overall Stealing Process — Definitive Implementation Plan (Claude)

> **What this document is:** The single source of truth for all patterns worth stealing from OpenClaw and OpenCode, synthesized from 6 analysis reports (Claude ×2, Gemini ×2, Codex ×2) and 2 overall plans (Claude, Codex). Every pattern names its source repo, exact source files, the exact LitRev files to create or modify, and the algorithm/constants. This document is self-contained — per-repo analysis files have been deleted (Claude's) or merged (Codex's).
>
> **Canonical inputs merged:** `openclaw_analysis_report_claude.md` (deleted), `openclaw_analysis_report_gemini.md`, `openclaw_analysis_report_codex.md` (merged into Codex overall), `opencode_analysis_report_claude.md` (deleted), `opencode_analysis_report_gemini.md`, `opencode_analysis_report_codex.md` (merged into Codex overall), `overall_stealing_process_codex.md`.
>
> **Cloned repos (local):**
> - OpenClaw: `cloned_repos/openclaw_repo/` (snapshot `bf8ca07`)
> - OpenCode: `cloned_repos/opencode_repo/` (snapshot `2c00eb6`)
>
> **Spike branch status:** The `spike-vercel-chat-sdk-adaptation` branch adds event-routed streaming, reducer-driven state, conversation run locks, typed artifact actions, and runtime primitives (`chat-runtime/`). A follow-up commit on `spike-vercel-chat-sdk-adaptation-clean` adds streamed reasoning visibility. Both are stability/correctness improvements. My recommendations account for these changes and note where they affect integration targets.
>
> **Scope boundary:** Waves 1-4 harden the reliability and correctness of LitRev's existing agentic tool-calling loop ("stop dying"). **Reasoning visibility** is in scope — reviewed in Wave 0, finalized in Wave 3. Wave 5 is a planning gate for autonomy expansion ("get smarter") — task decomposition, tool selection strategy, subagent architecture — which requires its own analysis cycle after Waves 1-4 are stable.

---

## Table of Contents

1. [Cross-Agent Agreement Map](#1-cross-agent-agreement-map)
2. [Spike Branch Assessment & Decision Gate](#2-spike-branch-assessment--decision-gate)
3. [Tier 1 — Critical Gaps (Ship First)](#3-tier-1--critical-gaps)
4. [Tier 2 — Quality Upgrades (Ship Next)](#4-tier-2--quality-upgrades)
5. [Tier 3 — Polish & Instrumentation](#5-tier-3--polish--instrumentation)
6. [Tier 4 — Deferred (Architecture Triggers Required)](#6-tier-4--deferred)
7. [What We Are NOT Stealing](#7-what-we-are-not-stealing)
8. [Where I Disagree with Other Agents](#8-where-i-disagree-with-other-agents)
9. [Files Summary](#9-files-summary)
10. [Verification Gates & Required Tests](#10-verification-gates--required-tests)
11. [Constants Reference](#11-constants-reference)

---

## 1. Cross-Agent Agreement Map

Every pattern mentioned across all 6 analysis reports, and who recommended it:

| Pattern | Claude | Gemini | Codex | Consensus |
|---------|--------|--------|-------|-----------|
| Error classification / typed taxonomy | ✅ P0 | — | ✅ Tier A | **Unanimous steal** |
| retryAsync with backoff + Retry-After | ✅ P0 | ✅ | ✅ Tier A | **Unanimous steal** |
| Context overflow detection (15+ providers) | ✅ P0 | ✅ | ✅ Tier A | **Unanimous steal** |
| Compaction hardening (adaptive + structured) | ✅ P0+P1 | ✅ | ✅ Tier A | **Unanimous steal** |
| Doom loop detection | ✅ P0 | ✅ | ✅ (adopted from Claude) | **Unanimous steal** |
| Session transcript repair | ✅ P1 | — | ✅ | **Steal** |
| Bidirectional tool truncation | ✅ P1 | ✅ | ✅ | **Steal** |
| Fence-aware markdown chunking | ✅ P2 | ✅ | ✅ Tier B | **Steal** |
| Safety margin on token estimation | ✅ P0 | — | ✅ (adopted from Claude) | **Steal** (trivial + high ROI) |
| Stream coalescing + fence-safe chunking | ✅ P1+P2 | ✅ | ✅ Tier 2 | **Steal** (all agree Tier 2) |
| 4-pass fuzzy text matching | ✅ P0 | ✅ | ✅ Tier 2 (adopted from Claude) | **Steal** |
| Hybrid memory (MMR + decay) | ✅ P3 | ✅ | ✅ Tier B | **Defer** (all agree: algorithms only, not infra) |
| Structured output contracts | — | — | ✅ Tier 3 (conditional) | **Defer** (both agree: only if parse/shape failure rate justifies) |
| Permission rules engine | — | — | ✅ High | **Defer** (see disagreement section) |
| Auth profile rotation | ✅ P2 | — | — | **Defer** (trigger: multiple API keys) |
| Embedding batch + cache | — | — | ✅ Medium | **Defer** |
| Tool execution middleware | — | — | ✅ Tier 2 | **Defer** (Codex says Tier 2; I say Tier 3 — see gaps) |
| Subagent runtime | Skip | ✅ | ✅ Defer | **Defer** (unanimous) |
| A2UI / Live Canvas | Skip | ✅ | Skip | **Skip** (Gemini wrong — irrelevant to SPA) |
| Subagent routing | Skip | ✅ | Skip | **Skip** (Gemini wrong — architecture mismatch) |
| Provider message normalization | ✅ Tier 1 | — | ✅ Tier 1 | **Steal** (Tier 1 minimal guards; both agree prevents 400s) |
| Cache TTL / trace logging | ✅ P2-P3 | — | ✅ Tier 2 | **Tier 3** (Codex says Tier 2; I say Tier 3 — see gaps) |

---

## 2. Spike Branch Assessment & Decision Gate

> **This is Wave 0.** Decide the spike fate before starting any implementation wave. (Credit to Codex for correctly sequencing this as a prerequisite.)
>
> **Status: COMPLETE.** Codex executed Wave 0 (see `codex/implementation_progress_codex.md`). Scenario A locked, branch aligned via cherry-picks, reasoning-visibility review performed with 3 items deferred to Wave 3.

### Spike inventory

| Spike Feature | What It Does | Stealing Impact |
|--------------|-------------|-----------------|
| **Event-routed streaming** (`route.ts`) | Raw chunks normalized and routed through handlers | Stream coalescing (Tier 2) should layer on top of this, not replace it |
| **Reducer-driven state** (`StreamReducer.ts`, `project-copilot-stream-events.ts`) | Pure functional event accumulation instead of inline switch | Already addresses some of OpenCode's typed event patterns; reduces urgency of event bus steal |
| **Conversation run lock** (`conversation-run-lock.ts`) | Prevents overlapping runs, auto-cancels zombies >20min | Partially addresses concurrency gaps; doom loop detection is still needed (different concern) |
| **Typed artifact actions** (`action-contract.ts`) | Unified dispatcher for accept/reject/execute | Clean extension point for future artifact types |
| **Runtime primitives** (`chat-runtime/events.ts`, `runtime.ts`, `thread.ts`, `state-adapter.ts`, `locks.ts`) | New abstraction layer for streaming infrastructure | **This becomes the integration target** for error classification and retry logic, not the old bare `ai-service.ts` |
| **Reasoning stream visibility** (`293aa2f`) | Anthropic thinking blocks streamed + collapsible UX | **In scope for this implementation.** Needs toggle (Off/Summary/Full) + OpenAI parity; review in Wave 0, finalize in Wave 3 |

### Decision Locked For This Implementation

Chosen path: **Scenario A (keep spike mostly as-is)** with **reasoning visibility included in scope**.

This means:
1. Runtime/refactor foundations from spike stay in place.
2. Reasoning visibility is **not** deferred out of this project; it must be reviewed and finalized during implementation (see Wave 0 checklist and Wave 3 finalization below).
3. Do not block Tier 1 reliability steals on the spike decision — those are orthogonal and needed either way.

**Branch alignment (executed by Codex in Wave 0):** Three commits cherry-picked from `spike-vercel-chat-sdk-adaptation-clean` onto current branch:
- `67472ba` — runtime primitives + unit coverage (`chat-runtime/` events, locks, runtime, state-adapter, thread + tests)
- `c71897e` — runtime stream routing + run guard (route.ts, context, action-contract, conversation-run-lock + tests)
- `53f1e29` — reasoning visibility wiring (ai page, providers/anthropic, StreamReducer, TimelineRenderer, types + tests)

**Integration targets shift** to `chat-runtime/`:

| Pattern | Old target | New target (with spike) |
|---------|-----------|------------------------|
| Error classification | `ai-service.ts` catch block | `chat-runtime/runtime.ts` error handling |
| Retry logic | `ai-service.ts` loop | `chat-runtime/runtime.ts` or new `chat-runtime/retry.ts` |
| Stream coalescing | `ai-service.ts` yield | `chat-runtime/events.ts` or `route.ts` event pipeline |
| Conversation lock | Not addressed | Already done in `conversation-run-lock.ts` |

### Claude's position

Keep everything (Scenario A). The spike is stability infrastructure, not a risky redesign. Tests pass. The reducer + run lock are immediate correctness wins. Reasoning visibility is in scope — it needs the toggle (Off/Summary/Full) + OpenAI support to be production-ready, and both agents agree this should be reviewed and shipped as part of this implementation, not deferred.

### Reasoning-Visibility Review Checklist (Wave 0)

This checklist ensures reasoning visibility is production-ready. Codex executed the review; status recorded below.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | **Cross-surface behavior** — start/delta/end reasoning events in copilot + `/ai` page | **Done** | Events present in route/runtime/context/UI files after cherry-pick |
| 2 | **User control toggle** — explicit `Off` / `Summary` / `Full` mode | **Deferred → Wave 3** | No explicit mode control found yet; must be implemented before ship |
| 3 | **Provider behavior** — Anthropic end-to-end + OpenAI explicit handling | **Partial** | Anthropic path works; OpenAI parity/toggle behavior needs implementation |
| 4 | **Truncation/safety UX** — clear truncation note, no broken layout | **Done** | Collapsible reasoning panel + truncation handling present |
| 5 | **Storage/replay** — no regression on conversation load/perf | **Partial** | Type/storage fields present; full UX replay acceptance pending manual product review |
| 6 | **Test gate** — `npx tsc --noEmit` + `npx vitest run` | **Done** | Both pass (after ENOSPC cleanup) |

---

## 3. Tier 1 — Critical Gaps

These are things our agent loop cannot survive today. Every production run is exposed.

---

### 1.1 retryAsync() Utility

**Source:** OpenClaw `src/infra/retry.ts` (~100 lines)
**Why OpenClaw wins:** More configurable than OpenCode's (custom `shouldRetry`, jitter, `retryAfterMs` parser). OpenCode's is simpler (fixed factor of 2) but less flexible. Codex also recommended OpenClaw's version.

**Create:** `next-app/lib/server/utils/retry.ts` (~50 lines)

```typescript
async function retryAsync<T>(
  fn: () => Promise<T>,
  opts?: {
    attempts?: number;        // Default: 3
    minDelayMs?: number;      // Default: 500
    maxDelayMs?: number;      // Default: 15_000
    jitter?: number;          // Default: 0.15 (±15% variance)
    shouldRetry?: (err: unknown, attempt: number) => boolean;
    retryAfterMs?: (err: unknown) => number | undefined;
    onRetry?: (info: { attempt: number; delayMs: number; err: unknown }) => void;
  }
): Promise<T>
```

**Backoff formula:**
```
baseDelay = retryAfterMs(err) ?? (minDelayMs × 2^(attempt-1))
delay = clamp(applyJitter(baseDelay, jitter), minDelayMs, maxDelayMs)

applyJitter(d, j) = d × (1 + random(-j, +j))
```

**Retry-After header parsing** (from OpenCode `session/retry.ts`):
```typescript
function parseRetryAfter(err: unknown): number | undefined {
  const headers = (err as any)?.headers;
  if (!headers) return undefined;
  // Provider-specific: some use 'retry-after-ms', some 'retry-after' in seconds
  const ms = headers['retry-after-ms'];
  if (ms) return Number(ms);
  const sec = headers['retry-after'];
  if (sec && !isNaN(Number(sec))) return Number(sec) * 1000;
  return undefined;
}
```

**Test:** Pure function, zero deps. Feed it a function that fails N times, verify timing + final result.

---

### 1.2 Error Classification + Context Overflow Detection

**Source:** OpenClaw `src/agents/failover-error.ts` (taxonomy) + OpenCode `src/provider/error.ts` (overflow patterns)
**All agents agree** this is the highest-impact steal. Merging both gives the best coverage.

**Create:** `next-app/lib/server/ai/error-classification.ts` (~130 lines)

```typescript
export type AIErrorReason =
  | "rate_limit"       // 429, quota exceeded, TPM limit
  | "auth"             // Invalid key, forbidden, unauthorized
  | "billing"          // 402, insufficient credits, plan exceeded
  | "timeout"          // 5xx, deadline exceeded, gateway timeout
  | "context_overflow" // Prompt too long for model context window
  | "format"           // tool_use.id mismatch, invalid request body
  | "model_not_found"  // Model ID doesn't exist at provider
  | "unknown";

export function classifyAIError(error: unknown): AIErrorReason {
  const msg = extractErrorMessage(error);
  const status = extractStatusCode(error);

  // Status-based (fastest check)
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "billing";
  if (status === 404) return "model_not_found";
  if (status === 429) return "rate_limit";

  // Context overflow — 15+ provider-specific patterns (from OpenCode)
  if (isContextOverflow(msg)) return "context_overflow";

  // Message-based patterns (from OpenClaw, first match wins)
  if (/rate.?limit|quota|TPM|RPM|too many requests/i.test(msg)) return "rate_limit";
  if (/overloaded|capacity|529/i.test(msg)) return "rate_limit";
  if (/insufficient.*credits?|billing|payment/i.test(msg)) return "billing";
  if (/timed?\s*out|deadline|ETIMEDOUT|ECONNRESET/i.test(msg)) return "timeout";
  if (status && status >= 500) return "timeout";
  if (/invalid.*key|unauthorized|forbidden|authentication/i.test(msg)) return "auth";
  if (/tool_use.*id|invalid.*request|malformed/i.test(msg)) return "format";
  if (/model.*not.*found|does not exist|no.*model/i.test(msg)) return "model_not_found";

  return "unknown";
}

export function isContextOverflow(msg: string): boolean {
  const patterns = [
    /maximum context length/i,
    /context_length_exceeded/i,
    /request.?too.?large/i,
    /prompt is too long/i,
    /exceeds the maximum number of tokens/i,
    /RESOURCE_EXHAUSTED/i,
    /context.*overflow/i,
    /token.*limit.*exceed/i,
    /input.*too.*long/i,
    /max.*tokens.*exceeded/i,
    /Input .* tokens .* exceeds .* limit/i,   // Mistral
    /请求.*超出.*上下文/i,                       // Chinese locale (from OpenClaw)
  ];
  return patterns.some(p => p.test(msg));
}

export function isRetryable(reason: AIErrorReason): boolean {
  return reason === "rate_limit" || reason === "timeout";
  // context_overflow gets special handling (compact then retry)
  // auth, billing, format, model_not_found → fail fast
}
```

**Wiring into the loop** (targets spike's `chat-runtime/` if kept, or `ai-service.ts` if not):

```
catch (error) {
  const reason = classifyAIError(error);

  if (reason === "context_overflow" && overflowRetries < 3) {
    messages = await compactMessages(messages, { aggressive: true });
    overflowRetries++;
    continue;  // retry LLM call with compacted context
  }

  if (isRetryable(reason)) {
    // retryAsync handles backoff + Retry-After
    continue;
  }

  // auth, billing, format, model_not_found → yield error chunk, break
  yield { type: "error", reason, message: sanitize(error) };
  break;
}
```

---

### 1.3 Doom Loop Detection

**Source:** OpenCode `packages/opencode/src/session/processor.ts`
**Unique to OpenCode.** OpenClaw doesn't have this. Codex missed it. Gemini caught it.

**Modify:** `next-app/lib/agent/loop-controller.ts` (~25 lines added)

```typescript
const DOOM_LOOP_THRESHOLD = 3;

// State tracked across iterations:
let lastToolKey: string | null = null;
let consecutiveCount = 0;

// On each tool call:
export function checkDoomLoop(toolName: string, toolArgs: unknown): boolean {
  const key = `${toolName}:${JSON.stringify(toolArgs)}`;
  if (key === lastToolKey) {
    consecutiveCount++;
    if (consecutiveCount >= DOOM_LOOP_THRESHOLD) {
      consecutiveCount = 0;  // reset after triggering
      return true;  // doom loop detected
    }
  } else {
    lastToolKey = key;
    consecutiveCount = 1;
  }
  return false;
}
```

When `true`, inject a system message: `"You are repeating the same action with the same arguments. Try a different approach or ask the user for guidance."` This costs ~30 tokens but saves potentially hundreds of thousands in wasted loop iterations.

**Important:** This is orthogonal to the spike's conversation run lock. The run lock prevents overlapping *runs*. Doom loop prevents waste *within* a single run.

---

### 1.4 Safety Margin on Token Estimation

**Source:** OpenClaw `src/agents/compaction.ts` line 13
**Only Claude caught this.** Trivial change, high ROI.

**Modify:** `next-app/lib/agent/compaction.ts` (~5 lines)

```typescript
const SAFETY_MARGIN = 1.2;  // 20% buffer for estimation error

// Our estimateTokens() uses text.length / 4, which can undercount by 20%+
// for non-ASCII content, structured JSON, or repeated tokens.
// Apply safety margin everywhere we compare estimates to budgets:

// BEFORE: if (estimatedTokens > budget)
// AFTER:  if (estimatedTokens * SAFETY_MARGIN > budget)
```

This single constant prevents the "estimated 79K tokens, fits in 80K budget... actual: 96K, overflow" failure mode.

---

### 1.5 Provider Message Normalization — Minimal Guards (Pre-Submission)

**Source:** OpenCode `packages/opencode/src/provider/transform.ts` (400+ lines)
**Promoted to Tier 1** per Codex feedback: malformed tool-call IDs and invalid role sequences cause API 400s, which is a runtime failure, not just quality. Normalization is distinct from transcript repair — it handles provider quirks on every call; transcript repair fixes structural damage from crashes.

**Modify:** `next-app/lib/server/ai/providers/` or shared helper (~40 lines)

**Tier 1 scope (OpenAI-today):** Only enforce minimal safety invariants we need now:
1. Stable/valid tool-call ID handling (prevents 400s on mismatched IDs)
2. Role/order sanity checks for tool-call/tool-result sequences
3. Malformed-message guards that prevent known 4xx request failures

**Deferred scope (multi-provider):** Provider-specific transforms (e.g., Anthropic empty-content filtering, unsupported modality fallback, role alternation requirements) only when additional providers are enabled in production.

```typescript
// Tier 1 pre-submission normalization (run before every OpenAI API call):
// 1. Tool-call ID consistency — ensure IDs match format requirements
// 2. Role/order validation — tool results follow their tool calls
// 3. Malformed-message guards — prevent known 4xx patterns

// Deferred (multi-provider):
// 4. Empty content filtering — Anthropic rejects empty content arrays
// 5. Unsupported modality fallback — replace images with text descriptions
// 6. Strict role alternation — some providers require user/assistant alternation
```

This is lightweight plumbing — not a new file, just pre-call guards in the provider layer.

---

### 1.6 Session Transcript Repair (Post-Crash)

**Source:** OpenClaw `src/agents/session-transcript-repair.ts` (356 lines)
**Promoted to Tier 1** per Codex feedback: malformed tool-call/tool-result history causes next-turn API 400s — this is a runtime failure, not just quality polish.

**Modify:** `next-app/lib/agent/compaction.ts` (~60 lines added)

```typescript
export function repairConversationHistory(
  messages: Message[],
  stopReason?: "completed" | "error" | "aborted"
): Message[] {
  const result: Message[] = [];
  const pendingToolCalls = new Map<string, { name: string; msgIndex: number }>();

  for (const msg of messages) {
    result.push(msg);

    if (msg.role === "assistant" && msg.toolCalls) {
      for (const call of msg.toolCalls) {
        // Validate: name matches /^[A-Za-z0-9_-]+$/ and length ≤ 64
        if (isValidToolCallName(call.name) && call.id) {
          pendingToolCalls.set(call.id, { name: call.name, msgIndex: result.length - 1 });
        }
      }
    }

    if (msg.role === "tool" && msg.toolCallId) {
      pendingToolCalls.delete(msg.toolCallId);
    }
  }

  // CRITICAL (from Codex/OpenClaw): Do NOT insert synthetic results if the run
  // was aborted or errored — incomplete tool_use blocks would still cause API 400s.
  // Only insert synthetics for completed runs with orphaned calls (e.g., DB write failed).
  if (stopReason === "error" || stopReason === "aborted") {
    return result;  // leave orphans for the next repair pass after cleanup
  }

  // Insert synthetic error results for orphaned tool calls
  for (const [callId, info] of pendingToolCalls) {
    result.push({
      role: "tool",
      toolCallId: callId,
      content: "Tool execution was interrupted. No result available.",
      isError: true,
    });
  }

  return result;
}
```

Call before sending history to the API. Prevents 400 errors from orphaned tool_use blocks (especially after cancelled runs or crashes mid-loop).

---

## 4. Tier 2 — Quality Upgrades

These improve reliability and output quality. Not crash-critical but important for correctness and UX.

---

### 2.1 Structured Compaction Summaries

**Source:** OpenCode `src/session/compaction.ts` (structured prompt) + OpenClaw `src/agents/compaction.ts` (adaptive math)
**All agents agree** compaction needs improvement. Best approach: merge OpenCode's structured template with OpenClaw's adaptive chunk ratios.

**Modify:** `next-app/lib/agent/compaction.ts`

**A. Structured prompt** (adapted for literature review, not generic coding):

```
Summarize this conversation using EXACTLY these sections:

## Goal
The user's research question or review objective.

## Protocol State
Current inclusion/exclusion criteria and search strategy, if established.

## Key Findings
Important discoveries from papers, screening decisions, data extraction results.

## Completed Actions
Tools used, papers screened/included/excluded, data extracted, decisions made.

## Active Context
Current study under review, pending decisions, immediate next steps.
```

**B. Adaptive chunk ratio** (from OpenClaw):

```typescript
function computeChunkRatio(messages: Message[], contextWindow: number): number {
  const totalTokens = messages.reduce((s, m) => s + estimateTokens(m), 0);
  const avgTokens = totalTokens / messages.length;
  const avgRatio = (avgTokens * SAFETY_MARGIN) / contextWindow;

  if (avgRatio > 0.1) {
    // Large messages → shrink chunks to avoid oversized summaries
    const reduction = Math.min(avgRatio * 2, 0.25);
    return Math.max(0.15, 0.4 - reduction);
  }
  return 0.4;  // default: summarize 40% of history
}
```

**C. Oversized message detection** (from OpenClaw):

```typescript
function isOversized(msgTokens: number, contextWindow: number): boolean {
  return msgTokens * SAFETY_MARGIN > contextWindow * 0.5;
}
// Oversized messages → partial summary:
// "[Large response (~12K tokens) summarized: {1-sentence gist}]"
```

**D. Compaction thresholds** (from OpenCode, adapted):

```
PRUNE_MINIMUM = 20,000 tokens   // Don't compact below this (OpenCode value)
PRUNE_PROTECT = 40,000 tokens   // Protect this many tokens from the end (OpenCode value)
// Our current: no protect threshold, fixed message-count trigger (30 messages)
// The token-based approach is more reliable than message-count
```

---

### 2.2 Bidirectional Tool Output Truncation

**Source:** OpenCode `src/tool/truncation.ts` (108 lines)
**Claude + Gemini + Codex all agree.** OpenClaw only does head-truncation at 8K chars.

**Create:** `next-app/lib/agent/truncation.ts` (~50 lines)

```typescript
export type TruncationMode = "head" | "tail" | "both";

export function truncateToolOutput(
  content: string,
  mode: TruncationMode = "head",
  maxChars = 16_000,
): string {
  if (content.length <= maxChars) return content;
  const omitted = content.length - maxChars;

  if (mode === "tail") {
    return `[...${omitted} chars truncated from start...]\n` + content.slice(-maxChars);
  }
  if (mode === "both") {
    const half = Math.floor(maxChars / 2);
    return content.slice(0, half)
      + `\n\n[...${omitted} chars truncated...]\n\n`
      + content.slice(-half);
  }
  return content.slice(0, maxChars) + `\n[...${omitted} chars truncated...]`;
}

// Map our tools to appropriate modes:
export const TOOL_TRUNCATION_MODES: Record<string, TruncationMode> = {
  search_pubmed:      "head",   // best results ranked first
  search_openalex:    "head",   // best results ranked first
  extract_pdf:        "both",   // intro + conclusions both matter
  bulk_screening:     "tail",   // summary/decisions at end
  get_study_details:  "head",   // metadata first
  retrieve_memories:  "head",   // most relevant first
};
```

---

### 2.3 Fence-Aware Markdown Truncation

**Source:** OpenClaw `src/auto-reply/chunk.ts` (460+ lines), `src/auto-reply/fences.ts` (82 lines)
**All agents agree** this is worth stealing (Claude, Codex, Gemini on OpenClaw).

**Add to:** `next-app/lib/agent/truncation.ts` (~50 lines added)

```typescript
type FenceSpan = { start: number; end: number; marker: string };

function parseFenceSpans(text: string): FenceSpan[] {
  const lines = text.split('\n');
  const spans: FenceSpan[] = [];
  let open: { line: number; marker: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s{0,3})(`{3,}|~{3,})(.*)?$/);
    if (!match) continue;
    const marker = match[2];
    if (!open) {
      open = { line: i, marker };
    } else if (marker.startsWith(open.marker[0]) && marker.length >= open.marker.length) {
      spans.push({ start: open.line, end: i, marker: open.marker });
      open = null;
    }
  }
  if (open) spans.push({ start: open.line, end: lines.length - 1, marker: open.marker });
  return spans;
}

function isInsideFence(spans: FenceSpan[], lineIndex: number): FenceSpan | null {
  return spans.find(s => lineIndex > s.start && lineIndex < s.end) ?? null;
}

// If truncation lands inside a code fence:
// 1. Close the fence at the truncation point
// 2. Add truncation note
// Result: valid markdown, no broken code blocks in TimelineRenderer
```

This directly fixes rendering glitches when compacted tool results or truncated AI responses break code blocks mid-fence.

---

### 2.4 Stream Coalescing

**Source:** OpenClaw `src/auto-reply/reply/block-reply-coalescer.ts`, `block-streaming.ts`
**Codex now agrees this belongs in Tier 2** ("Non-Crash-Critical" but important UX/correctness polish). The spike branch's event-routing system is the right integration point.

**Create:** `next-app/lib/server/ai/stream-coalescer.ts` (~80 lines)

```
MIN_CHARS = 800     // Don't flush until 800 chars accumulated
MAX_CHARS = 1200    // Force flush at 1200 chars
IDLE_MS = 1000      // Flush after 1s of silence

On each content delta:
  buffer += delta
  clearIdleTimer()
  if buffer.length >= MAX_CHARS → flush immediately
  else → scheduleIdleFlush(IDLE_MS)

On idle timer fire:
  if buffer.length > 0 → flush
```

Benefits: fewer SSE events (hundreds → dozens), natural typing cadence, less client re-rendering. The spike's `StreamReducer` would receive fewer, larger chunks instead of per-token updates.

**Integration point:** If spike is kept, layer between `route.ts` event emission and SSE response. If not, layer between provider stream and NDJSON encoder in `ai-service.ts`.

**Note:** Sections 2.3 (fence-aware chunking) and 2.4 (coalescing) together form Codex's "Stream Stability Primitives" (#5). They share the `truncation.ts` and `stream-coalescer.ts` files and should ship in the same wave.

---

### 2.5 4-Pass Fuzzy Text Matching

**Source:** OpenCode `packages/opencode/src/patch/index.ts` (680 lines)
**Codex promoted this to Tier 2** (adopted Claude's argument about text-edit brittleness). Small-medium lift with pragmatic reliability gain.

**Create:** `next-app/lib/agent/fuzzy-match.ts` (~80 lines)

```typescript
export function fuzzyMatch(
  haystack: string,
  needle: string,
): { index: number; pass: 1 | 2 | 3 | 4 } | null {
  // Pass 1: Exact
  let idx = haystack.indexOf(needle);
  if (idx !== -1) return { index: idx, pass: 1 };

  // Pass 2: Right-strip (trailing whitespace per line)
  const rstrip = (s: string) => s.split('\n').map(l => l.trimEnd()).join('\n');
  idx = rstrip(haystack).indexOf(rstrip(needle));
  if (idx !== -1) return { index: idx, pass: 2 };

  // Pass 3: Full trim (leading + trailing per line)
  const trim = (s: string) => s.split('\n').map(l => l.trim()).join('\n');
  idx = trim(haystack).indexOf(trim(needle));
  if (idx !== -1) return { index: idx, pass: 3 };

  // Pass 4: Unicode normalized
  idx = normalizeUnicode(trim(haystack)).indexOf(normalizeUnicode(trim(needle)));
  if (idx !== -1) return { index: idx, pass: 4 };

  return null;
}

function normalizeUnicode(s: string): string {
  return s
    .replace(/[\u2018\u2019\u2032]/g, "'")   // smart single quotes, prime
    .replace(/[\u201C\u201D\u2033]/g, '"')   // smart double quotes, double prime
    .replace(/[\u2013\u2014]/g, '-')         // en/em dash → hyphen
    .replace(/\u2026/g, '...')               // ellipsis → three dots
    .replace(/\u00A0/g, ' ');               // NBSP → space
}
```

Use in the self-healing JSON path (our P7 architecture) when Zod validation fails on a tool payload that contains text meant to match existing content. Also useful for `update_criteria`, `update_protocol`, or any future "edit user text" tool.

---

## 5. Tier 3 — Polish & Instrumentation

These are lower-priority items that improve observability or prepare for future scaling. Not crash-critical, not UX-critical, but worth doing when bandwidth allows.

---

### 3.1 Cache Hit Tracking

**Source:** OpenClaw `src/agents/cache-trace.ts`, `pi-embedded-runner/cache-ttl.ts`
**Codex puts this at Tier 2; I keep it at Tier 3** (see gaps section). Low effort, answers "is our prompt ordering saving money?" Worth doing but not before stream stability or fuzzy matching.

**Modify:** `next-app/lib/server/ai/rate-limiter.ts` (~15 lines)

```typescript
// When provider returns usage metadata, capture cache fields:
if (usage.prompt_tokens_details?.cached_tokens) {
  await recordCacheMetric(projectId, {
    cachedTokens: usage.prompt_tokens_details.cached_tokens,
    totalPromptTokens: usage.prompt_tokens,
    model,
    timestamp: Date.now(),
  });
}
```

---

### 3.2 Retrieval Quality Upgrades (OpenClaw algorithms only)

**Source:** OpenClaw `src/memory/hybrid.ts`, `src/memory/mmr.ts`, `src/memory/temporal-decay.ts`
**All agents agree: algorithms only, not infra.** Codex puts this at Tier 2 behind flags; I keep it at Tier 3 because memory retrieval quality hasn't been a pain point yet.

**Modify:** `next-app/lib/server/memory/memory-retrieval.ts`

Algorithms to steal:
1. **MMR reranking** (diversity): `λ=0.7`, iteratively select documents that maximize relevance while minimizing redundancy with already-selected docs.
2. **Temporal decay**: `score × exp(-ln(2) × ageDays / halfLifeDays)` where `halfLifeDays = 30`.
3. **Hybrid fusion**: `finalScore = 0.7×vectorScore + 0.3×bm25Score` with expanded candidate pool (fetch 3× final count from each source).

Ship behind feature flags. Only promote to active when retrieval quality complaints emerge.

---

### 3.3 Tool Execution Middleware

**Source:** OpenCode `src/session/prompt.ts` hooks, OpenClaw `src/plugins/hooks.ts`
**Codex puts this at Tier 2 (#8); I keep it at Tier 3** (see gaps section). Internal before/after interception points for tracing and policy. Not needed until we have observability or policy requirements.

**Modify:** `next-app/lib/server/ai/ai-service.ts`, `next-app/lib/server/ai/tools/*`

```typescript
// Before/after hooks for tool execution:
type ToolMiddleware = {
  before?: (call: ToolCall) => ToolCall | null;  // transform or block
  after?: (call: ToolCall, result: ToolResult) => ToolResult;  // transform or log
};
```

Internal only — no public plugin API.

---

## 6. Tier 4 — Deferred

These patterns are valuable but need specific triggers before implementation.

| # | Pattern | Best Source | Trigger | Notes |
|---|---------|-----------|---------|-------|
| 4.1 | Auth profile rotation with cooldowns | OpenClaw `src/agents/auth-profiles/` | Multiple API keys (team scaling) | Per-type backoff: rate_limit = 5^n × 60s capped 1h; billing = 2^n × 60s capped 24h; timeout = no cooldown |
| 4.2 | Structured output contracts | OpenCode `src/session/prompt.ts` | Sustained >1% parse/shape failure rate or repeated manual repair incidents | Schema-enforced tool call for structured responses. Codex also moved this to Tier 3 (conditional). Both plans now agree: only promote if measurable pain. |
| 4.3 | Embedding batch + cache | OpenClaw `src/memory/manager-embedding-ops.ts` | Cost optimization for embedding-heavy projects | Hash-based cache keys, skip re-embedding unchanged content, batch retries with circuit breaker fallback |
| 4.4 | Arity-based permission patterns | OpenCode `src/permission/arity.ts` | MCP tools or user-configurable tool permissions | 162-command arity dictionary, wildcard matching, last-match-wins. Our 5-level autonomy is sufficient until then. |
| 4.5 | AsyncLocalStorage context | OpenCode `src/util/context.ts` | New server-side code that needs clean context flow | Request-scoped DI without prop drilling. Adopt for new code, don't refactor existing. |
| 4.6 | Typed event bus | OpenCode `src/bus/` | Need to decouple tool execution from side effects | Zod-validated pub/sub. The spike's reducer pattern partially addresses this; full event bus is overkill unless we need cross-cutting concerns. |
| 4.7 | `lazy()` with reset | OpenCode `src/util/lazy.ts` | Tool registry or provider client caching | ~15 lines. Grab when convenient. |
| 4.8 | Subagent lifecycle runtime | OpenClaw + OpenCode | Durable background worker/orchestration in place | All agents agree: defer. |

---

## 7. What We Are NOT Stealing

Consolidated across all 6 analysis reports. If any agent recommended it and I'm skipping it, I explain why.

| Pattern | Source | Why Skip |
|---------|--------|----------|
| A2UI / Live Canvas | OpenClaw | Multi-channel message broker (WhatsApp, Discord). We're a single SPA. **Gemini recommended this; it's wrong.** |
| Gateway / WebSocket control plane | OpenClaw | Multi-tenant server routing. We use Next.js server actions. |
| Lit Web Components | OpenClaw | Different UI framework entirely. |
| QMD Memory Backend (1,400 lines) | OpenClaw | CLI-specific ML tool. The builtin algorithms (MMR, decay) are the useful parts. |
| Skills directory (SKILL.md) | OpenClaw + OpenCode | Runtime doc-reading pattern for CLI tools. We have programmatic tool registry with Zod schemas. |
| Subagent spawning runtime | OpenClaw + OpenCode | All agents agree: defer until durable async infrastructure exists. |
| Full config hierarchy (70+ files) | OpenClaw | Over-engineered for our env-var + feature-flag setup. |
| Solid.js Terminal UI | OpenCode | Different rendering paradigm. |
| SQLite + Drizzle storage | OpenCode | We use PostgreSQL + Prisma. |
| Git bare repo snapshots | OpenCode | We checkpoint in PostgreSQL. |
| LSP multi-language servers | OpenCode | We don't do code editing. |
| Vercel AI SDK adoption | OpenCode | Would rewrite entire AI layer for marginal benefit with single provider. |
| Session sharing / sync queue | OpenCode | Our sharing is project-level in PostgreSQL. |
| MCP integration (938 lines) | OpenCode | In deferred backlog. Will need own integration when implemented. |
| Bun runtime internals | OpenCode | Platform-specific. |
| Runtime npm plugin loading | OpenCode | External plugin system is out of scope. |
| Full subagent routing | OpenClaw | **Gemini recommended this.** Architecture distance is too large — our plan-driven tool execution handles multi-step workflows differently. |
| OpenClaw's entire memory-search.ts | — | **Gemini said "steal the entire file."** It's 84 files with SQLite+sqlite-vec. We'd rewrite 95% of it. Steal the 3 algorithms (hybrid merge, MMR, decay) as pure functions. |

---

## 8. Where I Disagree with Other Agents

### Disagreements with Codex (Final State)

| Topic | Codex Final Position | Claude Final Position | Status |
|-------|---------------------|----------------------|--------|
| **Structured output contracts** | Tier 3 (conditional: only if >1% failure rate) | Tier 4 (deferred) | **Nearly aligned.** Both agree it's conditional. Minor tier difference. |
| **Permission rules engine** | Tier 3 (deferred) | Tier 4 (deferred) | **Aligned.** |
| **Doom loop detection** | Tier 1 (adopted from Claude) | Tier 1 (critical) | **Aligned.** |
| **Safety margin** | Tier 1 (adopted from Claude) | Tier 1 (critical) | **Aligned.** |
| **Provider failover** | Dropped | Tier 4 | **Aligned.** |
| **Provider normalization** | Tier 1 item #4 (OpenAI-today scope) | Tier 1 (promoted per Codex feedback: prevents 400s) | **Aligned.** |
| **Transcript repair** | Tier 1 #2 | Tier 1 (promoted per Codex feedback: prevents 400s) | **Aligned.** |
| **Fuzzy matching** | Tier 2 #7 (adopted from Claude) | Tier 2 (promoted from Tier 3) | **Aligned.** |
| **Stream stability** | Tier 2 #5 (Non-Crash-Critical) | Tier 2 (promoted from Tier 3) | **Aligned.** |
| **Cache instrumentation** | Tier 2 #9 | Tier 3 | **Still disagree.** Not urgent enough for Tier 2. See gaps. |
| **Tool middleware** | Tier 2 #8 | Tier 3 | **Still disagree.** No tracing/policy requirements yet. See gaps. |
| **Retrieval quality** | Tier 2 #6 (behind flags) | Tier 3 (behind flags) | **Still disagree.** No retrieval quality complaints yet. See gaps. |

### Disagreements with Gemini

| Topic | Gemini Says | I Say | Reasoning |
|-------|------------|-------|-----------|
| **A2UI / Live Canvas** | "Steal it" | Skip | Multi-channel message broker. Completely irrelevant to our Next.js SPA. |
| **Subagent routing** | "Steal it" | Skip/Defer | Their subagent system spawns CLI background sessions. Our plan-driven execution is architecturally different. |
| **"Steal entire memory-search.ts"** | Top recommendation | Steal algorithms only | It's 84 files, not one file. The file Gemini cited doesn't exist as a single self-contained module. |
| **Markdown parser replacement** | "Steal the markdown IR" | Steal fence-aware chunking only | They use `markdown-it` like everyone. The novelty is in streaming chunking, not the parser itself. |

### Where I Agree with Codex (things adopted)

- **Embedding caching** (Tier 4.3) — Codex correctly identified it as worthwhile for cost optimization.
- **Provider normalization scope** — Adopted Codex's Wave 1 (OpenAI-today) vs deferred (multi-provider) clarification.
- **Fuzzy matching promotion** — Codex adopted my argument and promoted to Tier 2. I've aligned.
- **Stream stability placement** — Codex correctly labeled as "Non-Crash-Critical" Tier 2. I've promoted from Tier 3.
- **Structured output contracts** — Codex moved to Tier 3 conditional. We're nearly aligned (I say Tier 4, both agree: only if measurable pain).
- **Per-wave test requirements** — Good structural addition from Codex.
- **Spike Scenario A/B/C framework** — Clear decision structure.

---

## 9. Files Summary

### Create (New Files)

| File | ~Lines | Source | Tier |
|------|--------|--------|------|
| `lib/server/utils/retry.ts` | 50 | OpenClaw | 1 |
| `lib/server/ai/error-classification.ts` | 130 | OpenClaw + OpenCode | 1 |
| `lib/agent/truncation.ts` | 100 | OpenCode + OpenClaw | 2 |
| `lib/server/ai/stream-coalescer.ts` | 80 | OpenClaw | 2 |
| `lib/agent/fuzzy-match.ts` | 80 | OpenCode | 2 |
| **Total new code** | **~440 lines** | | |

### Modify (Existing Files)

| File | Changes | Source | Tier |
|------|---------|--------|------|
| `lib/agent/loop-controller.ts` | +25 lines: doom loop state + checker | OpenCode | 1 |
| `lib/agent/compaction.ts` | +80 lines: safety margin, adaptive ratio, structured prompt, oversized detection, transcript repair | OpenClaw + OpenCode | 1 |
| `lib/server/ai/ai-service.ts` (or `chat-runtime/runtime.ts` if spike kept) | Error handling rewrite: classify → retry/compact/fail-fast, doom loop check | Both | 1 |
| `lib/server/ai/providers/*` | +40 lines: pre-submission message normalization (Tier 1: OpenAI-today scope) | OpenCode | 1 |
| `lib/server/ai/rate-limiter.ts` | +15 lines: cache hit tracking | OpenClaw | 3 |
| `lib/server/memory/memory-retrieval.ts` | MMR + decay + hybrid fusion (behind flags) | OpenClaw | 3 |
| **Total modified code** | **~180 lines** | | |

### Grand Total: ~620 lines of carefully targeted changes (rough estimate, not a commitment — actual scope depends on integration path chosen in Wave 0)

---

## 10. Verification Gates & Required Tests

> Credit to Codex for structuring this per-wave. From `next-app/`, every wave must pass `npx tsc --noEmit` and `npx vitest run`.

### Wave 0 (Spike Review Gate + Reasoning Visibility Review) — COMPLETE
Executed by Codex. Branch aligned to Scenario A via 3 cherry-picks. `tsc` + `vitest` pass. Reasoning-visibility review performed; 3 items deferred to Wave 3 (toggle, OpenAI parity, storage/replay acceptance). See `codex/implementation_progress_codex.md` for full execution log.

### Wave 1 (Tier 1: Reliability + Loop Safety + Normalization + Transcript Repair)
Tests to write:
1. `retry.test.ts` — retryAsync respects attempts, backoff, jitter, Retry-After (seconds + ms variants), shouldRetry predicate
2. `error-classification.test.ts` — classifyAIError maps status codes and message patterns correctly; isContextOverflow covers all 15+ patterns; isRetryable returns correct booleans
3. `loop-controller.test.ts` — doom loop triggers at threshold 3, resets on different tool, doesn't false-positive on same-name-different-args
4. `compaction.test.ts` — SAFETY_MARGIN applied to budget checks
5. `normalization.test.ts` — tool-call ID consistency, role/order validation, malformed-message guard catches known 4xx patterns
6. `transcript-repair.test.ts` — orphaned tool calls get synthetic results; abort/error stop reason skips synthetics; valid transcripts pass through unchanged

### Wave 2 (Tier 2: Compaction + Truncation)
Tests to write:
1. `compaction.test.ts` — adaptive chunk ratio (verify ratio shrinks when avg message is large); oversized detection; structured summary prompt produces expected sections
2. `truncation.test.ts` — head/tail/both modes produce correct output; tool-mode mapping applies per tool name; content under threshold passes through unchanged; fence-aware truncation closes/reopens fence markers correctly

### Wave 3 (Tier 2 continued: Stream Stability + Fuzzy Matching + Reasoning Visibility Finalization)
Tests to write:
1. `stream-coalescer.test.ts` — respects min/max chars; idle timeout flushes; final flush on stream end
2. `fuzzy-match.test.ts` — 4 passes produce correct results; Unicode normalization handles smart quotes, dashes, NBSP, ellipsis
3. **Finalize reasoning visibility shipping criteria** — resolve the 3 open items from Wave 0 review:
   - Implement explicit user control toggle (`Off` / `Summary` / `Full`)
   - Implement OpenAI provider parity (summary mode or graceful no-op fallback)
   - Complete storage/replay UX acceptance (manual product review)
   All 6 Wave 0 checklist items must be green before Wave 4.

### Wave 4 (Tier 3: Polish & Instrumentation)
Tests to write:
1. Cache hit tracking — verify metric recording when provider returns cached_tokens
2. Retrieval quality — MMR diversity, temporal decay correctness, hybrid fusion scoring (behind flags)
3. Tool middleware — before/after hooks fire correctly, blocking works

### Wave 5: Next-Phase Planning (Autonomy Expansion)

After Waves 1-4 are complete and stable, create a dedicated follow-on plan for making the agent **smarter**, not just more resilient. This plan does NOT cover these topics — they require their own analysis cycle.

Plan scope must include:
1. **Task decomposition architecture** — how the agent breaks multi-step research tasks into plans (search → screen → extract → synthesize).
2. **Tool selection strategy** — improving how the agent chooses which tool to call next based on context and prior results.
3. **Subagent architecture** — spawn model, lifecycle, cancellation, budgets, audit trail (adopted from Codex Wave 5).
4. **Richer policy layer** — permission rules overlay, approval gates, policy telemetry (adopted from Codex Wave 5).
5. **Self-correction patterns** — agent recognizing when its approach isn't working and pivoting strategy.
6. **Concurrent tool execution** — parallelizing independent tool calls within a single loop iteration.
7. **Rollout strategy** — hard safety guards, evals, kill switches, and concrete entry criteria (stability metrics, reliability thresholds) before starting implementation.

Entry criteria: Waves 1-4 shipped and stable in production. No open Tier 1 reliability gaps.

---

## 11. Constants Reference

All constants cited in this plan, with their source and our current equivalent.

### From OpenClaw

| Constant | Value | Source File | LitRev Equivalent |
|----------|-------|------------|-------------------|
| `SAFETY_MARGIN` | 1.2 | `compaction.ts:13` | **None (gap)** |
| `BASE_CHUNK_RATIO` | 0.4 | `compaction.ts:11` | Implicit in our fixed thresholds |
| `MIN_CHUNK_RATIO` | 0.15 | `compaction.ts:12` | None |
| `MAX_OVERFLOW_COMPACTION_ATTEMPTS` | 3 | `run.ts:508` | None |
| `TOOL_RESULT_MAX_CHARS` | 8,000 | `pi-embedded-subscribe.tools.ts:9` | 16,000 (ours is 2× looser) |
| `RETRY_ATTEMPTS` | 3 | `retry.ts:26` | **None (no retry)** |
| `RETRY_MIN_DELAY_MS` | 300 | `retry.ts:27` | None |
| `RETRY_MAX_DELAY_MS` | 30,000 | `retry.ts:28` | None |
| `DEFAULT_BLOCK_STREAM_MIN` | 800 chars | `block-streaming.ts:13` | None (per-token streaming) |
| `DEFAULT_BLOCK_STREAM_MAX` | 1,200 chars | `block-streaming.ts:14` | None |
| `DEFAULT_IDLE_MS` | 1,000 | `block-streaming.ts:15` | None |
| `TOOL_CALL_NAME_MAX_CHARS` | 64 | `session-transcript-repair.ts:4` | None (no validation) |
| `HYBRID_VECTOR_WEIGHT` | 0.7 | memory search | N/A (future) |
| `HYBRID_TEXT_WEIGHT` | 0.3 | memory search | N/A (future) |
| `MMR_LAMBDA` | 0.7 | memory search | N/A (future) |
| `TEMPORAL_DECAY_HALF_LIFE_DAYS` | 30 | memory search | N/A (future) |

### From OpenCode

| Constant | Value | Source File | LitRev Equivalent |
|----------|-------|------------|-------------------|
| `DOOM_LOOP_THRESHOLD` | 3 | `session/processor.ts` | **None (gap)** |
| `RETRY_INITIAL_DELAY` | 2,000ms | `session/retry.ts` | None |
| `RETRY_BACKOFF_FACTOR` | 2 | `session/retry.ts` | None |
| `OUTPUT_TOKEN_MAX` | 32,000 | `session/llm.ts` | Not explicitly set |
| `PRUNE_MINIMUM` | 20,000 tokens | `session/compaction.ts` | None (message-count based) |
| `PRUNE_PROTECT` | 40,000 tokens | `session/compaction.ts` | None |
| `MAX_LINES` (truncation) | 2,000 | `tool/truncation.ts` | None (char-based only) |
| `MAX_BYTES` (truncation) | 50,000 | `tool/truncation.ts` | 16,000 chars |
| Context overflow patterns | 15+ regexes | `provider/error.ts` | **None (gap)** |
| `COMMAND_ARITY` entries | 162 | `permission/arity.ts` | N/A (no bash execution) |

### Our Current Constants (For Reference)

| Constant | Value | File |
|----------|-------|------|
| `TOOL_RESULT_MAX_CHARS` | 16,000 | `compaction.ts:18` |
| `DEFAULT_HISTORY_BUDGET` | 80,000 | `compaction.ts:19` |
| `COMPACTION_THRESHOLD_MESSAGES` | 30 | `compaction.ts:20` |
| `maxIterations` | 10 | `loop-controller.ts:24` |
| `maxToolCalls` | 25 | `loop-controller.ts:25` |
| `maxWallTimeMs` | 120,000 | `loop-controller.ts:26` |
| Scroll threshold | 24px | `useStableChatScroll.ts` |
