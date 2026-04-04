# Security Audit — LitRev 2026

**Date:** 2026-04-04  
**Audited snapshot:** `main` @ `110f57b7`  
**Reviewer:** Codex  
**Scope:** Repository security audit across auth, authorization, file/storage boundaries, background jobs, AI/runtime tooling, telemetry/privacy, and GitHub workflow security.

## Executive Summary

This pass found three confirmed security issues that should be treated as real follow-up work, plus three lower-severity hardening gaps.

### Confirmed Findings

1. **High:** project files are intentionally public by URL because the primary Supabase bucket is public and canonical file URLs are returned to clients.
2. **Medium:** authenticated audio transcription bypasses the repo's AI rate-limiter and usage-accounting controls.
3. **Medium:** PDF extraction logs raw AI response content on JSON parse failure, which can leak document-derived content into server logs.

### Hardening Gaps

1. Preview-only dev fixture routes are missing the origin/CSRF check used by the quick-login route itself.
2. The app currently ships without repo-managed CSP/security-header hardening.
3. GitHub security automation is thin: no committed Dependabot or CodeQL config, and CI does not declare explicit least-privilege permissions.

## Method

This was a static repository audit with targeted adversarial review. The pass covered:

- API routes under `next-app/app/api/**`
- server actions under `next-app/app/actions/**`
- privileged server code under `next-app/lib/server/**`
- AI tool/runtime surfaces under `next-app/lib/server/ai/**`
- storage and file handling under `next-app/lib/server/files.ts`, `next-app/lib/server/file-storage.ts`, and `next-app/lib/server/pdf-extraction.ts`
- GitHub workflow and governance files under `.github/**`

The audit also cross-checked current repo contracts in:

- `SECURITY.md`
- `docs/runbooks/security-baseline.md`
- `docs/reports/security-review-2026-03-01.md`
- `docs/plans/plan-backend.md`
- `docs/runbooks/db-architecture.md`
- `docs/runbooks/admin-access.md`
- `docs/plans/plan-agentic.md`
- `docs/plans/plan-memory.md`

## Findings

## Finding 1 — Public Storage Bucket Weakens File Confidentiality Boundary

- **Severity:** High
- **Confidence:** High
- **Category:** Data exposure / Authorization boundary weakening
- **Status:** Open
- **Primary files:**
  - `next-app/lib/server/files.ts:120-154`
  - `next-app/lib/server/file-storage.ts:163-170`
  - `next-app/lib/server/files.ts:196-263`
  - `next-app/lib/server/files.ts:298-340`
  - `next-app/lib/server/draft-exports.ts:87-105`
  - `next-app/app/actions/files.ts:199-219`
  - `next-app/components/StudyFilesPanel.tsx:216-236`
  - `docs/plans/plan-backend.md:11`

### What is happening

The main file-upload helper writes every canonical blob to Supabase Storage and immediately derives a public object URL:

- `uploadBytesToSupabaseStorage()` returns `publicUrl` built from `/storage/v1/object/public/...` in `next-app/lib/server/files.ts:150-154`.
- `uploadStudyFile()`, `uploadGeneratedProjectFile()`, `uploadChatAttachment()`, and `importStudyWithPdf()` all persist that `publicUrl` on `FileAsset` rows in `next-app/lib/server/files.ts:196-263`, `298-340`, and `400-450`.
- `getClientFileAssetUrls()` treats canonical project-owned rows as both `publicUrl` and `downloadUrl` in `next-app/lib/server/file-storage.ts:163-170`.
- The current backend plan explicitly documents the `study-assets` bucket as public in `docs/plans/plan-backend.md:11`.

This means study PDFs, generated exports, and chat attachments are not protected solely by application authorization once a URL exists. Anyone with the URL can fetch the object directly from Supabase without re-authenticating against LitRev.

### Why it matters

LitRev’s stated trust model is multi-tenant. A public bucket weakens that model in a way that is easy to normalize because the URLs are produced by server-owned logic. The issue is not path injection anymore; it is confidentiality boundary drift:

- access revocation does not revoke already-issued URLs
- server-side audit and authorization do not mediate subsequent downloads
- copied links, browser history, client logs, screenshots, or accidental sharing can expose documents cross-user
- generated draft exports and conversation attachments may contain especially sensitive review content

This is a real data-exposure risk even though object names include UUIDs.

### Recommended long-term fix

Move canonical project files to a **private** bucket and stop returning direct public object URLs for tenant-scoped files.

Preferred end state:

1. Keep server-owned storage identity.
2. Store only internal object metadata in `FileAsset`.
3. Return short-lived signed URLs or app-proxied downloads for authorized reads.
4. Reserve public URLs only for explicitly public artifacts, if that concept truly exists.
5. Separate any intentionally public asset class from project/study/chat files at the bucket and contract level.

## Finding 2 — Audio Transcription Bypasses AI Cost Controls

- **Severity:** Medium
- **Confidence:** High
- **Category:** Resource abuse / Cost control gap
- **Status:** Open
- **Primary files:**
  - `next-app/app/api/ai/transcribe/route.ts:9-42`
  - `next-app/lib/server/ai/transcription.ts:11-42`
  - `next-app/lib/server/ai/rate-limiter.ts:174-240`
  - `next-app/lib/server/ai/ai-service.ts:549-620`

### What is happening

The chat/runtime path enforces rate limits and records usage through `validateRateLimits()` and `recordUsage()` in `next-app/lib/server/ai/ai-service.ts:557-593` and `609-620`.

The transcription route does not use those controls:

- `POST /api/ai/transcribe` authenticates the user and validates file size, but then directly calls `transcribeAudio()` in `next-app/app/api/ai/transcribe/route.ts:11-37`.
- `transcribeAudio()` calls the Groq/OpenAI-compatible transcription API directly in `next-app/lib/server/ai/transcription.ts:32-40`.
- No AI usage record is written and no per-user/per-workspace rate limit is checked.

### Why it matters

Any authenticated user can repeatedly hit a cost-bearing provider endpoint outside the repo’s main AI guardrails. That is not a classic auth bypass, but it is a security-control gap with direct cost and abuse implications.

### Recommended long-term fix

Bring transcription under the same governance as chat:

1. Introduce a transcription-specific usage source and accounting path.
2. Enforce per-user and per-workspace rate limits before provider calls.
3. Add provider-timeout and retry policy that matches the broader AI runtime posture.
4. Record transcription usage for admin observability and abuse triage.
5. Consider stricter payload-size and request-frequency controls for this route specifically.

## Finding 3 — PDF Extraction Logs Raw AI Response Content On Parse Failure

- **Severity:** Medium
- **Confidence:** High
- **Category:** Privacy / Sensitive data leakage to logs
- **Status:** Open
- **Primary file:**
  - `next-app/lib/server/pdf-extraction.ts:209-217`

### What is happening

When JSON parsing fails in `parseAIJson()`, the server logs the full raw AI response content:

- `logServerError("pdf-extraction", "failed to parse AI response as JSON", { content });`

That content is derived from uploaded document text and can contain study metadata, abstract text, or other user-controlled or document-controlled material.

### Why it matters

Malformed or partially malformed provider output should not cause potentially sensitive document-derived content to be copied into server logs. Log sinks often have broader retention and access than the original app surface.

### Recommended long-term fix

1. Stop logging raw AI response bodies here.
2. Log only bounded diagnostics such as length, model, request ID, and a short redacted preview when truly needed.
3. If deeper debugging is required, gate verbose capture behind an explicit local-only debug flag that defaults off.
4. Add a regression test ensuring parse-failure logging does not contain raw response content.

## Lower-Severity Hardening Gaps

### Gap A — Preview Dev Fixture Routes Lack Origin Protection

- **Files:**
  - `next-app/lib/server/auth/dev-quick-login.ts:28-32`
  - `next-app/app/api/dev/demo-project/route.ts:8-25`
  - `next-app/app/api/dev/test-project/route.ts:10-40`
  - `next-app/app/api/dev/test-home-state/route.ts:33-70`

The preview-only dev fixture routes are gated by `isDevQuickLoginAllowed()`, which permits preview deployments when `ENABLE_DEV_QUICK_LOGIN=1`. Unlike `/api/dev/quick-login`, these routes do not perform an origin check before mutating preview fixture data.

This is lower-severity because it is preview/test-only and tied to explicit enablement, but it is still worth tightening.

### Gap B — Browser Security Headers / CSP Are Missing

- **Files:**
  - `next-app/next.config.ts:3-12`
  - `next-app/proxy.ts:16-34`
  - `next-app/app/layout.tsx:41-44`
  - `next-app/app/page.tsx:11-32`

The app currently has no repo-managed CSP, HSTS, frame-ancestors, referrer policy, or permissions policy setup. The presence of inline scripts in `app/layout.tsx` and `app/page.tsx` means a good CSP needs deliberate nonce/hash work, but right now the browser-side hardening layer is minimal.

This is a hardening gap rather than a direct exploit on its own.

### Gap C — CI Security Automation Is Thin

- **Files:**
  - `.github/workflows/ci.yml:1-49`
  - `.github/dependabot.yml` (missing)
  - `.github/workflows/codeql.yml` (missing)

The main CI workflow does not declare explicit job or workflow permissions, and the repo does not currently commit Dependabot or CodeQL configuration. That leaves the security posture more dependent on out-of-band GitHub settings and manual review than it should be.

This is governance/security-hygiene debt rather than an application vulnerability.

## Positive Controls Re-Verified

These controls looked healthy in the audited snapshot:

- `next-app/app/api/ai/stream/route.ts` validates project access before tool execution.
- `next-app/app/api/cron/study-processing/route.ts` and `next-app/app/api/internal/study-processing/route.ts` keep cron and internal auth boundaries separated and secret-backed.
- `next-app/lib/server/study-processing.ts` now pins internal dispatcher kicks to trusted configured base URLs rather than request `Origin`.
- `next-app/lib/server/file-storage.ts` validates canonical storage namespace before privileged fetch and delete.
- `next-app/lib/server/access.ts` remains the core project-ownership gate.
- No unsafe Prisma raw SQL (`$queryRawUnsafe` / `$executeRawUnsafe`) was found.
- Telemetry ingestion policy is more disciplined than many repos: anonymous payload types are constrained and rate-limited in `next-app/lib/server/telemetry-policy.ts`.
- Langfuse tracing is comparatively careful about not tracing raw message content by default in `next-app/lib/server/ai/tracing.ts`.

## Recommended Fix Order

1. **Make canonical project files private.** This is the biggest trust-boundary problem because it affects study PDFs, exports, and chat attachments.
2. **Bring `/api/ai/transcribe` under AI rate-limit and usage controls.**
3. **Remove raw AI response content from PDF extraction logs.**
4. Add origin/CSRF parity to preview dev fixture routes when preview quick login is enabled.
5. Add repo-managed CSP/security-header hardening.
6. Add CI security automation and explicit workflow permission declarations.

## Notes On Audit Scope

This was a repository security audit, not a live infrastructure penetration test. It did not validate external GitHub settings, Vercel dashboard settings, Supabase bucket policy configuration in the dashboard, or deployed edge/network controls beyond what is expressed in the repository.
