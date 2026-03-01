# Chatbot UX Deep Audit Report

**Date:** 2026-02-27
**Scope:** All chat surfaces — Copilot Panel, /ai Page, PopupChat, ConversationMainView
**Methodology:** Full code audit + comparison with OpenClaw and OpenCode open-source patterns

---

## Executive Summary

The chat UX has a solid foundation — the scroll system is well-designed, streaming uses a proper generation-counter guard against race conditions, and there's good separation between surfaces. However, there are **systemic issues** causing the "things break and aren't smooth" feeling:

1. **A mega-context (40+ fields) that re-renders everything on any state change**
2. **No client-side throttling of stream updates** — every coalesced chunk triggers a full React reconciliation
3. **Three inconsistent chat surfaces** with different capabilities, error handling, and interaction patterns
4. **Silent failures everywhere** — most errors are swallowed to `console.error` with no user feedback
5. **Missing progressive rendering** — long conversations render all messages to the DOM at once

The good news: the hardest problems (scroll stability, race condition guards, stream parsing) are already solved well. The remaining issues are all fixable without architectural rewrites.

**Update (post-Codex cross-audit):** Codex correctly identified two issues I missed: dead copilot state in the draft page and `window.prompt` for conversation rename. I've added these as Issues #13 and #14. I disagree with Codex's framing that runtime unification alone solves the smoothness problem — the React-specific performance issues (mega-context re-renders, no client-side throttling) are the primary jank source and would persist even after unification. See [codex-feedback-claude.md](codex-feedback-claude.md) for the full cross-audit.

---

## Architecture Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    ProjectCopilotProvider                       │
│  (~1600 lines, 40+ context values, single useMemo)             │
│                                                                 │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ Copilot Panel│  │ ConversationMain │  │    PopupChat     │  │
│  │  (sidebar)   │  │   (full-page)    │  │   (mini-dialog)  │  │
│  │              │  │                  │  │                  │  │
│  │ Shares ctx   │  │ Shares ctx       │  │ Own local state  │  │
│  │ CopilotInput │  │ CopilotInputCore │  │ Own fetch/abort  │  │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬─────────┘  │
│         │                   │                     │             │
│         └─────────┬─────────┘                     │             │
│                   ▼                               ▼             │
│           runStream()                      Own fetch()          │
│           processAIStream()                parseNDJSONStream()  │
│           handleProjectCopilotStreamChunk  inline chunk handler │
│                   │                               │             │
│                   ▼                               ▼             │
│           TimelineRenderer                 Simple markdown list │
│           (messages → timeline → render)   (ReactMarkdown)     │
│                   │                                             │
│                   ▼                                             │
│           useStableChatScroll                                   │
│           (rAF, ResizeObserver, pin/unpin)                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Issue #1: Mega-Context Causes Unnecessary Re-renders

**Severity: HIGH — Primary source of UI jank**

### What's happening

`ProjectCopilotContext` exposes **40+ values** through a single `useMemo`. Any state change (e.g., toggling `showAutonomySettings`, updating `pendingChoices`, flipping `isSummarizing`) creates a new context object, which forces **every consumer** to re-render.

During streaming, this means every content chunk triggers:
1. `updateMessages()` → new `state` → new context value
2. Every component using `useProjectCopilot()` re-renders
3. `TimelineRenderer` re-renders (even though it's the only one that needs the new messages)
4. The entire message list re-diffs

The `memo()` on `UserMessageRow` and `AssistantMessageRow` provides some protection, but the parent (`TimelineRenderer`) still runs its full render logic every chunk.

### What OpenCode does better

OpenCode uses SolidJS stores with fine-grained reactivity — only the specific message part that changed triggers a DOM update. In React-land, the equivalent is **context splitting**: separate contexts for separate concerns.

### Recommendation

Split the mega-context into 3-4 focused contexts:

```
ChatMessagesContext    → messages, isLoading, sendMessage, cancelStream
ConversationContext    → conversations, currentConversationId, select/create/delete
ChatSettingsContext    → reasoningMode, autonomyPreset, panelWidth, collapsed
ChatAttachmentsContext → pendingAttachment, isAttaching, attach/clear
```

This way, a streaming content chunk only re-renders `ChatMessagesContext` consumers. Toggling autonomy settings doesn't touch the message renderer. Conversation list updates don't cause timeline re-renders.

**Impact: Major reduction in re-renders during streaming. Most noticeable on longer conversations.**

---

## Issue #2: No Client-Side Throttling of Stream Updates

**Severity: HIGH — Causes jank during fast streaming**

### What's happening

The server-side `StreamCoalescer` batches chunks (800-1200 chars, 1s idle flush), but once a coalesced chunk arrives at the client, every single one triggers:

1. `setState` on the messages array
2. Full React reconciliation of the timeline
3. `ResizeObserver` fires → scroll update scheduled

With fast model output, this can be 5-10 state updates per second, each causing a full reconciliation pass over all visible messages.

### What the open-source repos do

- **OpenClaw**: 80ms `setTimeout` debounce on tool stream updates. Only "result" events force immediate sync.
- **OpenCode**: SolidJS batches synchronous updates automatically. Their `ResizeObserver` fires after layout/before paint, catching content in the same frame.

### Recommendation

Add a client-side accumulation buffer with `requestAnimationFrame` gating:

```typescript
// Accumulate chunks, flush once per animation frame
const pendingChunksRef = useRef<AIStreamChunk[]>([]);
const rafIdRef = useRef<number | null>(null);

function onChunk(chunk: AIStreamChunk) {
    pendingChunksRef.current.push(chunk);
    if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
            const batch = pendingChunksRef.current;
            pendingChunksRef.current = [];
            rafIdRef.current = null;
            // Process all accumulated chunks in one state update
            processBatch(batch);
        });
    }
}
```

This ensures at most one React reconciliation per frame (~60fps = ~16ms intervals), regardless of how fast chunks arrive.

**Impact: Eliminates frame drops during fast streaming. Especially noticeable with reasoning + content arriving simultaneously.**

---

## Issue #3: PopupChat is a Second-Class Citizen

**Severity: MEDIUM — Inconsistent behavior confuses users**

### Feature gap table

| Feature | Copilot Panel | PopupChat | Gap Impact |
|---------|:---:|:---:|---|
| Type during streaming | Yes ("Keep typing...") | **No** (textarea disabled) | Frustrating for follow-ups |
| Auto-resize textarea | Yes (JS-driven, max 200px) | **No** (CSS max-height only) | Multi-line input scrolls instead of expanding |
| Voice input | Yes | **No** | Missing feature |
| Message persistence | Server DB | **Local state only** | Messages lost on close |
| Streaming cursor | Yes (◎) | Yes (◎) | OK |
| Abort/cancel | Yes (stop button) | **No explicit button** | Can't cancel runaway responses |
| Generation counter guard | Yes (`streamGenRef`) | **No** | Stale stream writes possible |
| Auto-scroll | `useStableChatScroll` | `useStableChatScroll` | OK |
| Drag position | N/A | Resets on context change | Position lost, jarring jump |

### Recommendation

1. **Enable typing during streaming** — remove `disabled={isStreaming}` on the textarea
2. **Add JS auto-resize** — port the same `useEffect` pattern from `CopilotInputCore`
3. **Add a stop button** — show it when `isStreaming && !input.trim()`
4. **Add generation counter** — prevent stale stream writes (same pattern as main context)
5. **Preserve drag position** across context changes — store in a ref that survives the context reset effect

---

## Issue #4: Silent Failures Everywhere

**Severity: MEDIUM — Users think the app is broken when it's actually erroring silently**

### Catalog of silent failures

| Operation | Error Handling | User Sees |
|---|---|---|
| `selectConversation()` fails | `console.error` | Empty chat or stale data |
| `loadConversations()` fails | `console.error` | Stale conversation list |
| `deleteConversation()` fails | `console.error` | Nothing (conversation may reappear on refresh) |
| `branchConversation()` fails | `console.error` | Nothing |
| `renameConversation()` fails | `console.error` | Name reverts silently |
| "Save to Notes" fails | Swallowed entirely | Nothing (user thinks it saved) |
| "Continue in Copilot" fails | `console.error` | Nothing (popup stays, copilot doesn't open) |
| Artifact batch approve fails midway | Partial rollback | Confusing mixed state |
| `loadConversations` after stream | Fire-and-forget | Stale titles/counts |

### What OpenCode does

On error: **toast notification** + **optimistic message rollback** + **input text restoration** (user doesn't lose their typed message).

### Recommendation

1. **Add a lightweight toast system** (plan-ui-ux.md already has "Global toast system migration (Sonner)" in the parking lot — promote it to P1)
2. **Every user-facing action should show a toast on failure** with a human-readable message
3. **Restore input text on send failure** — if `sendMessage` fails, put the text back in the textarea
4. **Add retry affordance** on conversation load failure — show an inline error with "Retry" button instead of empty state

---

## Issue #5: No Progressive Rendering for Long Conversations

**Severity: MEDIUM — Performance degrades as conversations grow**

### What's happening

When a conversation loads, the initial 50 messages are all rendered to the DOM immediately. As the user clicks "Load older messages," the DOM grows unboundedly. Each message includes:
- Full markdown parsing (ReactMarkdown + remark-gfm)
- Mentioned studies extraction + chip rendering
- Potential artifact cards with their own complex rendering

A conversation with 100+ messages (some with artifact cards) could have 500+ DOM nodes just in the timeline.

### What OpenCode does

**Progressive turn-based rendering:**
1. Initially render only the last 20 user turns
2. Use `requestIdleCallback` to backfill older turns without blocking interaction
3. Compensate scroll position after inserting content above the viewport
4. Explicit "Render earlier" / "Load earlier" buttons for user control

### Recommendation

Implement a simpler version of OpenCode's pattern:

1. **Render window**: Only render the last 30 messages initially
2. **Intersection Observer at the top**: When user scrolls near the top, render the next batch
3. **Skeleton placeholders** above the render window so scrollbar size is approximately correct
4. Consider a **markdown rendering cache** for completed (non-streaming) messages — OpenClaw's LRU cache pattern (200 entries, skip parsing at 40k chars) is pragmatic

**Impact: Consistent render performance regardless of conversation length.**

---

## Issue #6: `Date.now()`-Based ID Collisions

**Severity: LOW but causes real bugs under load**

### What's happening

Multiple places generate IDs with `Date.now()`:
- User message: `m-${Date.now()}`
- AI message: `m-${Date.now() + 1}`
- Artifacts: `art-${Date.now()}`
- Progress items: `progress-${Date.now()}`

If two artifacts arrive in the same millisecond, or if `Date.now()` happens to return the same value for the user and AI message IDs across a tight loop, IDs collide. This can cause React key conflicts, message deduplication issues, or artifacts overwriting each other in the Map.

### Recommendation

Use a monotonic counter or `crypto.randomUUID()`:

```typescript
let _id = 0;
export const nextId = (prefix: string) => `${prefix}-${Date.now()}-${++_id}`;
```

Or simply `crypto.randomUUID()` which is available in all modern browsers.

**Impact: Eliminates a class of rare but confusing bugs.**

---

## Issue #7: Mode Pill Causes Layout Shift

**Severity: LOW — Visible jank on every first keystroke**

### What's happening

When the user starts typing, a mode indicator pill conditionally renders above the textarea. Since it's inside a flex-column layout, the pill pushes the textarea down, causing a visible jump on the first character typed.

### Recommendation

Two options:
1. **Reserve space**: Always render the pill container with `min-height`, just hide the content with `visibility: hidden` / `opacity: 0`
2. **Absolute position**: Position the pill above the input using `position: absolute` with negative top offset so it doesn't affect layout flow

Option 1 is simpler and avoids overlap issues.

---

## Issue #8: Copilot Panel Hidden on Mobile

**Severity: MEDIUM — Entire AI feature unavailable on tablets**

### What's happening

```css
@media (max-width: 900px) {
    .copilot, .expandRailRight { display: none; }
}
```

The copilot panel is simply `display: none` below 900px. Users on iPads or small laptops lose access to the AI assistant entirely when viewing project pages.

### Recommendation

Two approaches (not mutually exclusive):
1. **Bottom sheet on mobile**: Transform the side panel into a bottom sheet / drawer that slides up from the bottom (common mobile chat pattern)
2. **Route to /ai page**: Add a floating action button on mobile that routes to the full-page `/ai` view with the current project context

The plan-ui-ux.md already has "Mobile sidebar slide-in drawer" in the parking lot. Consider promoting it given that AI is a core feature.

---

## Issue #9: Dual State for Artifacts Creates Sync Risk

**Severity: MEDIUM — Consistency bugs waiting to happen**

### What's happening

Artifact data lives in TWO places simultaneously:
1. `state.messages[]` array (as `CopilotMessage` with an `artifact` field)
2. `artifacts` Map (as `ArtifactData`)

Every mutation (review, plan step update, status change) must update BOTH in sync. There are 5+ places in the code that do this dual-update pattern. If any path forgets to update one store, the timeline shows stale data while the artifact card shows current data (or vice versa).

### What the open-source repos do

Both OpenClaw and OpenCode use a **single source of truth** for message content. Artifacts/tool results are stored once and referenced by ID.

### Recommendation

Make the `artifacts` Map the single source of truth. In the timeline, artifact entries should contain only `{ artifactId: string }` and look up the full data from the map at render time:

```typescript
// In TimelineRenderer, for artifact items:
const artifactData = artifacts.get(item.artifactId);
if (!artifactData) return <ArtifactSkeleton />;
return <ArtifactCard data={artifactData} />;
```

This eliminates the dual-update requirement entirely.

---

## Issue #10: `pendingAttachment` Survives Conversation Switch

**Severity: LOW — Causes wrong-context sends**

### What's happening

When `selectConversation()` runs, it resets: `isLoading`, `currentRunId`, `pendingChoices`, messages, artifacts. But `pendingAttachment` and `isAttaching` are **NOT** reset.

If a user uploads a PDF, then switches to a different conversation, the attachment badge persists and could be sent in the wrong conversation context.

### Recommendation

Add `setPendingAttachment(null)` and `setIsAttaching(false)` to the `selectConversation` reset block.

---

## Issue #11: Missing Keyboard Accessibility for Chat Actions

**Severity: LOW — Accessibility gap**

### What's happening

Copy/save/insert/branch action buttons on messages only appear on `:hover`:

```css
.chatStack:hover .chatActions { opacity: 1; }
```

There's no keyboard-accessible path to reach these actions.

### Recommendation

Add `:focus-within` alongside `:hover`:

```css
.chatStack:hover .chatActions,
.chatStack:focus-within .chatActions { opacity: 1; }
```

---

## Issue #12: "Approve All" Auto-Dismiss Too Fast

**Severity: LOW — Accessibility concern**

The approval summary bar auto-dismisses after 1.5 seconds. For slow readers or users with cognitive disabilities, this is too fast.

### Recommendation

Increase to 4-5 seconds, or make it dismissible manually with no auto-dismiss. Follow WCAG 2.1 SC 2.2.1.

---

## Issue #13: Dead Copilot State in Draft Page (from Codex audit)

**Severity: LOW — Maintenance risk and confusion**

### What's happening

`app/project/[id]/draft/page.tsx` contains legacy local copilot state that is completely disconnected from the UI:
- `copilotInput` state (declared, never used in JSX)
- `copilotListRef` and `copilotAutoScrollRef` refs (declared, never wired)
- `handleCopilotSend` function (~30 lines, never called)
- `buildCopilotResponse` helper (mock AI responses, only called by the unused `handleCopilotSend`)
- `copilotMessages` constant (extracted from state, never referenced)
- Auto-scroll effects for the unused refs

The actual copilot UI is provided by the `<ProjectCopilot>` component which uses the centralized `ProjectCopilotContext`. This dead code is from an earlier iteration.

### Recommendation

Delete all of it. It increases maintenance cost and creates confusion about which copilot system is active.

---

## Issue #14: `window.prompt` for Conversation Rename (from Codex audit)

**Severity: LOW — Breaks interaction flow**

### What's happening

`ConversationPicker.tsx` line 212 uses `window.prompt()` for rename:

```typescript
const name = window.prompt("Rename conversation", conv?.title ?? "");
```

This is a native browser dialog that:
- Cannot be styled
- Blocks the JavaScript thread
- Looks jarring compared to the rest of the glassmorphism UI
- Doesn't work well on mobile

### Recommendation

Replace with an inline editable text field in the conversation list item, or a small Radix `Dialog` / `Popover` with a controlled input. The inline approach is smoother (click title to edit, Enter to confirm, Escape to cancel).

---

## Comparison Summary: LitRev vs. Open Source

| Concern | LitRev Current | OpenClaw | OpenCode | Verdict |
|---------|---------------|----------|----------|---------|
| **Stream parsing** | NDJSON async generator, silent malformed-line skip | WebSocket + JSON RPC | SDK event listener + reducer | LitRev OK; add logging for skipped lines |
| **Stream throttling** | Server-side coalescer only | 80ms client debounce on tool streams | SolidJS auto-batching | **Gap**: need client-side rAF gating |
| **Scroll auto-follow** | ResizeObserver + rAF + 24px threshold | rAF + 450px threshold + retry scroll | ResizeObserver + wheel-only break + nested scrollable detection | LitRev is good; steal **nested scrollable detection** from OpenCode |
| **Scroll prepend** | capturePrependAnchor / restorePrependAnchor | N/A (no pagination) | rAF scroll compensation after backfill | LitRev is solid here |
| **Error recovery** | Error appended as chat message, no input restore | Error as chat message + banner | Toast + rollback + input restore | **Gap**: need input restore + toasts |
| **State management** | Single mega-context (40+ values) | Mutable Lit host properties | SolidJS stores + produce/reconcile | **Gap**: need context splitting |
| **Message rendering** | No virtualization, full markdown every render | 200-message cap + LRU markdown cache | 20-turn initial render + idle backfill | **Gap**: need progressive rendering |
| **Message queuing** | sendLockRef blocks double-sends | Explicit queue with UI display | Blocked when busy | LitRev adequate; queue is nice-to-have |
| **Reconnection/retry** | None (single fetch per message) | WebSocket reconnect with exponential backoff | Retry with backoff + Retry-After headers | **Gap**: no retry on transient failures |
| **ID generation** | `Date.now()` based | `Date.now()` + server-assigned | Server-assigned + crypto IDs | **Gap**: need collision-safe IDs |

---

## Prioritized Recommendation Summary (Updated Post-Codex Cross-Audit)

### Phase 0: Quick Wins (1-2 days, all trivial)

| # | Issue | Source |
|---|-------|--------|
| 1 | Clear `pendingAttachment` on conversation switch | Claude |
| 2 | Replace `Date.now()` IDs with `crypto.randomUUID()` | Claude |
| 3 | Delete dead draft page copilot code | Codex |
| 4 | Replace `window.prompt` rename with inline edit | Codex |
| 5 | Reserve space for mode pill (eliminate layout shift) | Claude |
| 6 | Add `:focus-within` for chat action buttons | Claude |
| 7 | Increase approve-all auto-dismiss to 4-5s | Claude |

### Phase 1: Fix the Jank (the part Codex missed)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 8 | Add client-side rAF chunk batching in `runStream` | Small | High — eliminates streaming jank |
| 9 | Split mega-context into 3-4 focused contexts | Medium | High — major re-render reduction |
| 10 | Make artifacts Map the single source of truth | Medium | Medium — eliminates sync bugs |

### Phase 2: Unify Runtime (the part Codex got right)

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 11 | Extract shared `useChatRuntime` hook from context | Medium | High — single behavior source |
| 12 | Migrate /ai page to shared runtime behind flag | Medium | High — eliminates /ai drift |
| 13 | Migrate PopupChat to shared runtime behind flag | Medium | Medium — eliminates popup drift |
| 14 | Normalize stream event contract at API boundary | Small | Medium — strict schema |

### Phase 3: User-Facing Reliability

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 15 | Add toast system (Sonner) + surface all silent errors | Medium | High — users stop thinking app is "broken" |
| 16 | Fix PopupChat parity (typing during stream, auto-resize, stop) | Small | Medium — consistent experience |
| 17 | Input text restoration on send failure | Small | Low — nice UX polish |
| 18 | Progressive rendering (render last 30, backfill on scroll) | Medium | Medium — consistent perf |

### Phase 4: Consider Later

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 19 | Mobile copilot (bottom sheet or route to /ai) | Large | Medium — depends on mobile user base |
| 20 | Markdown rendering cache (LRU, bypass at 40k chars) | Medium | Low unless convos get very long |
| 21 | Nested scrollable detection (`data-scrollable`) | Small | Low — prevents scroll break in code blocks |
| 22 | Resumable runs + idempotency keys (if metrics justify) | Large | Medium — premature without telemetry |
| 23 | Telemetry instrumentation (time_to_first_token, etc.) | Medium | Low — no pipeline exists yet |

---

## Files Referenced

- [ProjectCopilotContext.tsx](next-app/contexts/ProjectCopilotContext.tsx) — mega-context, ~1600 lines
- [project-copilot-stream-events.ts](next-app/contexts/project-copilot-stream-events.ts) — stream chunk handler, 303 lines
- [stream-processor.ts](next-app/lib/ai/stream-processor.ts) — shared stream processor
- [stream-parser.ts](next-app/lib/ai/stream-parser.ts) — NDJSON parser
- [TimelineRenderer.tsx](next-app/components/copilot/TimelineRenderer.tsx) — message rendering, ~1200 lines
- [CopilotInputCore.tsx](next-app/components/copilot/CopilotInputCore.tsx) — input component, ~735 lines
- [PopupChat.tsx](next-app/components/PopupChat.tsx) — mini-chat, ~508 lines
- [useStableChatScroll.ts](next-app/hooks/useStableChatScroll.ts) — scroll management, 140 lines
- [ProjectCopilot.module.css](next-app/components/ProjectCopilot.module.css) — styles, ~2100 lines
- [plan-ui-ux.md](docs/plans/plan-ui-ux.md) — existing UI/UX plan
