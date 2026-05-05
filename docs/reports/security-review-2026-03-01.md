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
| **Status** | `FIXED` — 2026-04-02 — `4ac46626d2f1f39e4b1f0d8b84e3d8dff2ab5ac7` |
| **Severity** | HIGH |
| **Confidence** | 8/10 |
| **Category** | IDOR / Path Injection |
| **Primary file** | `next-app/app/actions/files.ts` (lines 39-44) |
| **Also affects** | `next-app/lib/server/files.ts` (lines 105-129), `next-app/lib/server/pdf-extraction.ts` (lines 68-97) |

> **Evidence correction:** This finding was previously marked `FIXED` on 2026-03-01, but current `main` still contained the vulnerable client-authored `storagePath` surface and raw privileged file-read path when this review was re-checked on 2026-04-02. The status was corrected back to `OPEN`, then closed again only after commit `4ac46626d2f1f39e4b1f0d8b84e3d8dff2ab5ac7` removed the dead client-authored API, enforced validated file-asset reads, and stopped exposing raw storage pointers to the client.

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
| **File upload validation** | Study uploads now enforce server-side PDF/DOCX byte-signature validation before blob storage, store canonical MIME metadata, and the authenticated file route uses attachment/no-sniff delivery by default. |


---

## Vuln 3 — Public Storage Bucket Makes Canonical Project Files Public By URL

| Field | Value |
|-------|-------|
| **Status** | `FIXED` — 2026-04-05 (`e6952771`) |
| **Severity** | HIGH |
| **Confidence** | 9/10 |
| **Category** | Data Exposure / Authorization Boundary Weakening |
| **Primary file** | `next-app/lib/server/files.ts` (lines 120-154) |
| **Also affects** | `next-app/lib/server/file-storage.ts` (lines 163-170), `next-app/lib/server/draft-exports.ts` (lines 87-105), `next-app/app/actions/files.ts` (lines 199-219), `docs/plans/plan-backend.md` (line 11) |

### Description

Canonical project files are uploaded into the primary Supabase bucket and immediately assigned a public object URL under `/storage/v1/object/public/...`. That URL is persisted on `FileAsset` rows and then surfaced back to client code as `publicUrl` and `downloadUrl` for canonical files.

This is not a path-injection bug anymore. It is a confidentiality-boundary problem: once a canonical file URL exists, LitRev authorization no longer mediates access to that object. This affects study PDFs, generated exports, and chat attachments.

### Recommendation

Move canonical project files to a private bucket and replace public URLs with short-lived signed URLs or app-proxied downloads scoped by current authorization.

### Closeout

Fixed in commit `e6952771`.

Canonical tenant-scoped `FileAsset` rows no longer mint or persist direct public storage object URLs. Canonical clients now receive authenticated app-owned download routes at `/api/projects/[projectId]/files/[fileId]`, and the production `study-assets` bucket was flipped from `public: true` to `public: false` after the merged route was live in production. Explicit `external/demo/*` compatibility remains the only public-URL legacy path.

Follow-up hardening closed the remaining study-upload content boundary: direct `uploadStudyFile` callers no longer rely on client-side file validation or caller-supplied MIME metadata, and authenticated file delivery defaults to attachment/no-sniff behavior instead of inline rendering.

---

## Vuln 4 — Authenticated Audio Transcription Bypasses AI Cost Controls

| Field | Value |
|-------|-------|
| **Status** | `FIXED` — 2026-04-05 (`5ca1c6a6`) |
| **Severity** | MEDIUM |
| **Confidence** | 8/10 |
| **Category** | Resource Abuse / Cost Control Gap |
| **Primary file** | `next-app/app/api/ai/transcribe/route.ts` (lines 9-42) |
| **Also affects** | `next-app/lib/server/ai/transcription.ts` (lines 25-42), `next-app/lib/server/ai/rate-limiter.ts` (lines 174-240), `next-app/lib/server/ai/ai-service.ts` (lines 557-620) |

### Description

The transcription route authenticates the caller and enforces a size cap, but it calls the provider directly without passing through the repo’s normal AI rate-limiter and usage-accounting path. The chat runtime validates rate limits and records usage; transcription currently does neither.

### Recommendation

Bring transcription under the same AI governance path: enforce per-user/workspace rate limits, record usage, and add route-specific abuse controls.

### Closeout

Fixed in commit `5ca1c6a6`.

`/api/ai/transcribe` now routes through a dedicated governed transcription service before the provider call. The route applies the shared per-user/workspace AI gate, validates optional project attribution server-side, records truthful zero-token `voice_transcription` usage rows, and returns deterministic local governance statuses instead of collapsing failures into generic `500`s. The transcription-specific daily cap in this fix is intentionally scoped to persisted successful transcriptions; the shared per-minute AI gate remains the burst-abuse control for all requests.

---

## Vuln 5 — PDF Extraction Logs Raw AI Response Content On Parse Failure

| Field | Value |
|-------|-------|
| **Status** | `FIXED` — 2026-04-05 (`e6952771`) |
| **Severity** | MEDIUM |
| **Confidence** | 8/10 |
| **Category** | Privacy / Log Leakage |
| **Primary file** | `next-app/lib/server/pdf-extraction.ts` (lines 211-217) |
| **Also affects** | Any server log sink consuming `logServerError` output |

### Description

`parseAIJson()` logs the raw AI response body when JSON parsing fails. That body is document-derived content and may include sensitive text extracted from uploaded files.

### Recommendation

Do not log raw provider response content here. Log only bounded diagnostics and add a regression test to prevent future content leakage.

### Closeout

Fixed in commit `e6952771`.

`parseAIJson()` no longer logs raw model response content on parse failure. The error payload now records only bounded diagnostics such as response length and code-fence shape, and regression coverage verifies that document-derived content is not emitted to logs.

---

## 2026-04-04 Hardening Gaps (Not Yet Tracked As Vulnerabilities)

- The repo currently has no committed CSP/security-header configuration (`next-app/next.config.ts`, `next-app/proxy.ts`).
- The repo currently has no committed Dependabot or CodeQL configuration, and `CI` does not declare explicit least-privilege permissions (`.github/workflows/ci.yml`).
