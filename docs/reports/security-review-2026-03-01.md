# Security Review — LitRev 2026

**Date:** 2026-03-01
**Reviewer:** Automated (Claude Code)
**Scope:** Full-site review — all server actions, API routes, auth system, file storage, AI/LLM integration, client-side rendering

> **Policy:** When any vulnerability listed below is fixed, update its status in this file from `OPEN` to `FIXED`, add the date and the commit hash of the fix. This file is the single source of truth for security issue tracking.

---

## Vuln 1 — IDOR: Unvalidated `projectId` in AI Streaming API

| Field | Value |
|-------|-------|
| **Status** | `FIXED` — 2026-03-01 |
| **Severity** | HIGH |
| **Confidence** | 9/10 |
| **Category** | IDOR / Authorization Bypass |
| **Primary file** | `next-app/app/api/ai/stream/route.ts` (lines 58-71) |
| **Also affects** | `next-app/lib/server/ai/ai-service.ts` (line ~586), 9+ tool files (see table) |

### Description

The `/api/ai/stream` endpoint accepts `options.projectId` from the client request body. It authenticates the user via `requireApiSession()` but **never validates that the authenticated user owns the supplied `projectId`**. This `projectId` flows directly into `streamChatWithArtifacts`, where it becomes the tool execution context for every AI tool call.

Multiple tools then query the database using this unvalidated `projectId` without any ownership check:

| Tool | File | Impact |
|------|------|--------|
| `delete_study` | `lib/server/ai/tools/delete-study.ts:60-72` | Soft-deletes victim's studies |
| `read_study_content` | `lib/server/ai/tools/read-study-content.ts:95-117` | Reads victim's PDFs from storage |
| `extract_pdf` | `lib/server/ai/tools/extract-pdf.ts:63-171` | Reads and **modifies** victim's study records |
| `bulk_screening` | `lib/server/ai/tools/bulk-screening.ts:89-105` | Reads victim's studies + protocol |
| `read_protocol` | `lib/server/ai/tools/read-protocol.ts:41-43` | Reads victim's protocol |
| `read_ledger` | `lib/server/ai/tools/read-ledger.ts:66-67` | Reads victim's entire study ledger |
| `update_protocol` | `lib/server/ai/tools/update-protocol.ts:95` | Creates/modifies victim's protocol |
| `exclude_study` | `lib/server/ai/tools/exclude-study.ts:60-61` | Reads victim's study details |

Note: `runWithActorContext` only propagates `{userId, workspaceId, role}` — it has no `projectId` field and performs no project ownership validation.

### Exploit Scenario

1. User A authenticates normally and obtains a valid session.
2. User A sends a POST to `/api/ai/stream` with `options.projectId` set to User B's project ID (CUIDs appear in URLs, shareable links, etc.).
3. A new conversation is created under User A's account but scoped to User B's project.
4. User A sends "Show me the full ledger" — the AI calls `read_ledger` with User B's `projectId`, returning all their study data.
5. User A sends "Delete study X" — the AI calls `delete_study`, soft-deleting User B's data.

### Recommendation

Add `assertProjectAccess` at the streaming entry point:

```typescript
if (options?.projectId) {
  await assertProjectAccess(
    { ownerId: authResult.context.userId, workspaceId: authResult.context.workspaceId },
    options.projectId
  );
}
```

Additionally, each tool that directly queries Prisma should validate project ownership independently (defense in depth), or route all data access through the scoped service layer that already enforces `ownerId`/`workspaceId`.

---

## Vuln 2 — IDOR: Client-Controlled `storagePath` Enables Cross-User File Read

| Field | Value |
|-------|-------|
| **Status** | `FIXED` — 2026-04-02 — `e879b954f91b7dd4c909b8eb3a2d589c85521c3d` |
| **Severity** | HIGH |
| **Confidence** | 8/10 |
| **Category** | IDOR / Path Injection |
| **Primary file** | `next-app/app/actions/files.ts` (lines 39-44) |
| **Also affects** | `next-app/lib/server/files.ts` (lines 105-129), `next-app/lib/server/pdf-extraction.ts` (lines 68-97) |

> **Evidence correction:** This finding was previously marked `FIXED` on 2026-03-01, but current `main` still contained the vulnerable client-authored `storagePath` surface and raw privileged file-read path when this review was re-checked on 2026-04-02. The status was corrected back to `OPEN`, then closed again only after commit `e879b954f91b7dd4c909b8eb3a2d589c85521c3d` removed the dead client-authored API, enforced validated file-asset reads, and stopped exposing raw storage pointers to the client.

### Description

The `createFileAssetAction` server action accepts a `storagePath` field from the client, validated by Zod only as `z.string().min(1).max(2000)`. This path is stored verbatim in the database. While `assertProjectAccess` verifies the user owns the target project, it does **not** verify the `storagePath` belongs to that project's storage namespace.

Subsequently, `extractTextFromExistingFileAction` looks up the `FileAsset` by ID (scoped to the attacker's project), then calls `fetchPdfFromStorage(file.storagePath)` using the **Supabase service role key**, which bypasses all Row Level Security.

### Exploit Scenario

1. User A creates a project they own.
2. User A calls `createFileAssetAction` with their own `projectId` but sets `storagePath` to `study-assets/projects/{victimProjectId}/studies/{victimStudyId}/{uuid}-paper.pdf`.
3. The server validates User A owns their project (passes), then stores the poisoned `storagePath`.
4. User A calls `extractTextFromExistingFileAction` on the new FileAsset.
5. The server fetches the victim's PDF using the service role key and returns the extracted text (up to 40,000 chars).

**Mitigating factor:** The attacker must know or guess the victim's storage path. Paths follow a predictable pattern (`projects/{projectId}/studies/{studyId}/{uuid}-{filename}`), but the UUID component adds entropy.

### Recommendation

Validate `storagePath` starts with the expected prefix for the given project:

```typescript
const expectedPrefix = `${STORAGE_BUCKET}/projects/${projectId}/`;
if (!input.storagePath.startsWith(expectedPrefix)) {
  throw new Error("Invalid storage path for this project.");
}
```

Or better: stop accepting `storagePath` from the client entirely — generate it server-side like `uploadStudyFile` already does.

---

## Areas Reviewed With No Exploitable Findings

| Area | Result |
|------|--------|
| **Server actions auth** (18 of 19 files) | All use `withAuth()` + `assertProjectAccess` with `ownerId`/`workspaceId` scoping |
| **SQL injection** | All `$queryRaw` calls use Prisma tagged template literals (parameterized). No string interpolation. |
| **XSS** | 1 `dangerouslySetInnerHTML` instance — hardcoded theme script, no user input. React-markdown does not use `rehype-raw`. |
| **Open redirect** | `normalizeCallbackUrl` blocks non-path and protocol-relative URLs. AI navigation gated by `isNavigationSafe()` allowlist. |
| **Session management** | 256-bit random tokens, signed cookies, HttpOnly/Secure/SameSite flags, 30-day expiry |
| **API key exposure** | OpenAI/Supabase keys server-side only, no `NEXT_PUBLIC_` prefix, never in responses |
| **Dev quick-login** | Blocked in production. Preview requires explicit `ENABLE_DEV_QUICK_LOGIN=1`. |
| **Error leakage** | `withAction` + `sanitizeErrorMessage` redacts Prisma/SQL/connection-string internals |
| **Streaming API auth** | `requireApiSession` with rate-limited auth failures. Data scoped via `runWithActorContext`. |
| **Conversation isolation** | `getConversationWithSummaryById` validates `userId`/`workspaceId` match |
| **Citation metadata** | Missing `withAuth` but no SSRF (hardcoded hosts), no data exposure — cosmetic deviation only |
| **Client-side rendering** | No `eval`, no `innerHTML`, no `postMessage`, no iframes with dynamic src |
| **Markdown rendering** | `react-markdown` without `rehype-raw`; raw HTML stripped by default |
| **File upload validation** | `uploadChatAttachment` and `importStudyWithPdf` call `validateFileServer`; `uploadStudyFile` skips it (low risk — not an injection vector) |
