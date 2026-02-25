# Overall Stealing Process (Codex Canonical)

Date: February 25, 2026  
Owner: Codex  
Status: Canonical merged plan (supersedes all per-repo analysis docs)  
Scope: What to steal from OpenClaw + OpenCode for LitRev 2026 (`next-app/`)  

---

## Canonical Inputs (Fully Merged)

1. `openclaw_analysis_report_claude.md`
2. `openclaw_analysis_report_gemini.md`
3. `opencode_analysis_report_claude.md`
4. `opencode_analysis_report_gemini.md`
5. `overall_stealing_process_claude.md`
6. This document (updated Codex overall plan)

Also included:
1. Vercel-inspired spike summary (stream/runtime refactor + run lock + typed artifact actions)
2. Unreviewed spike commit: `293aa2f` on `spike-vercel-chat-sdk-adaptation-clean` (reasoning stream visibility)
3. Upstream snapshots referenced by Codex deep dives:
   - OpenClaw: `bf8ca07deb704b7f50a1db792f88c93e7a4e15be`
   - OpenCode: `2c00eb60bdc6e6ff0362e792e731eaa39204bf72`
4. Note: per-repo Codex analysis files were intentionally merged into this plan and then deleted.

---

## Ground Rules (Non-Negotiable)

1. Never copy upstream code verbatim.
2. Steal patterns, constants, and control flow ideas only.
3. Keep LitRev architecture: Next.js 16, React 19, TypeScript, Prisma/Postgres, existing run/artifact/autonomy model.
4. Preserve UI contract and token-first styling standards in `next-app/`.
5. Every adaptation must pass from `next-app/`:
   - `npx tsc --noEmit`
   - `npx vitest run`

---

## Git Execution Policy

Use commit hygiene as part of implementation control:

1. Start from the target implementation branch with all current work intentionally preserved.
2. Before Wave 1 starts, create a baseline checkpoint commit that captures current branch state.
3. Implement and commit at wave granularity (Wave 1, Wave 2, Wave 3, Wave 4), not as one large final commit.
4. For substantial wave steps, use smaller sub-commits when rollback/isolation would be useful (for example retry/error layer separate from compaction changes).
5. Run `npx tsc --noEmit` and `npx vitest run` before each wave commit.
6. Do not mix unrelated edits into implementation commits.

Note: a perfectly "clean repo" is not strictly required if there are intentional existing changes, but each implementation commit must be scoped and auditable.

---

## Source File Map (Upstream)

This plan is intentionally decision-first, but these are the exact upstream files to consult during implementation:

1. Reliability core:
   - OpenClaw: `src/infra/retry.ts`, `src/agents/failover-error.ts`
   - OpenCode: `packages/opencode/src/provider/error.ts`, `packages/opencode/src/session/retry.ts`, `packages/opencode/src/provider/transform.ts`, `packages/opencode/src/session/message-v2.ts`
2. Doom-loop and loop behavior:
   - OpenCode: `packages/opencode/src/session/processor.ts`
3. Transcript repair and compaction guardrails:
   - OpenClaw: `src/agents/session-transcript-repair.ts`, `src/agents/compaction.ts`, `src/agents/context-window-guard.ts`
   - OpenCode: `packages/opencode/src/session/compaction.ts`
4. Truncation modes:
   - OpenCode: `packages/opencode/src/tool/truncation.ts`
5. Streaming robustness:
   - OpenClaw: `src/auto-reply/reply/block-reply-coalescer.ts`, `src/auto-reply/reply/block-streaming.ts`, `src/auto-reply/chunk.ts`, `src/auto-reply/fences.ts`
6. Retrieval reranking:
   - OpenClaw: `src/memory/hybrid.ts`, `src/memory/mmr.ts`, `src/memory/temporal-decay.ts`
7. Structured output contracts:
   - OpenCode: `packages/opencode/src/session/prompt.ts`, `packages/opencode/src/session/message-v2.ts`
8. Fuzzy matching:
   - OpenCode: `packages/opencode/src/patch/index.ts`
9. Cache efficiency instrumentation:
   - OpenClaw: `src/agents/cache-trace.ts`, `src/agents/pi-embedded-runner/cache-ttl.ts`

---

## Cross-Agent Synthesis Verdict

### Highest-confidence consensus (all reports align)

1. Provider reliability layer is the top steal (retry, error taxonomy, overflow handling, optional failover).
2. Compaction needs hardening (safety margin + better fallback behavior).
3. Streaming robustness is worth adopting (coalescing and markdown-safe chunking).

### Strong additions from Claude reports that Codex adopts

1. Doom loop detection (OpenCode) should be immediate, not optional.
2. Structured compaction summary format (OpenCode) should be combined with adaptive compaction math (OpenClaw).
3. Bidirectional truncation (OpenCode) is a better default than head-only truncation.
4. Transcript repair before provider submission (OpenClaw) is a practical anti-400 guardrail.

### Items from Gemini reports that Codex explicitly rejects or narrows

1. Reject full-copy of OpenClaw memory subsystem; keep only algorithms (MMR/decay/fusion).
2. Reject A2UI/Live Canvas and multi-channel runtime patterns as non-fit.
3. Reject direct markdown stack replacement; keep fence/code-span safety ideas only.

---

## Final Steal Portfolio (What We Will Steal)

## Tier 1: Immediate Reliability (Ship First)

### 1) Reliability Core (OpenClaw + OpenCode merged)

Steal:
1. `retryAsync` with jitter/backoff and Retry-After parsing.
2. Typed error classification (`rate_limit`, `auth`, `billing`, `timeout`, `context_overflow`, `format`, `unknown`).
3. Context overflow detection with broad regex coverage and overflow-specific retry path.
4. Provider/transcript normalization preflight (tool-call ID consistency, malformed-message guards).

Scope clarification for normalization:
1. Wave 1 scope (OpenAI-today): only enforce minimal safety invariants we need now:
   - stable/valid tool-call ID handling
   - role/order sanity checks for tool-call/tool-result sequences
   - malformed-message guards that prevent known 4xx request failures
2. Deferred scope (multi-provider): provider-specific transforms (for example Anthropic-style content filtering) only when additional providers are enabled in production.

LitRev targets:
1. `next-app/lib/server/utils/retry.ts` (new)
2. `next-app/lib/server/ai/error-classification.ts` (new)
3. `next-app/lib/server/ai/ai-service.ts` (loop handling + retry/overflow path)
4. `next-app/lib/server/ai/providers/*` (normalization hooks)

Decision: Adopt now.

### 2) Loop Safety and Integrity (OpenCode + OpenClaw)

Steal:
1. Doom loop detection keyed by `toolName + stable args` with threshold `3`.
2. Transcript repair/sanitation before provider submission:
   - reorder/validate tool-call and tool-result pairs
   - drop orphaned tool results
   - avoid invalid synthetic inserts on aborted/error stops

LitRev targets:
1. `next-app/lib/agent/loop-controller.ts`
2. `next-app/lib/server/ai/ai-service.ts`
3. `next-app/lib/agent/compaction.ts` (or dedicated transcript helper)

Decision: Adopt now.

### 3) Compaction Hardening (OpenClaw math + OpenCode structure)

Steal:
1. Token safety margin (`SAFETY_MARGIN = 1.2`) on budget checks.
2. Adaptive chunk ratio for large-average-message histories.
3. Oversized message detection and partial-summary fallback.
4. Structured summary template for compacted history:
   - Goal
   - Protocol State
   - Key Findings
   - Completed Actions
   - Active Context

LitRev targets:
1. `next-app/lib/agent/compaction.ts`
2. `next-app/lib/server/ai/memory.ts`

Decision: Adopt now.

### 4) Tool Output Truncation v2 (OpenCode)

Steal:
1. Mode-aware truncation: `head`, `tail`, `both`.
2. Tool-to-mode mapping based on where useful signal typically appears.
3. Clear truncation markers explaining omitted size.

Initial mapping recommendation:
1. `search_pubmed`, `search_openalex`, `retrieve_memories` -> `head`
2. `extract_pdf` -> `both`
3. `bulk_screening` -> `tail`

LitRev targets:
1. `next-app/lib/agent/truncation.ts` (new)
2. `next-app/lib/agent/compaction.ts` (integration)

Decision: Adopt now.

---

## Tier 2: Next Sprint (High Value, Non-Crash-Critical)

### 5) Stream Stability Primitives (OpenClaw-first)

Steal:
1. Coalescing windows (`min/max chars + idle flush`) to reduce token-event chatter.
2. Markdown fence/code-span-safe chunk splitting to avoid malformed stream rendering.

LitRev targets:
1. `next-app/lib/server/ai/stream-coalescer.ts` (new)
2. `next-app/lib/server/ai/ai-service.ts` (wire coalescer)
3. `next-app/lib/ai/stream-parser.ts` and/or `next-app/lib/ai/stream-processor.ts`

Decision: Adopt next (important UX/correctness polish, not a primary crash-prevention control).

### 6) Retrieval Quality Upgrades (OpenClaw algorithms only)

Steal:
1. MMR reranking (diversity).
2. Temporal decay multiplier (recency weighting).
3. Better lexical/vector candidate fusion with candidate expansion.

LitRev targets:
1. `next-app/lib/server/memory/memory-retrieval.ts`

Decision: Adopt next, behind flags.

### 7) Text-Edit Robustness via 4-Pass Fuzzy Matching (OpenCode)

Steal:
1. Four-pass matching (`exact` -> `rstrip` -> `trim` -> `unicode-normalized`).
2. Unicode normalization for smart quotes, em/en dashes, ellipsis, and NBSP.
3. Apply to existing text-edit paths (`update_criteria`, `update_protocol`) where exact matching is brittle.

LitRev targets:
1. `next-app/lib/agent/fuzzy-match.ts` (new)
2. text-editing tool handlers in `next-app/lib/server/ai/tools/*`

Decision: Adopt next (small-medium lift, pragmatic reliability gain).

### 8) Internal Tool Middleware Surface (OpenCode/OpenClaw overlap)

Steal:
1. Before/after tool-call interception points.
2. Centralized metadata plumbing for policy and tracing.

LitRev targets:
1. `next-app/lib/server/ai/ai-service.ts`
2. `next-app/lib/server/ai/tools/*`

Decision: Adopt next (internal-only, no public plugin API).

### 9) Cache Efficiency Instrumentation (OpenClaw)

Steal:
1. Cache token accounting (`cacheCreationTokens`, `cacheReadTokens`) and lightweight TTL analytics.

LitRev targets:
1. `next-app/lib/server/ai/rate-limiter.ts` (or usage persistence layer)

Decision: Adopt next (small lift).

---

## Tier 3: Deferred (Trigger-Based)

1. Permission rules overlay with `ask/allow/deny` wildcard semantics (OpenCode) -> only when user-configurable sensitive tool permissions become product requirement.
2. Auth/profile rotation with cooldowns (OpenClaw) -> only when using multiple API keys/providers in production.
3. Subagent lifecycle runtime (both repos) -> only after durable background worker/orchestration is in place.
4. AsyncLocalStorage context, typed event bus, instance disposal patterns (OpenCode) -> only if server runtime complexity materially increases.
5. Structured output contracts (OpenCode) -> only promote when plan/scoping/report flows show measurable parse/shape failures (for example, sustained >1% invalid-structure rate or repeated manual repair incidents).

---

## What Not to Steal

1. OpenClaw A2UI/Live Canvas and gateway/websocket control-plane architecture.
2. OpenClaw full SQLite/QMD memory backend and large config hierarchy.
3. OpenCode Bun runtime assumptions, TUI stack, SQLite/Drizzle storage, git-snapshot model, and full plugin loader/runtime installer.
4. Direct adoption of Vercel AI SDK as a platform rewrite.

Reason: architectural mismatch and high migration cost for limited product value.

---

## Spike Branch Integration (Mandatory in Decision Process)

Context:
1. You have an unreviewed spike that already ports several Vercel/opencode-inspired runtime ideas.
2. Commit `293aa2f` adds streamed reasoning lifecycle support and UI rendering.
3. You may keep all, keep part, or discard spike changes.
4. Reported spike checks already passed (`npx tsc --noEmit`, `npx vitest run`), but product/UX acceptance is still pending.

### Recommendation by scenario

### Scenario A: Keep spike mostly as-is

Use spike as base and apply steals on top:
1. Add Tier 1 reliability core first (retry/error/overflow/doom loop), because spike summary indicates stream/runtime refactor but not full reliability taxonomy.
2. Keep conversation run lock and reducer-driven stream state (strong correctness win).
3. Keep typed artifact action contract and runtime event normalization.
4. Keep reasoning stream infra, but add product policy guardrails:
   - default reasoning visibility should be conservative
   - add mode/toggle controls before broad rollout
   - avoid provider-specific assumptions in generic UI state

### Scenario B: Keep only stable spike primitives

Retain:
1. Stream event normalization + reducer architecture
2. Conversation run lock
3. Typed artifact action dispatcher

Gate or postpone:
1. Reasoning UI exposure until provider parity and UX review are complete.

Then apply this canonical stealing plan unchanged.

### Scenario C: Drop spike branch

Directly implement this canonical plan on current mainline:
1. Reliability core
2. Loop/compaction hardening
3. Stream coalescing/markdown safety

Result: You still get most value without requiring the spike runtime substrate.

### Decision Locked For This Implementation

Chosen path: **Scenario A (keep spike mostly as-is)** with **reasoning visibility included in scope**.

This means:
1. Runtime/refactor foundations from spike stay in place.
2. Reasoning visibility is not deferred out of this project; it must be reviewed and finalized during implementation.

### Codex position on spike keep/drop

1. Keep `run lock`, `event routing`, and `reducer-driven stream handling` unless review finds correctness regressions.
2. Keep reasoning events plumbing, but ship UI visibility behind explicit mode control (`off/summary/full`) and provider-aware behavior.
3. Do not block Tier 1 reliability steals on the spike decision; those are orthogonal and needed either way.

### Spike-Aware Integration Targets (Adopted from Claude's Better Detail)

If spike runtime is kept, redirect implementation targets as follows:

1. Error classification:
   - default target: `next-app/lib/server/ai/ai-service.ts`
   - spike target: `next-app/lib/server/chat-runtime/runtime.ts`
2. Retry orchestration:
   - default target: `next-app/lib/server/ai/ai-service.ts` (+ `utils/retry.ts`)
   - spike target: `next-app/lib/server/chat-runtime/runtime.ts` (or `chat-runtime/retry.ts`)
3. Stream coalescing:
   - default target: provider stream path in `ai-service.ts`
   - spike target: `next-app/lib/server/chat-runtime/events.ts` and stream route pipeline
4. Conversation overlap lock:
   - already implemented in spike path (`conversation-run-lock.ts`); do not re-implement.

Algorithm choices stay identical across both paths; only integration files change.

---

## Unified Implementation Order

### Wave 0: Spike Review Gate (short)

1. Validate spike branch behavior in real UX and regression tests.
2. Confirm locked path: Scenario A.
3. Execute a focused reasoning-visibility review before broader rollout.

Reasoning-visibility review checklist:
1. Verify cross-surface behavior (project copilot + `/ai` page) for start/delta/end reasoning events.
2. Add and validate explicit user control (`off` / `summary` / `full`).
3. Confirm provider behavior:
   - Anthropic reasoning stream path works end-to-end.
   - OpenAI path is handled explicitly (supported summary mode or graceful no-op fallback).
4. Validate truncation/safety UX (clear truncation note, no broken message layout).
5. Verify storage/replay behavior does not regress conversation load/perf.
6. Run test gate (`npx tsc --noEmit`, `npx vitest run`) and capture any reasoning-specific regressions.
7. Record closure evidence for Wave 3 sign-off:
   - toggle screenshots/notes for `off` / `summary` / `full`
   - provider-path notes (Anthropic and OpenAI behavior)
   - basic timing notes (first assistant token, first reasoning token, replay load time)

### Wave 1: Reliability and Loop Guardrails

1. Add `retry.ts` and `error-classification.ts`.
2. Wire retry/error/overflow handling into `ai-service.ts`.
3. Add doom-loop detection.
4. Add transcript repair pass.

### Wave 2: Compaction and Truncation

1. Safety margin + adaptive compaction + oversized fallback.
2. Structured compaction template.
3. Bidirectional tool truncation with tool-mode mapping.

### Wave 3: Streaming Robustness

1. Coalescer integration.
2. Fence/code-span-safe chunk handling.
3. Finalize reasoning visibility shipping criteria from Wave 0 checklist (toggle behavior + provider handling + UX polish).

### Wave 4: Higher-level Improvements

1. Retrieval reranking upgrades (MMR + decay).
2. Internal middleware hooks and cache efficiency metrics.
3. Structured-output contracts (conditional; only if failure telemetry justifies it).

### Wave 5: Next-Phase Planning (Autonomy Expansion)

After Waves 1-4 are complete and stable, create a dedicated follow-on plan for bigger autonomy expansion.

Plan scope must include:
1. Subagent architecture options (spawn model, lifecycle, cancellation, budgets, audit trail).
2. Richer policy layer design (permission rules overlay, approval gates, policy telemetry).
3. Rollout strategy with hard safety guards, evals, and kill switches.
4. Concrete entry criteria for implementation start (stability metrics, reliability thresholds, and ownership).
5. Memory-related autonomy planning handoff to `docs/plans/plan-memory.md` (single source of truth), including evaluation of a conversation-native structured memory lane as a deferred next-phase capability.

---

## Baseline Constants (Adopted from Claude's Better Specificity)

Use these as initial defaults unless validation suggests adjustments:

1. `SAFETY_MARGIN = 1.2` for token-budget checks.
2. `MAX_OVERFLOW_COMPACTION_ATTEMPTS = 3`.
3. `DOOM_LOOP_THRESHOLD = 3` for same `tool + args`.
4. `TOOL_CALL_NAME_MAX_CHARS = 64` + strict name regex validation.
5. Stream coalescing defaults:
   - `STREAM_MIN_CHARS = 800`
   - `STREAM_MAX_CHARS = 1200`
   - `STREAM_IDLE_MS = 1000`
6. Retry defaults:
   - `RETRY_ATTEMPTS = 3`
   - exponential backoff with jitter
   - honor `retry-after-ms` and `retry-after` (seconds/date) when present

---

## Verification Gates (Per Wave)

From `next-app/`:
1. `npx tsc --noEmit`
2. `npx vitest run`

Required targeted tests to add as patterns land:
1. `retry` and `error-classification` unit tests (retry-after seconds/date, overflow detection, retryability).
2. doom-loop and transcript-repair tests (tool-call/result edge cases).
3. compaction tests (safety margin, adaptive ratio, structured summary sections).
4. truncation tests (`head`, `tail`, `both`, per-tool mapping).
5. stream tests (coalescing thresholds, fence-safe chunking correctness).
6. fuzzy-match tests (unicode normalization cases: smart quotes, dashes, NBSP, trailing whitespace variants).

---

## Final Canonical Decision

Steal now:
1. Reliability core (retry/error/overflow + normalization)
2. Doom-loop + transcript repair
3. Compaction hardening + structured summary
4. Bidirectional truncation
5. Reasoning visibility review + ship readiness (Scenario A path)

Steal next:
1. Retrieval reranking algorithms
2. Stream stability primitives
3. Fuzzy matching for text-edit reliability
4. Internal tool middleware and cache metrics

Steal later/conditional:
1. Permission rules overlay
2. Multi-key auth rotation
3. Subagent runtime and advanced runtime infrastructure patterns
4. Structured output contracts (promote only if current flows show typed-output failure pain)
5. Formal autonomy-expansion implementation plan (execute only after Waves 1-4 are complete)

This document is the single source of truth for OpenClaw + OpenCode steals and can replace the per-agent analysis files once approved.
