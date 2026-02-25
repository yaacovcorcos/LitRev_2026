# Implementation Progress Log (Codex)

Date: 2026-02-25  
Branch: `spike-vercel-chat-sdk-adaptation`  
Plan refs: `codex/overall_stealing_process_codex.md`, `overall_stealing_process_claude.md`
Upstream reference basis: cloned repos at `cloned_repos/openclaw_repo/` and `cloned_repos/opencode_repo/` (via the source-file mappings captured in the two plan docs above).

## Phase Tracker

| Wave | Status | Summary |
|---|---|---|
| Wave 0 (Spike Review Gate) | Complete | Scenario A confirmed, branch aligned to runtime/reasoning baseline, reasoning visibility reviewed, quality gates passed (`tsc` + `vitest`) |
| Wave 1 | Complete | Retry/error taxonomy, overflow recovery, doom-loop threshold, transcript repair + safety-margin checks, provider error metadata |
| Wave 2 | Complete | Adaptive compaction, mode-aware truncation (head/tail/both), fence-safe truncation, structured summary prompt upgrades |
| Wave 3 | Complete | Stream coalescing + fence-safe chunk flushing, reasoning visibility mode controls (`off`/`summary`/`full`), provider-aware reasoning policy, fuzzy text-match hardening |
| Wave 4 | Not started | Retrieval/middleware/cache metrics + conditional contracts |
| Wave 5 | Not started | Autonomy expansion planning |

## Wave 0 Actions Completed

1. Confirmed current git context and branch divergence:
   - Current branch: `spike-vercel-chat-sdk-adaptation`
   - Companion branch with runtime/reasoning work: `spike-vercel-chat-sdk-adaptation-clean`
   - Divergence count (`current...clean`): `1` commit on current, `3` commits on clean.

2. Ran required gate commands from `next-app/`:
   - `npx tsc --noEmit` -> PASS
   - `npx vitest run` -> PASS (after clearing temp-space pressure)

3. Resolved environment blocker encountered during Wave 0:
   - Initial `vitest` failure was `ENOSPC` from macOS temp dir.
   - Cleared user-writable temp content under `/var/folders/.../T`, increasing free disk from ~`222Mi` to ~`5.0Gi`.
   - Re-ran `vitest`: all suites passed.

4. Performed reasoning-visibility review against scenario-A baseline (`spike-vercel-chat-sdk-adaptation-clean`):
   - `reasoning_start`/`reasoning_delta`/`reasoning_end` events: present in API route, runtime events, provider emission, context reducers, and `/ai` page stream handling.
   - Cross-surface support: present in project copilot and `/ai` page stream paths.
   - UI rendering/truncation note: present (collapsible reasoning panel + truncation handling).
   - Storage/replay shape: reasoning fields present in timeline/storage types.

5. Aligned current branch to locked Scenario A baseline:
   - Cherry-picked clean-branch commits:
     - `67472ba` `refactor(chat-runtime): add runtime primitives and unit coverage`
     - `c71897e` `feat(chat-runtime): route streams via runtime handlers and add conversation run guard`
     - `53f1e29` `feat(copilot): add streamed reasoning visibility with provider/runtime wiring`
   - Result: `next-app/lib/server/chat-runtime/` and reasoning stream plumbing now exist on current branch.

6. Re-ran quality gates on the post-cherry-pick branch state:
   - `npx tsc --noEmit` -> PASS
   - `npx vitest run` -> PASS (`68` files passed; `636` tests passed, `11` skipped DB smoke tests)

7. Cherry-pick conflict status:
   - No manual conflict resolution was required.
   - Cherry-picks applied cleanly with git auto-merge in touched overlap files (no `CONFLICT` markers, no abort/continue cycle).

## Wave 0 Checklist Status

| Checklist Item | Status | Evidence |
|---|---|---|
| Validate spike behavior in UX/regression tests | Done | `tsc` pass; `vitest` pass after ENOSPC cleanup |
| Confirm locked path Scenario A | Done (plan-level) | Locked in `codex/overall_stealing_process_codex.md` |
| Verify start/delta/end reasoning events across surfaces | Done | Present in route/runtime/context/UI files on current branch after cherry-pick |
| Validate explicit user control (`off/summary/full`) | Done | Implemented in Wave 3 across project copilot + `/ai` page |
| Provider handling (Anthropic + OpenAI explicit path) | Done | Anthropic reasoning enabled for `summary/full`; OpenAI/xAI/Google explicit safe no-op parity path |
| Truncation/safety UX for reasoning | Done (source review) | Truncation handling and note present in reasoning flow |
| Storage/replay non-regression | Partial (manual sign-off pending) | Engineering path is implemented; final manual replay acceptance still required |

## Wave 3 Reasoning Acceptance Criteria (Concrete)

Owner for final manual acceptance: project owner/reviewer (Claude + user), with Codex implementation support.

All items below must be green to close reasoning shipping criteria:

1. Toggle behavior:
   - `off`: no reasoning text rendered; assistant answer still streams normally.
   - `summary`: condensed reasoning shown; no raw full chain text leak.
   - `full`: full reasoning panel visible with collapse/expand behavior.
2. Cross-surface parity:
   - Same semantics on project copilot and `/ai` page.
3. Provider behavior:
   - Anthropic path emits and renders `reasoning_start/delta/end` correctly.
   - OpenAI path is explicit and safe (supported summary mode or graceful no-op with no UI breakage).
4. Layout/scroll stability:
   - No message bubble overflow/regression on mobile/desktop.
   - No broken markdown or panel collapse glitches.
5. Replay/storage:
   - Loading existing conversations with reasoning data renders without exceptions.
   - Reasoning truncation indicator remains visible when previously truncated.
6. Regression gate:
   - `npx tsc --noEmit` and `npx vitest run` pass on final Wave 3 commit.

## Baseline Capture Requirements For Wave 3 Closure

Capture these before final Wave 3 sign-off (manual run is acceptable):

1. One representative conversation replay on project copilot and `/ai` page, with screenshots/notes for:
   - reasoning hidden
   - reasoning summary
   - reasoning full
2. Basic UX timings (recorded in notes):
   - time to first assistant token
   - time to first reasoning token (when enabled)
   - conversation load/replay time for a thread containing reasoning blocks
3. Regression evidence:
   - no console/runtime errors during replay
   - no failed tests in gate commands

## Files Touched In This Wave (by Codex)

1. `codex/overall_stealing_process_codex.md`
   - Locked Scenario A for this implementation.
   - Added reasoning visibility as in-scope with Wave 0 checklist and Wave 3 completion criteria.
2. `codex/implementation_progress_codex.md` (this file)
   - Added phase-by-phase execution log for reviewer handoff.
3. Scenario A branch-alignment commits applied to current branch:
   - `67472ba`
   - `c71897e`
   - `53f1e29`

## Scenario A Commits + File Scope (for Claude review)

### `67472ba` runtime primitives + unit coverage
1. `next-app/lib/server/chat-runtime/events.ts`
2. `next-app/lib/server/chat-runtime/index.ts`
3. `next-app/lib/server/chat-runtime/locks.ts`
4. `next-app/lib/server/chat-runtime/runtime.ts`
5. `next-app/lib/server/chat-runtime/state-adapter.ts`
6. `next-app/lib/server/chat-runtime/thread.ts`
7. `next-app/lib/server/__tests__/chat-runtime-events.test.ts`
8. `next-app/lib/server/__tests__/chat-runtime-locks.test.ts`
9. `next-app/lib/server/__tests__/chat-runtime-runtime.test.ts`
10. `next-app/lib/server/__tests__/chat-runtime-state.test.ts`

### `c71897e` runtime stream routing + run guard
1. `next-app/app/api/ai/stream/route.ts`
2. `next-app/contexts/ProjectCopilotContext.tsx`
3. `next-app/contexts/project-copilot-stream-events.ts`
4. `next-app/contexts/__tests__/project-copilot-stream-events.test.ts`
5. `next-app/lib/artifacts/action-contract.ts`
6. `next-app/lib/server/ai/ai-service.ts`
7. `next-app/lib/server/chat-runtime/conversation-run-lock.ts`
8. `next-app/lib/server/__tests__/conversation-run-lock.test.ts`

### `53f1e29` reasoning visibility wiring
1. `next-app/app/ai/page.tsx`
2. `next-app/app/api/ai/stream/route.ts`
3. `next-app/components/ProjectCopilot.module.css`
4. `next-app/components/copilot/StreamReducer.ts`
5. `next-app/components/copilot/TimelineRenderer.tsx`
6. `next-app/contexts/ProjectCopilotContext.tsx`
7. `next-app/contexts/project-copilot-stream-events.ts`
8. `next-app/contexts/__tests__/project-copilot-stream-events.test.ts`
9. `next-app/lib/projectCopilotStorage.ts`
10. `next-app/lib/server/ai/ai-service.ts`
11. `next-app/lib/server/ai/providers/anthropic.ts`
12. `next-app/lib/server/chat-runtime/events.ts`
13. `next-app/lib/server/__tests__/chat-runtime-events.test.ts`
14. `next-app/types/ai.ts`
15. `next-app/types/timeline.ts`

## High-Signal Files Reviewed During Wave 0

### Plan files reviewed
1. `codex/overall_stealing_process_codex.md`
2. `overall_stealing_process_claude.md`

### Scenario-A reasoning/runtime files reviewed (clean branch)
1. `next-app/app/api/ai/stream/route.ts`
2. `next-app/lib/server/chat-runtime/events.ts`
3. `next-app/lib/server/chat-runtime/runtime.ts`
4. `next-app/lib/server/ai/providers/anthropic.ts`
5. `next-app/lib/server/ai/ai-service.ts`
6. `next-app/contexts/project-copilot-stream-events.ts`
7. `next-app/contexts/ProjectCopilotContext.tsx`
8. `next-app/components/copilot/StreamReducer.ts`
9. `next-app/components/copilot/TimelineRenderer.tsx`
10. `next-app/app/ai/page.tsx`
11. `next-app/lib/projectCopilotStorage.ts`
12. `next-app/types/ai.ts`
13. `next-app/types/timeline.ts`

## Blockers / Risks

1. No blocking technical failures after Wave 0.
2. Remaining risk is product-acceptance only:
   - manual replay/UX validation pass for reasoning modes on mobile/desktop before final product sign-off.

## Wave 1 Actions Completed

1. Added reusable retry utility and Retry-After parsing:
   - `next-app/lib/server/utils/retry.ts` (new)
   - includes `retryAsync`, `sleep`, header/date parsing, jitter/backoff controls.

2. Added typed AI error classification and overflow detection:
   - `next-app/lib/server/ai/error-classification.ts` (new)
   - reason taxonomy: `rate_limit`, `auth`, `billing`, `timeout`, `context_overflow`, `format`, `model_not_found`, `unknown`.

3. Added provider error metadata extraction and propagated metadata through stream error chunks:
   - `next-app/lib/server/ai/providers/error-metadata.ts` (new)
   - updated providers:
     - `next-app/lib/server/ai/providers/openai.ts`
     - `next-app/lib/server/ai/providers/anthropic.ts`
     - `next-app/lib/server/ai/providers/google.ts`
     - `next-app/lib/server/ai/providers/xai.ts`
   - updated stream chunk type:
     - `next-app/types/ai.ts` (`errorStatus`, `errorCode`, `errorHeaders`)

4. Upgraded loop guardrails to true doom-loop detection semantics:
   - `next-app/lib/agent/loop-controller.ts`
   - changed from “any historical repeat” to “consecutive identical call threshold” (`DOOM_LOOP_THRESHOLD=3`).

5. Added transcript repair + safety-margin compaction helpers:
   - `next-app/lib/agent/compaction.ts`
   - new `repairConversationHistory(...)` pass for tool-call/tool-result sanity.
   - added token estimation safety margin helpers and applied them in budget checks.

6. Wired Wave 1 reliability behavior into AI runtime loops:
   - `next-app/lib/server/ai/ai-service.ts`
   - added:
     - retry-backed non-stream `chat(...)`
     - pre-submission transcript repair in tool loops
     - context-overflow recovery path (compact + retry)
     - transient retry path (rate limit/timeout with backoff + Retry-After)
     - stronger cancellation handling inside retry loops

## Wave 1 Tests and Gates

1. Added tests:
   - `next-app/lib/server/__tests__/retry.test.ts` (new)
   - `next-app/lib/server/__tests__/error-classification.test.ts` (new)
   - updated:
     - `next-app/lib/agent/__tests__/loop-controller.test.ts`
     - `next-app/lib/agent/__tests__/compaction.test.ts`

2. Post-implementation quality gate results (after Wave 1 code landed):
   - `npx tsc --noEmit` -> PASS
   - `npx vitest run` -> PASS (`70` files passed; `654` tests passed, `11` skipped DB smoke tests)

## Wave 3 Actions Completed

1. Added stream coalescing primitive for runtime events:
   - `next-app/lib/server/ai/stream-coalescer.ts` (new)
   - coalesces `content` + `reasoning_delta` with min/max/idle flush thresholds.
   - includes fence/code-span safe split behavior with hard-cap fallback.

2. Integrated coalescer into API streaming route:
   - `next-app/app/api/ai/stream/route.ts`
   - normalized runtime events now route through coalescer before dispatch.
   - explicit flush on finalize/error path.

3. Added fuzzy matching primitives and integrated into text-edit tool path:
   - `next-app/lib/agent/fuzzy-match.ts` (new)
   - updated `next-app/lib/server/ai/tools/update-criteria.ts`
   - remove flow now retries with fuzzy matching if strict match fails (unicode and whitespace resilient).

4. Added reasoning-visibility mode contract and persistence helpers:
   - `next-app/lib/ai/reasoning-visibility.ts` (new)
   - updated `next-app/types/ai.ts` to include `ReasoningMode` + `ChatOptions.reasoningMode`.
   - supports `off` / `summary` / `full` UI policy + storage helpers.

5. Added provider-aware reasoning policy in AI service:
   - `next-app/lib/server/ai/ai-service.ts`
   - Anthropic requests provider-native reasoning for `summary`/`full`.
   - OpenAI/xAI/Google paths explicitly no-op for provider reasoning request (safe parity behavior).

6. Wired reasoning mode controls across both UI surfaces:
   - project copilot:
     - `next-app/components/ProjectCopilot.tsx`
     - `next-app/components/ProjectCopilot.module.css`
     - `next-app/contexts/ProjectCopilotContext.tsx`
   - `/ai` page:
     - `next-app/app/ai/page.tsx`
     - `next-app/app/ai/ai-view.module.css`
   - timeline rendering:
     - `next-app/components/copilot/TimelineRenderer.tsx`
     - mode semantics:
       - `off`: no reasoning panel
       - `summary`: condensed preview with local expand/collapse
       - `full`: full reasoning panel behavior

7. Preserved reasoning stream-state correctness:
   - updated `next-app/contexts/project-copilot-stream-events.ts`
   - keeps full reasoning accumulation with cap helper; rendering mode controls visibility, not core stream integrity.

## Wave 3 Tests and Gates

1. Added/updated tests:
   - `next-app/lib/server/__tests__/stream-coalescer.test.ts` (new)
   - `next-app/lib/agent/__tests__/fuzzy-match.test.ts` (new)
   - `next-app/lib/server/__tests__/reasoning-visibility.test.ts` (new)
   - `next-app/components/copilot/__tests__/TimelineRenderer.reasoning-mode.test.tsx` (new)
   - updated `next-app/lib/server/__tests__/update-criteria-tool.test.ts`
   - updated `next-app/components/__tests__/ProjectCopilot.test.tsx`

2. Post-Wave-3 gate results:
   - `npx tsc --noEmit` -> PASS
   - `npx vitest run` -> PASS (`76` files passed; `695` tests passed, `11` skipped DB smoke tests)
   - post-commit reproducibility note:
     - on this machine, default macOS `TMPDIR` intermittently hit `ENOSPC` during vitest temp bundling.
     - verified clean pass using:
       - `TMPDIR=/Users/yaacovcorcos/LitRev_2026/next-app/.tmp-vitest npx vitest run`
     - result remained PASS (`76` files, `695` passed, `11` skipped), confirming no code-level regression.

## Wave 3 Acceptance/Documentation Notes

1. Closure status:
   - Engineering implementation + automated gates are complete for Wave 3.
   - Reasoning controls are now explicit (`off` / `summary` / `full`) and cross-surface.

2. Manual product sign-off items (still required for final UX acceptance):
   - one replay pass on project copilot and `/ai` page for all three reasoning modes.
   - confirm mobile/desktop layout, scroll stability, and no runtime console errors.
   - capture reviewer notes/screenshots referenced by the Wave 0 acceptance checklist.

## Wave 3 Review Follow-up (Claude Feedback)

1. Stream coalescer stop correctness tightened:
   - updated `next-app/lib/server/ai/stream-coalescer.ts`:
     - `stop()` is now async and awaits internal queue drain.
   - updated `next-app/app/api/ai/stream/route.ts`:
     - finalize path now `await coalescer.stop()` before `controller.close()`.

2. Stream coalescer coverage expanded for type-switch flush behavior:
   - updated `next-app/lib/server/__tests__/stream-coalescer.test.ts`
   - added explicit test proving buffered `content` flushes before buffering `reasoning_delta` when kind changes.

3. Fuzzy remove-path case asymmetry fixed:
   - updated `next-app/lib/server/ai/tools/update-criteria.ts`
   - fuzzy fallback now compares lowercased candidates and lowercased needle.
   - updated `next-app/lib/server/__tests__/update-criteria-tool.test.ts`
   - added case-insensitive fuzzy remove regression test.

4. Hydration-flash mitigation for reasoning mode preference:
   - updated:
     - `next-app/contexts/ProjectCopilotContext.tsx`
     - `next-app/app/ai/page.tsx`
   - reasoning mode now lazily initializes from `getReasoningModePreference()` in `useState`, removing mount-time default-to-full flash before localStorage preference loads.

5. Shared reasoning dropdown extracted (duplication reduction):
   - added:
     - `next-app/components/copilot/ReasoningModeDropdown.tsx`
     - `next-app/components/copilot/ReasoningModeDropdown.module.css`
   - updated usage:
     - `next-app/components/ProjectCopilot.tsx`
     - `next-app/app/ai/page.tsx`
   - removed duplicated dropdown menu CSS blocks from:
     - `next-app/components/ProjectCopilot.module.css`
     - `next-app/app/ai/ai-view.module.css`

6. Post-follow-up gate results:
   - `npx tsc --noEmit` -> PASS
   - `TMPDIR=/Users/yaacovcorcos/LitRev_2026/next-app/.tmp-vitest npx vitest run` -> PASS (`76` files passed; `697` tests passed, `11` skipped DB smoke tests)

## Recommended Next Step

1. Start Wave 4 (retrieval reranking upgrades, internal middleware hooks, cache efficiency metrics).
2. After Wave 4 stabilizes, execute Wave 5 autonomy-expansion planning (subagents + richer policy layers) as a dedicated follow-on plan.

## Wave 1 Review Follow-up (Claude Feedback Resolution)

1. Provider normalization (Tier 1 item 1.5) is now explicitly shipped as a provider preflight:
   - `next-app/lib/server/ai/providers/message-normalization.ts` (new)
   - wired into:
     - `next-app/lib/server/ai/providers/openai.ts`
     - `next-app/lib/server/ai/providers/anthropic.ts`
     - `next-app/lib/server/ai/providers/google.ts`
     - `next-app/lib/server/ai/providers/xai.ts`
   - scope covered:
     - tool-call ID sanitization/consistency
     - tool-call name validation/malformed-call dropping
     - role/order guardrails for tool-call/tool-result pairing
     - orphan/duplicate tool-result dropping
     - synthetic tool-result insertion when required to keep valid sequence
   - clarification:
     - this closes Tier 1.5 ("OpenAI-today minimal guards"): ID consistency, sequence sanity, malformed-request prevention.
     - provider-specific content normalization (for example empty-content filtering/unsupported-modality fallbacks for non-OpenAI providers) remains intentionally deferred to the multi-provider phase.

2. Header normalization deduplicated into shared utility:
   - `next-app/lib/server/utils/header-record.ts` (new)
   - adopted by:
     - `next-app/lib/server/utils/retry.ts`
     - `next-app/lib/server/ai/error-classification.ts`
     - `next-app/lib/server/ai/providers/error-metadata.ts`

3. Stream-chunk error classification now classifies the full chunk directly (no reconstructed object):
   - updated `next-app/lib/server/ai/ai-service.ts`.

4. Added origin note for the 400/413 `"(no body)"` overflow pattern:
   - documented in `next-app/lib/server/ai/error-classification.ts`.

5. Added explicit comment clarifying safety-margin intent at pre-call budget checks:
   - documented in `next-app/lib/server/ai/ai-service.ts`.

6. Added normalization tests:
   - `next-app/lib/server/__tests__/provider-message-normalization.test.ts` (new)

7. Post-follow-up gates:
   - `npx tsc --noEmit` -> PASS
   - `npx vitest run` -> PASS (`71` files passed; `657` tests passed, `11` skipped DB smoke tests)

## Wave 2 Actions Completed

1. Added dedicated truncation primitives:
   - `next-app/lib/agent/truncation.ts` (new)
   - includes:
     - mode-aware truncation (`head` / `tail` / `both`)
     - tool-mode mapping (`TOOL_TRUNCATION_MODES`)
     - line/byte-aware limits
     - markdown fence-safe truncation behavior

2. Integrated mode-aware truncation into tool-result compaction:
   - updated `next-app/lib/agent/compaction.ts`:
     - `compactToolResult(...)` fallback now uses `truncateToolOutput(...)`
     - replaced fixed head-only fallback with per-tool behavior

3. Added adaptive compaction behavior:
   - updated `next-app/lib/agent/compaction.ts`:
     - `computeAdaptiveChunkRatio(...)`
     - `isOversizedForSummary(...)`
     - dynamic keep-count in `compactLoopMessages(...)` based on adaptive ratio
     - oversized-message normalization for cross-turn compaction
     - prune thresholds/constants (`PRUNE_MINIMUM`, `PRUNE_PROTECT`)
     - protected-tail budget trim behavior

4. Upgraded compaction summary instructions:
   - updated `COMPACTION_SUMMARY_PROMPT` in `next-app/lib/agent/compaction.ts`
   - now enforces structured sections:
     - Goal
     - Protocol State
     - Key Findings
     - Completed Actions
     - Active Context
   - while preserving JSON output contract used by `autoSummarizeIfNeeded`.

## Wave 2 Tests and Gates

1. Added truncation tests:
   - `next-app/lib/agent/__tests__/truncation.test.ts` (new)
   - coverage:
     - `head`/`tail`/`both`
     - line-budget behavior
     - tool-mode mapping behavior
     - fence close/reopen safeguards

2. Expanded compaction tests:
   - updated `next-app/lib/agent/__tests__/compaction.test.ts`
   - coverage:
     - adaptive ratio shrink behavior
     - oversized detection behavior
     - prune-threshold behavior
     - oversized-message placeholder behavior
     - structured prompt section presence

3. Post-Wave-2 gate results:
   - `npx tsc --noEmit` -> PASS
   - `npx vitest run` -> PASS (`72` files passed; `672` tests passed, `11` skipped DB smoke tests)

## Wave 2 Review Follow-up (Claude Feedback Resolution)

1. Added adaptive keep-count coverage for `compactLoopMessages(...)`:
   - updated `next-app/lib/agent/__tests__/compaction.test.ts`
   - verifies dynamic keep-count (> old fixed 2) with many small tool iterations.

2. Added fence/both-mode truncation coverage:
   - updated `next-app/lib/agent/__tests__/truncation.test.ts`
   - verifies complex both-mode fence handling path.

3. Added multibyte byte-budget coverage:
   - updated `next-app/lib/agent/__tests__/truncation.test.ts`
   - verifies byte-aware truncation behaves correctly with non-ASCII content.

4. Clarified small-budget compaction threshold intent:
   - updated comment in `next-app/lib/agent/compaction.ts` for
     `compactionThreshold = Math.min(budget, PRUNE_MINIMUM)`.

5. Improved fence reopening fidelity:
   - updated `next-app/lib/agent/truncation.ts`
   - reopening fences now preserve opening fence info string (for example language tags like `python`).

6. Post-follow-up gates:
   - `npx tsc --noEmit` -> PASS
   - `npx vitest run` -> PASS (`72` files passed; `675` tests passed, `11` skipped DB smoke tests)
