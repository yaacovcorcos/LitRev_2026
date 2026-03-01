# LitRev 2026 — Final Codebase Audit Report

**Date:** 2026-03-01
**Auditors:** Two independent Claude agents (cross-verified)
**Scope:** Full-stack — architecture, reliability, security, performance, UX, code quality, AI agent system
**Codebase:** Next.js 16 / React 19 / Prisma 7.3 / PostgreSQL / OpenAI GPT-5.2 / Vercel serverless

---

## Executive Summary

**Overall Grade: B**

The codebase has solid foundations: a clean action → service → Prisma layering convention, a well-designed CSS token system, comprehensive dark mode, accessible UI primitives, and a thoughtful event-sourced agent architecture. However, critical gaps in **concurrency safety**, **input validation**, and **security hardening** create real production risk. Two god-objects (ai-service.ts and ai/page.tsx, both ~2,050 lines) are the main architectural drag. The AI agent layer has clever patterns (idempotency middleware, doom-loop detection, artifact snapshots) but each one has an implementation flaw that undermines its purpose.

The grade is held back from B+ by **missing input validation on all server actions** and an **unguarded 100MB body size limit** — basic security hygiene that should be in place for any production deployment.

---

## I. CRITICAL — Production Risk (Fix Immediately)

### C1. In-Memory Locks Useless in Serverless

**File:** `app/actions/extraction.ts:33-35`

```typescript
const EXTRACTION_LOCKS = new Set<string>();
```

A module-scoped `Set` used to prevent duplicate PDF extractions. On Vercel, each invocation may get a fresh process — the lock provides zero cross-instance protection. The code itself has a TODO acknowledging this. Two concurrent extraction requests for the same study will race, wasting AI API credits and potentially producing conflicting results.

**Fix:** Add a `processing_status` column to the Study model (`idle | extracting | analyzing`). Check-and-set atomically with `prisma.study.update({ where: { id, processingStatus: "idle" }, data: { processingStatus: "extracting" } })`. On completion or error, reset to `idle`. This also gives the UI a way to show extraction progress.

---

### C2. Race Condition in Study Upsert (Check-Then-Act)

**File:** `lib/server/ledger.ts:151-191`

```typescript
const existing = await prisma.study.findFirst({ where: { id: normalized.id, projectId } });
if (existing) { await prisma.study.update(...); }
else { await prisma.study.create(...); }
```

Three independent DB calls with no transaction. Between `findFirst` and `create`, another request can insert the same study, causing a unique constraint violation or duplicate row.

**Fix:** Replace with `prisma.study.upsert({ where: { id_projectId: ... }, create: {...}, update: {...} })`. If a natural composite unique doesn't exist, add one and use a serializable transaction.

---

### C3. Empty Study List Silently Purges All Studies

**File:** `lib/server/ledger.ts:207-211`

```typescript
if (incomingIds.length === 0) {
    await tx.study.updateMany({
        where: { projectId, deletedAt: null },
        data: { deletedAt: new Date() },
    });
}
```

`replaceStudies()` treats an empty incoming list as "soft-delete everything." While this is inside a transaction (good), a bug in any caller that passes an empty array will silently wipe the project's entire study ledger. The function is the sync primitive — it needs a safety net.

**Fix:** Add a `force` parameter. Without `force: true`, reject empty lists: `if (normalized.length === 0 && !opts?.force) throw new Error("Refusing to sync empty study list without force flag")`.

---

### C4. In-Memory Idempotency Cache Lost on Cold Start

**File:** `lib/server/ai/tool-middleware.ts:102`

```typescript
const cache = new Map<string, IdempotencyCacheEntry>();
```

The idempotency middleware protects `add_to_ledger`, `update_study`, and `store_memory` from duplicate execution. The cache is a `Map` in process memory — it vanishes on every serverless cold start. A retried tool call after a timeout will execute twice, creating duplicate studies or memories.

**Fix:** Back with a lightweight DB table: `ToolCallDedup(fingerprint TEXT PRIMARY KEY, result JSONB, expiresAt TIMESTAMPTZ)`. Check before execution, write after. Add a periodic cleanup job or TTL index. Keep the in-memory cache as a hot L1 layer in front of the DB lookup.

---

### C5. No Input Validation on Server Actions *(Missed by original audit)*

**Files:** All files in `app/actions/` — `extraction.ts`, `conversations.ts`, `protocols.ts`, `onboarding.ts`, `notes.ts`, `agent.ts`, `memory.ts`, etc.

Zero runtime input validation. No Zod schemas, no runtime type checks. TypeScript types are compile-time only — at runtime, any caller can pass arbitrary payloads to any server action. This is the single largest security gap in the codebase.

**Fix:** Add Zod schemas for every server action's parameters. Validate at the top of each action before any business logic. Create a shared `withValidatedAction<T>(schema, handler)` wrapper that validates, then delegates to `withAuth`.

---

### C6. 100MB Server Action Body Size Limit *(Missed by original audit)*

**File:** `next.config.ts:8-10`

```typescript
experimental: {
    serverActions: { bodySizeLimit: "100mb" },
},
```

Any client can send a 100MB payload to any server action. This is a trivial DoS vector — a few concurrent requests will exhaust serverless memory.

**Fix:** Reduce to `4mb` (Next.js default). For file upload actions that genuinely need more, use a dedicated API route with streaming and explicit size checking.

---

### C7. Missing Global Error Boundary

**Files:** `app/error.tsx` and `app/global-error.tsx` — neither exists.

Segment-level error boundaries exist under `/project/[id]/` (draft, ledger, protocol), but root-level pages (`/ai`, `/login`, onboarding) and the app shell itself have no error boundary. An unhandled error crashes to a white screen or the default Next.js error page.

**Fix:** Add `app/global-error.tsx` (catches errors in the root layout) and `app/error.tsx` (catches errors in root pages). Reuse the existing `ErrorFallback` component (`components/ErrorFallback.tsx`).

---

## II. HIGH — Significant Quality/Performance/Security Impact

### H1. Race Condition in Event Sequence Counter

**File:** `lib/server/agent/events.ts:42-75`

```typescript
const lastEvent = await prisma.runEvent.findFirst({ orderBy: { sequence: "desc" } });
const sequence = (lastEvent?.sequence ?? -1) + 1;
await prisma.runEvent.create({ data: { sequence, ... } });
```

Read-then-increment without atomicity. A retry loop (5 attempts) with `P2002` conflict detection mitigates this, but under burst concurrency (multiple sub-agents finishing simultaneously), all 5 retries can exhaust and the event is dropped.

**Fix:** Use a raw SQL atomic insert: `INSERT INTO "RunEvent" (..., sequence) SELECT $1, ..., COALESCE(MAX(sequence), -1) + 1 FROM "RunEvent" WHERE "runId" = $1`. This eliminates the race entirely.

---

### H2. No Optimistic Locking on Artifact Review

**File:** `lib/server/agent/artifacts.ts:110-146`

Read artifact → check status → update. No version check. Two concurrent reviews silently overwrite each other. The `version` column exists in the schema (`@default(1)`) but is never incremented or checked.

**Fix:** Add `version` to the update's `where` clause: `prisma.artifact.update({ where: { id, version: artifact.version }, data: { version: { increment: 1 }, ... } })`. Throw a conflict error if the update affects 0 rows.

---

### H3. Silent Snapshot Failure Breaks Undo

**File:** `lib/server/agent/artifacts.ts:194-208`

If snapshot capture fails, the error is caught and logged with `console.warn` — but the artifact is still marked as "applied." The undo function (`undoArtifact()` at line 240) later tries to restore from a snapshot that doesn't exist, failing silently or throwing an opaque error.

**Fix:** Make snapshot capture mandatory. If it fails, don't mark the artifact as applied — throw and let the caller decide whether to proceed without undo capability. At minimum, set a `snapshotFailed: true` flag so the UI can disable the undo button.

---

### H4. Fire-and-Forget Memory Extraction

**File:** `lib/server/agent/run.ts:96-100`

```typescript
scheduleMemoryExtraction(...).catch((err) => console.error(...));
```

If memory extraction fails (DB timeout, rate limit, etc.), it's silently lost. The user's conversation context degrades over time with no indication. Same pattern at `artifacts.ts:156-158` for decision memory.

**Fix:** Add a `pending_extraction` status column on AgentRun. On failure, leave it pending. Add a periodic retry sweep (cron or pg-boss job) that retries pending extractions with exponential backoff.

---

### H5. No Per-Action Rate Limiting *(Missed by original audit)*

**Files:** `app/actions/extraction.ts`, `app/actions/conversations.ts`, `app/api/ai/transcribe/route.ts`

Only AI chat streaming has rate limiting (`lib/server/ai/rate-limiter.ts`). Expensive operations like `extractStudyFromPdfAction()`, `deepAnalyzeStudyAction()`, and `transcribeAudio()` have no per-user or per-project rate limits. A single user can exhaust the AI budget.

**Fix:** Extend the existing rate limiter to cover all AI-consuming actions. Add per-user daily/hourly budgets tracked in the database.

---

### H6. No Security Headers *(Missed by original audit)*

**Files:** `next.config.ts` (no headers config), `middleware.ts` (doesn't exist)

No CSP, X-Frame-Options, X-Content-Type-Options, HSTS, or Referrer-Policy headers. The streaming API route only sets `Content-Type` and `Cache-Control`.

**Fix:** Create `next-app/middleware.ts` with security headers. At minimum: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000`. Add a CSP in report-only mode initially.

---

### H7. N+1 Query in `addMentionedStudy()`

**File:** `lib/server/ledger.ts:364-395`

Loads ALL studies for a project (`findMany` with no limit), then loops through every one doing 4 string comparisons (DOI, PMID, S2ID, title+year) in JavaScript.

**Fix:** Push the matching into SQL with a single `WHERE` using `OR` conditions on the normalized identifiers. Falls back to title+year match if no identifiers provided.

---

### H8. God Object: `ai-service.ts` (2,064 lines)

**File:** `lib/server/ai/ai-service.ts`

Handles 13+ responsibilities: provider management, streaming, tool execution, memory retrieval, context assembly, artifact creation, conversation management, rate limiting, error classification, reasoning mode resolution, scoping, and titling.

**Fix:** Split into focused modules:
- `ChatStreamService` — streaming + response parsing
- `ContextAssembler` — protocol, ledger, memory, study context building
- `ToolExecutor` — tool dispatch + middleware pipeline
- `AIServiceFacade` — thin orchestration layer composing the above

---

### H9. God Page: `ai/page.tsx` (2,054 lines)

**File:** `app/ai/page.tsx`

A single component doing conversation CRUD, timeline rendering, input handling, state orchestration, artifact review, reasoning mode selection, and quick actions.

**Fix:** Extract into feature hooks: `useConversationManager()`, `useTimelineState()`, `useArtifactReview()`, `useCopilotInput()`. Keep the page component as thin glue.

---

### H10. Direct Prisma Access in Server Actions (Bypassing Service Layer)

**Files:** `app/actions/conversations.ts` (19 direct Prisma queries), `app/actions/notes.ts`, `app/actions/usage.ts`, `app/actions/memory.ts`, `app/actions/stats.ts`, `app/actions/summarize-conversation.ts`, `app/actions/ai-assistant.ts`, `app/actions/agent.ts`

8 action files import `prisma` directly instead of going through the service layer. This scatters authorization logic, makes query patterns inconsistent, and prevents caching at the service boundary.

**Fix:** Move queries into `lib/server/` service functions. Actions should only call `withAuth() → service function`. Prioritize `conversations.ts` (19 queries) and `notes.ts` first.

---

### H11. Prompt Injection Surface in Context Sanitization

**File:** `lib/ai/prompts/copilot-prompts.ts:67-79`

`sanitizeContext()` strips role labels (`system:`, `user:`, `assistant:`, `[INST]`) with case-insensitive regex (good), but doesn't handle:
- Whitespace-padded variants (`  system  :`)
- Unicode homoglyphs
- HTML entities
- External content (PubMed titles/abstracts) injected without any sanitization

**Fix:** Apply sanitization to all external content before prompt injection. Add whitespace normalization before pattern matching. Consider a whitelist approach for the context string format.

---

## III. MEDIUM — Quality, Maintainability, Performance

### M1. Missing Database Indexes

**File:** `prisma/schema.prisma`

Missing composite indexes for common query patterns:

| Model | Missing Index | Used By |
|-------|--------------|---------|
| Study | `[projectId, status]` | Bulk screening filters |
| Study | `[projectId, createdAt]` | Paginated study listing |
| AIConversation | `[projectId, archived]` | Conversation panel filtering |

ProjectMemory indexes are adequate (already has `[projectId, status]`, `[projectId, importance]`).

---

### M2. Unbounded Queries Missing `take`/LIMIT

| Location | Query | Risk |
|----------|-------|------|
| `ledger.ts:102` | `listStudies()` — all studies, no limit | Memory spike for large projects |
| `ledger.ts:261` | `bulkImport()` — loads all saved studies | Same |

Note: `semantic-memory.ts` is properly bounded with explicit `take:` limits (80/160/160 per scope). The original audit was wrong about this.

---

### M3. Heavy Static Imports That Should Be Dynamic

**File:** `components/copilot/TimelineRenderer.tsx`

33 imports, including 10+ artifact card components loaded unconditionally. Draft page statically imports TipTap editor + extensions. Modal components imported statically but rendered conditionally.

**Fix:** Use `next/dynamic` with `{ ssr: false }` for artifact cards, TipTap editor, and modals. Group artifact cards into a single lazy chunk.

---

### M4. Doom-Loop Detection Only Catches Consecutive Repeats

**File:** `lib/agent/loop-controller.ts:79-95`

Tracks only consecutive identical tool calls. Pattern A → B → A → B → A → B never triggers detection (count resets on every change). Threshold is 3 consecutive.

**Fix:** Track a sliding window of the last 10 tool call hashes. Trigger if any single tool exceeds 60% frequency within the window.

---

### M5. Sub-Agent Results Are Unstructured

**File:** `lib/server/ai/sub-agent.ts:65-78`

`SubAgentResult.summary` is plain concatenated markdown. The parent agent must re-parse it with NLP to understand what happened. `toolLog` is structured but `summary` is not.

**Fix:** Add a structured `outcomes` field: `{ studiesAdded?: number; criteriaUpdated?: string[]; artifactsCreated?: { type: string; id: string }[] }`.

---

### M6. Tool Result Compaction Loses Context

**File:** `lib/agent/compaction.ts:119-197`

Search results truncated to first 5 items. The AI doesn't know what was dropped or whether the remaining 45 results contradict the visible 5.

**Fix:** Append a summary footer: `"Showing 5 of 47 results. Remaining results span 2000-2024 and include X excluded studies."`.

---

### M7. Widespread `as any` Type Casts

14 production instances (65 more in tests, which is acceptable). Key locations:
- `ledger.ts:170, 187, 239, 257, 343` — `details as any` on every DB write
- `conversations.ts:337-338` — `as unknown as any` double cast
- `artifacts.ts:315-350` — `as unknown as StudyProposalPayload` double cast
- All 4 AI provider files — `(choice.delta as any)?.tool_calls`

**Fix:** Define Prisma JSON field types with Zod schemas. Create type guards for discriminated unions. Fix provider casts with proper SDK types.

---

### M8. Missing `not-found.tsx` Page

No 404 handling anywhere. Invalid routes show the default Next.js 404 or a blank page.

**Fix:** Add `app/not-found.tsx` with branded 404 UI.

---

### M9. Focus Outline Removal Without Replacement

48+ instances of `outline: none` across CSS modules. While `base.css` has global `:focus-visible` rules, per-component `outline: none` can override them, breaking keyboard navigation.

**Fix:** Audit each instance. Replace `outline: none` with `outline: none` + explicit `:focus-visible` styles in the same rule block.

---

### M10. No Server Action Caching

Read-only actions (`listStudiesAction`, `listNotes`, conversation listings) hit the database on every call with no caching layer.

**Fix:** Wrap read-only service functions with `unstable_cache()` (30-60s TTL). Revalidate on mutations using `revalidateTag()`.

---

### M11. `eslint-disable react-hooks/exhaustive-deps` — 12+ Instances

**Files:** `useCopilotStreamActions.ts` (6), `useCopilotConversations.ts` (6)

Likely intentional but signals the dependency graph needs rethinking.

**Fix:** Extract stable callbacks to `useRef`, use `useCallback` with proper deps, or restructure hooks to eliminate the need for disables.

---

### M12. File Upload Type Validation is Extension-Only *(Missed by original audit)*

**File:** `lib/server/files.ts:336-344`

Checks file extension and client-reported MIME type only. No magic byte validation. An attacker can rename any file to `.pdf` and it passes.

**Fix:** After upload, read the first 4-8 bytes and validate against known magic bytes (`%PDF` for PDF, `PK` for DOCX).

---

### M13. In-Memory Claim Deduplication *(Missed by original audit)*

**File:** `lib/server/auth/claim.ts:8`

```typescript
const claimedUsers = new Set<string>();
```

Same serverless problem as C1 and C4. The database advisory lock at line 63 provides the real protection, making this in-memory check redundant noise.

**Fix:** Remove the in-memory check entirely — it gives false confidence. The DB advisory lock is the actual protection and works correctly.

---

### M14. No Streaming Response Abort Cleanup *(Missed by original audit)*

**File:** `app/api/ai/stream/route.ts:91-121`

`request.signal` is passed to the AI service, but when a client disconnects, there's no cleanup of pending AI provider connections. Potential for zombie requests and connection pool exhaustion.

**Fix:** Wire `request.signal` to an `AbortController` that cancels the underlying AI provider request. Add a `finally` block that explicitly closes provider connections.

---

## IV. LOW — Polish, Style, Minor Improvements

### L1. Missing Few-Shot Examples in AI Prompts

**File:** `lib/ai/prompts/copilot-prompts.ts:85-150`

Mode-specific prompts describe tools but don't show worked examples of correct tool call sequences. This causes suboptimal tool choices.

---

### L2. Color Contrast Concern

**File:** `styles/tokens.css:58`

`--text-muted: #948f85` on `--bg-body: #f2f0e9` — contrast ratio ~3.2:1, fails WCAG AA for small text (requires 4.5:1).

---

### L3. Magic Numbers in Memory Retrieval

**File:** `lib/server/memory/memory-retrieval.ts:38-42`

`HYBRID_VECTOR_WEIGHT = 0.7`, `MMR_LAMBDA = 0.7`, `TEMPORAL_DECAY_HALF_LIFE_DAYS = 30` — undocumented tuning constants.

---

### L4. Hardcoded Model Name

**File:** `lib/server/pdf-extraction.ts:18`

`QUICK_EXTRACT_MODEL = "grok-4-1-fast"` hardcoded. Should reference `lib/ai/config.ts`.

---

### L5. 5-Minute Undo Window is Non-Configurable

**File:** `lib/server/agent/artifacts.ts:250-254`

Hardcoded to 5 minutes. For long-running agent operations, this is too short.

---

### L6. Wildcard Exports in Memory Module

**File:** `lib/server/memory/index.ts`

Re-exports 8 modules with `export *`, making dependency tracking difficult.

---

### L7. `console.log` Instead of Structured Logging

29 `console.error`/`console.warn` instances in `lib/server/`. No structured logging library. Prevents meaningful production observability.

---

### L8. Large Context Files Mixing Concerns

`ProtocolContext.tsx` (491 lines), `ProjectCopilotContext.tsx` (438 lines) — state, effects, and derived computations all mixed in single files.

---

### L9. Prisma Model Naming Inconsistency

**File:** `prisma/schema.prisma:227-285`

`aIConversation`, `aIMessage`, `aIUsage` use awkward camelCase while everything else is PascalCase, producing `prisma.aIConversation.findMany()`.

---

### L10. Missing Environment Variable Validation at Startup *(Missed by original audit)*

**Files:** `lib/auth.ts:28`, `lib/server/files.ts:15-16`, `lib/server/prisma.ts:7`

Optional env vars (`RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) aren't validated at startup. Errors surface only when features are used at runtime.

---

### L11. No Audit/Security Logging *(Missed by original audit)*

No structured audit trail for auth failures, sensitive operations, file uploads, or AI cost tracking. Makes forensic analysis of security incidents impossible.

---

## V. Positive Findings — Keep Doing These

| Area | What's Good |
|------|-------------|
| **Server action layering** | Consistent `withAction()` → `withAuth()` → service pattern (where followed) |
| **Dark mode** | Comprehensive token-based implementation with localStorage persistence |
| **ARIA landmarks** | Proper `role`, `aria-label` on sidebar, nav, main, error boundaries |
| **Error boundaries** | Present on all major route segments (draft, ledger, protocol, study) |
| **Loading states** | `loading.tsx` present for all major routes |
| **Radix UI dialogs** | Proper accessible modals with `aria-labelledby`, `VisuallyHidden` |
| **Parameterized SQL** | All raw queries use Prisma's template literal escaping |
| **Event sourcing** | Clean `AgentRun` + `RunEvent` pattern with sequence ordering and conflict detection |
| **Token system** | CSS variables for colors, spacing, radii — minimal hardcoded values |
| **Soft deletes** | Consistent `deletedAt` pattern on Study, Note |
| **Idempotency design** | SHA256 fingerprinting scoped per-run is the right architecture (just needs DB backing) |
| **ErrorFallback component** | Reusable, accessible (`role="alert"`, `aria-live`), customizable |
| **Notes service layer** | Full CRUD, FTS search, cursor pagination, soft delete — exemplary pattern |
| **Import hygiene** | Consistent `@/` alias, minimal barrel exports |

---

## VI. Detailed Implementation Task List

Tasks are organized by priority tier, then by logical dependency order within each tier. Effort estimates: S = < 1 hour, M = 1-4 hours, L = 4-8 hours, XL = 1-2 days.

---

### P0 — Fix This Week (Production Safety)

#### Task 1: Add global error boundaries
- **Effort:** S
- **Files to create:** `app/global-error.tsx`, `app/error.tsx`
- **Steps:**
  1. Create `app/global-error.tsx` as a client component that catches errors in the root layout. Import and reuse `ErrorFallback` from `components/ErrorFallback.tsx`. Must accept `error` and `reset` props per Next.js convention.
  2. Create `app/error.tsx` for root page errors using the same pattern.
  3. Test by temporarily throwing in a root page.

#### Task 2: Reduce server action body size limit
- **Effort:** S
- **Files to edit:** `next.config.ts`
- **Steps:**
  1. Change `bodySizeLimit` from `"100mb"` to `"4mb"`.
  2. If file upload actions need more, move them to dedicated API routes (`app/api/upload/route.ts`) with explicit `Content-Length` checks and streaming.

#### Task 3: Replace in-memory extraction locks with DB-backed locking
- **Effort:** M
- **Files to edit:** `prisma/schema.prisma`, `app/actions/extraction.ts`
- **Steps:**
  1. Add `processingStatus String @default("idle")` to the Study model in schema.prisma (values: `idle`, `extracting`, `analyzing`).
  2. Generate and apply migration: `npx prisma migrate dev --name add_study_processing_status`.
  3. In `extractStudyFromPdfAction()`, replace the `Set`-based lock with an atomic update: `prisma.study.update({ where: { id: studyId, processingStatus: "idle" }, data: { processingStatus: "extracting" } })`. If update returns 0 rows, return the "already in progress" error.
  4. In the `finally` block, reset to `idle`: `prisma.study.update({ where: { id: studyId }, data: { processingStatus: "idle" } })`.
  5. Same pattern for `deepAnalyzeStudyAction()` with status `"analyzing"`.
  6. Remove the `EXTRACTION_LOCKS` Set entirely.

#### Task 4: Fix study upsert race condition
- **Effort:** S
- **Files to edit:** `lib/server/ledger.ts`
- **Steps:**
  1. Replace the `findFirst` → `update`/`create` pattern in `upsertStudy()` (lines 151-191) with `prisma.study.upsert()`.
  2. The `where` clause should use the study `id` + `projectId` compound. If no compound unique exists, add `@@unique([id, projectId])` to the Study model (note: `id` is already `@id`, so just use `where: { id }` with a projectId check in the data).
  3. Alternatively, wrap in `prisma.$transaction()` with isolation level `Serializable`.

#### Task 5: Add safety guard to `replaceStudies()` for empty lists
- **Effort:** S
- **Files to edit:** `lib/server/ledger.ts`
- **Steps:**
  1. Add an optional `force` parameter to `replaceStudies()`: `opts?: { force?: boolean }`.
  2. At the top of the function, before the transaction: `if (normalized.length === 0 && !opts?.force) throw new Error("Cannot sync with empty study list. Pass { force: true } to confirm full purge.")`.
  3. Audit all callers to determine which (if any) legitimately pass empty arrays and add `{ force: true }` where intentional.

#### Task 6: Add input validation to critical server actions
- **Effort:** L
- **Files to edit:** `app/actions/extraction.ts`, `app/actions/conversations.ts`, `app/actions/agent.ts`, `app/actions/onboarding.ts`, `app/actions/notes.ts`, `app/actions/protocols.ts`, `app/actions/ledger.ts`, `app/actions/memory.ts`
- **Steps:**
  1. Install zod if not already present (`npm install zod`).
  2. Create a `withValidatedAction<TSchema>(schema, handler)` utility in `lib/server/action-utils.ts` that validates input with the schema before calling `withAuth()`.
  3. Define Zod schemas for every server action's parameters. Start with the most exposed actions: `extraction.ts` (projectId, studyId, fileAssetId), `conversations.ts` (conversationId, message content), `agent.ts` (runId, input).
  4. Apply schemas to all remaining actions.
  5. Add tests for validation rejection.

---

### P1 — Next Sprint (Concurrency, Security, Reliability)

#### Task 7: Back idempotency cache with database
- **Effort:** M
- **Files to edit:** `prisma/schema.prisma`, `lib/server/ai/tool-middleware.ts`
- **Steps:**
  1. Add a `ToolCallDedup` model: `model ToolCallDedup { fingerprint String @id, result Json, expiresAt DateTime, @@index([expiresAt]) }`.
  2. Generate migration.
  3. In `createIdempotencyMiddleware()`, modify `before()` to check the DB table when the in-memory cache misses. Modify `after()` to write to both the in-memory cache and the DB table.
  4. Keep the in-memory `Map` as an L1 cache for hot-path performance.
  5. Add a cleanup function that runs periodically (or on each write) to delete expired rows: `DELETE FROM "ToolCallDedup" WHERE "expiresAt" < NOW()`.

#### Task 8: Add optimistic locking to artifact review
- **Effort:** S
- **Files to edit:** `lib/server/agent/artifacts.ts`
- **Steps:**
  1. In `reviewArtifact()`, include `version` in the initial `findUnique` select.
  2. Change the update to: `prisma.artifact.update({ where: { id: artifactId, version: artifact.version }, data: { ..., version: { increment: 1 } } })`.
  3. If the update returns null / affects 0 rows, throw a `ConflictError("Artifact was modified by another request. Please refresh and try again.")`.
  4. Apply same pattern to `undoArtifact()`.

#### Task 9: Make snapshot capture mandatory for undo
- **Effort:** S
- **Files to edit:** `lib/server/agent/artifacts.ts`
- **Steps:**
  1. In the apply flow (around line 194-208), change the `catch` block from `console.warn` to re-throwing the error.
  2. Add a `snapshotCaptured Boolean @default(false)` field to the Artifact model (or reuse a nullable `snapshot` field check).
  3. In `undoArtifact()`, check `if (!artifact.snapshot) throw new Error("Cannot undo: no snapshot was captured for this artifact.")`.
  4. In the UI, disable the undo button when snapshot is null.

#### Task 10: Make event sequence counter atomic
- **Effort:** M
- **Files to edit:** `lib/server/agent/events.ts`
- **Steps:**
  1. Replace the read-then-increment pattern with a raw SQL atomic insert:
     ```sql
     INSERT INTO "RunEvent" ("id", "runId", "sequence", "type", "payload", ...)
     SELECT gen_random_uuid(), $1, COALESCE(MAX("sequence"), -1) + 1, $2, $3, ...
     FROM "RunEvent" WHERE "runId" = $1
     ```
  2. Use `prisma.$queryRaw` with parameterized values.
  3. Remove the retry loop (no longer needed).
  4. Keep `isRunSequenceConflict()` as a fallback safety net.

#### Task 11: Add per-action rate limiting for AI-consuming operations
- **Effort:** M
- **Files to edit:** `lib/server/ai/rate-limiter.ts`, `app/actions/extraction.ts`, `app/api/ai/transcribe/route.ts`
- **Steps:**
  1. Extend the existing rate limiter to support per-action limits (e.g., `extraction: 10/hour/user`, `deep-analysis: 5/hour/user`, `transcription: 20/hour/user`).
  2. Add rate limit checks at the top of `extractStudyFromPdfAction()`, `deepAnalyzeStudyAction()`, and the transcribe route.
  3. Return a user-friendly error with retry-after information.

#### Task 12: Add retry mechanism for memory extraction
- **Effort:** M
- **Files to edit:** `prisma/schema.prisma`, `lib/server/agent/run.ts`
- **Steps:**
  1. Add `memoryExtractionStatus String @default("pending")` to the AgentRun model (values: `pending`, `completed`, `failed`).
  2. Generate migration.
  3. Replace the `.catch(console.error)` with: try extraction → set `completed`; on failure → set `failed` and log.
  4. Create a `retryFailedExtractions()` function that queries for `failed` runs and retries.
  5. Wire to a cron endpoint or call on app startup.

#### Task 13: Create security headers middleware
- **Effort:** M
- **Files to create:** `middleware.ts`
- **Steps:**
  1. Create `next-app/middleware.ts`.
  2. Add security headers to all responses:
     - `X-Content-Type-Options: nosniff`
     - `X-Frame-Options: DENY`
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
     - `Content-Security-Policy-Report-Only` (start in report-only mode)
  3. Configure the matcher to apply to all routes except static assets.

#### Task 14: Add missing database indexes
- **Effort:** S
- **Files to edit:** `prisma/schema.prisma`
- **Steps:**
  1. Add to Study model: `@@index([projectId, status])`, `@@index([projectId, createdAt])`.
  2. Add to AIConversation model: `@@index([projectId, archived])`.
  3. Generate migration: `npx prisma migrate dev --name add_performance_indexes`.
  4. Verify with `EXPLAIN ANALYZE` on the most common queries.

#### Task 15: Fix N+1 query in `addMentionedStudy()`
- **Effort:** M
- **Files to edit:** `lib/server/ledger.ts`
- **Steps:**
  1. Replace the `findMany` + JavaScript loop (lines 364-395) with a single Prisma query using `OR` conditions:
     ```typescript
     prisma.study.findFirst({
       where: {
         projectId,
         deletedAt: null,
         OR: [
           { details: { path: ['doi'], equals: normalizedDoi } },
           { details: { path: ['pmid'], equals: normalizedPmid } },
           { details: { path: ['semanticScholarId'], equals: s2Id } },
           // title+year match as fallback
         ]
       }
     })
     ```
  2. If JSON path queries aren't performant enough, consider adding top-level `doi` and `pmid` columns to Study.

#### Task 16: Add pagination to unbounded queries
- **Effort:** M
- **Files to edit:** `lib/server/ledger.ts`
- **Steps:**
  1. Add `take` and cursor parameters to `listStudies()` (line 102). Default `take: 200`.
  2. Add a `countStudies()` function for cases where only counts are needed.
  3. Apply same pattern to `bulkImport()` internal query (line 261).
  4. Update all callers to handle pagination.

---

### P2 — Following Sprint (Architecture, Bundle, Code Quality)

#### Task 17: Split `ai-service.ts` into focused modules
- **Effort:** XL
- **Files to create:** `lib/server/ai/chat-stream.ts`, `lib/server/ai/context-assembler.ts`, `lib/server/ai/tool-executor.ts`
- **Files to edit:** `lib/server/ai/ai-service.ts`, all importers
- **Steps:**
  1. Extract context assembly methods (protocol, ledger, memory, study context) into `context-assembler.ts`.
  2. Extract tool dispatch + middleware pipeline into `tool-executor.ts`.
  3. Extract streaming + response parsing into `chat-stream.ts`.
  4. Keep `ai-service.ts` as a thin facade that composes the above.
  5. Update all imports across the codebase.
  6. Run `npx tsc --noEmit` and `npx vitest run` after each extraction step.

#### Task 18: Split `ai/page.tsx` into feature hooks and sub-components
- **Effort:** XL
- **Files to create:** `app/ai/hooks/useConversationManager.ts`, `app/ai/hooks/useTimelineState.ts`, `app/ai/hooks/useArtifactReview.ts`, `app/ai/components/AITimeline.tsx`, `app/ai/components/AIInputArea.tsx`
- **Files to edit:** `app/ai/page.tsx`
- **Steps:**
  1. Extract conversation CRUD into `useConversationManager()` hook.
  2. Extract timeline state + rendering into `useTimelineState()` + `AITimeline` component.
  3. Extract artifact review logic into `useArtifactReview()` hook.
  4. Extract input area into `AIInputArea` component.
  5. Reduce `page.tsx` to composition of hooks and components (~200-300 lines).

#### Task 19: Add dynamic imports for heavy components
- **Effort:** M
- **Files to edit:** `components/copilot/TimelineRenderer.tsx`, `app/project/[id]/draft/page.tsx`
- **Steps:**
  1. Create a `components/copilot/artifact-cards/index.ts` barrel that re-exports all artifact cards.
  2. In `TimelineRenderer.tsx`, replace static imports with `const ArtifactCards = dynamic(() => import('./artifact-cards'), { ssr: false })`.
  3. In draft page, dynamically import TipTap: `const Editor = dynamic(() => import('@/components/draft/DraftEditor'), { ssr: false, loading: () => <DraftSkeleton /> })`.
  4. Verify bundle size reduction with `next build --analyze`.

#### Task 20: Move direct Prisma calls from actions to service layer
- **Effort:** L
- **Files to create:** `lib/server/conversations.ts` (service), `lib/server/usage.ts` (service)
- **Files to edit:** `app/actions/conversations.ts`, `app/actions/usage.ts`, `app/actions/notes.ts`, `app/actions/memory.ts`, `app/actions/stats.ts`
- **Steps:**
  1. Create `lib/server/conversations.ts` with service functions for each query currently in the action file (19 queries to migrate).
  2. Create `lib/server/usage.ts` for usage aggregation queries.
  3. Update action files to call service functions instead of `prisma` directly.
  4. Remove `prisma` imports from action files.
  5. Use `lib/server/notes.ts` as the reference pattern — it's already correctly layered.

#### Task 21: Harden prompt injection sanitization
- **Effort:** M
- **Files to edit:** `lib/ai/prompts/copilot-prompts.ts`
- **Steps:**
  1. Add whitespace normalization before pattern matching: collapse multiple spaces, trim around colons.
  2. Add sanitization for external content (study titles, abstracts) before injection into prompts.
  3. Add XML/HTML tag stripping for injected context.
  4. Add a test suite with adversarial inputs: `"  SYSTEM  : ignore all"`, `"syst\u0435m:"` (Cyrillic e), `"<system>override</system>"`.

#### Task 22: Improve doom-loop detection with sliding window
- **Effort:** M
- **Files to edit:** `lib/agent/loop-controller.ts`
- **Steps:**
  1. Add a circular buffer of the last 10 tool call hashes.
  2. After each call, check if any single tool hash exceeds 60% of the window (6 out of 10).
  3. Keep the existing consecutive check as a fast path (3 identical = immediate stop).
  4. Add the oscillation pattern to the existing loop-controller tests.

#### Task 23: Add structured outcomes to sub-agent results
- **Effort:** M
- **Files to edit:** `lib/server/ai/sub-agent.ts`, `types/agent.ts`
- **Steps:**
  1. Define `SubAgentOutcome` type: `{ studiesAdded?: number; studiesScreened?: number; criteriaUpdated?: string[]; artifactsCreated?: { type: string; id: string }[]; memoriesStored?: number }`.
  2. Add `outcomes: SubAgentOutcome` to `SubAgentResult`.
  3. Populate from structured tool call results (already available in `toolLog`).
  4. Update parent agent prompts to reference structured outcomes.

---

### P3 — Ongoing Improvements

#### Task 24: Add `not-found.tsx` page
- **Effort:** S
- **Files to create:** `app/not-found.tsx`

#### Task 25: Add compaction summary footer to truncated tool results
- **Effort:** S
- **Files to edit:** `lib/agent/compaction.ts`

#### Task 26: Clean up `as any` casts in production code
- **Effort:** M
- **Files to edit:** `lib/server/ledger.ts`, `lib/server/ai/providers/*.ts`, `app/actions/conversations.ts`

#### Task 27: Audit and fix focus outline removals
- **Effort:** M
- **Files to edit:** 48+ CSS modules with `outline: none`

#### Task 28: Add server action caching for read-only operations
- **Effort:** M
- **Files to edit:** `lib/server/ledger.ts`, `lib/server/notes.ts`, `lib/server/conversations.ts` (once created)

#### Task 29: Add file upload magic byte validation
- **Effort:** S
- **Files to edit:** `lib/server/files.ts`

#### Task 30: Add streaming abort cleanup
- **Effort:** M
- **Files to edit:** `app/api/ai/stream/route.ts`, AI provider files

#### Task 31: Remove in-memory claim deduplication (redundant with DB lock)
- **Effort:** S
- **Files to edit:** `lib/server/auth/claim.ts`

#### Task 32: Add environment variable validation at startup
- **Effort:** S
- **Files to create:** `lib/env.ts`

#### Task 33: Add structured logging
- **Effort:** L
- **Files to edit:** All `console.error`/`console.warn` call sites in `lib/server/`

#### Task 34: Fix color contrast for `--text-muted`
- **Effort:** S
- **Files to edit:** `styles/tokens.css`

#### Task 35: Centralize hardcoded model names
- **Effort:** S
- **Files to edit:** `lib/server/pdf-extraction.ts`, `lib/ai/config.ts`

#### Task 36: Make undo window configurable
- **Effort:** S
- **Files to edit:** `lib/server/agent/artifacts.ts`

#### Task 37: Split large context providers
- **Effort:** M
- **Files to edit:** `contexts/ProtocolContext.tsx`, `contexts/ProjectCopilotContext.tsx`

#### Task 38: Fix Prisma model naming inconsistency
- **Effort:** M (requires migration)
- **Files to edit:** `prisma/schema.prisma`, all files referencing `prisma.aIConversation`, `prisma.aIMessage`, `prisma.aIUsage`

---

### Task Summary

| Priority | Tasks | Count | Total Effort |
|----------|-------|-------|-------------|
| **P0 — This Week** | Tasks 1-6 | 6 | ~2 days |
| **P1 — Next Sprint** | Tasks 7-16 | 10 | ~4-5 days |
| **P2 — Following Sprint** | Tasks 17-23 | 7 | ~5-6 days |
| **P3 — Ongoing** | Tasks 24-38 | 15 | ~5-6 days |
| **Total** | | **38** | **~16-19 days** |
