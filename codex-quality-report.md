# Codex Quality Report

Date: 2026-02-02
Scope: Repository architecture and quality review (overall + detail level).

## Findings (ordered by severity)
- High: Single-user identity mismatch between AI memory and core scope will break memory writes once used. `AIService.chatWithMemory` defaults to `userId = "default-user"` while the single-user scope uses `local-user`; `UserMemory.userId` has a required FK to `User`, so any memory creation for “default-user” will fail unless you seed that user. This is a real bug once memory writes happen. `next-app/lib/server/ai/ai-service.ts`, `next-app/lib/server/scope.ts`, `next-app/prisma/schema.prisma`
- High: AI conversations and memory retrieval are unscoped by user/workspace, so multi-user safety is not actually ready yet. It’s acceptable for single-user, but it conflicts with the “multi-user ready” plan and will require refactors later. `next-app/lib/server/ai/memory.ts`, `next-app/lib/server/memory/*.ts`, `next-app/prisma/schema.prisma`
- Medium: `Study.workspaceId` and `FileAsset.workspaceId` are present for denormalized scoping but never written; they stay `NULL` and can’t support the “multi-user ready” query plan later without backfilling. Not wrong today, but it undermines the stated architecture decision. `next-app/lib/server/ledger.ts`, `next-app/lib/server/files.ts`, `next-app/prisma/schema.prisma`
- Medium: SSL verification is explicitly disabled by default in the Prisma pg pool by replacing `sslmode=require` with `sslmode=no-verify`. This is likely a security foot-gun in production unless it’s strictly scoped to local dev. This is genuinely risky if you rely on TLS verification. `next-app/lib/server/prisma.ts`
- Medium: Server actions for protocols, drafts, ledger, files, and project copilot don’t call `ensureSingleUserSeed`, so a direct deep-link to a project page before any project list load could fail if the user/workspace seed isn’t present. In practice the root Providers call `listProjectsAction`, so it often works, but it’s still a fragile ordering dependency. `next-app/app/actions/*.ts`, `next-app/app/providers.tsx`
- Low: Local fallback behavior is inconsistent: Projects have local fallback, but Protocol/Draft/Ledger/Copilot don’t. This is a quality/UX inconsistency, not necessarily wrong. `next-app/contexts/*.tsx`, `next-app/lib/*Storage.ts`

## Open Questions / Assumptions
- Is SSL verification disabled intentionally for production, or only as a dev workaround?
- Do you want AI memory writes enabled now, or should they remain dormant until auth is implemented?
- Do you want localStorage fallbacks everywhere (offline) or only for Projects?

## Architecture Diagnosis (overall)
- Modular monolith is consistent: data access lives in `lib/server/*`, UI in `app/` + `components/` + `contexts/`, and server actions are thin transports. This aligns with the planB “service layer + server actions first” decision.
- Data modeling is coherent: relational core (Project/Study/FileAsset) with JSONB for Protocol/Draft/Copilot state, which matches the flexible early-stage requirement.
- AI layer is reasonably separated: provider abstraction, rate limiter, memory retrieval, and streaming API route are clean boundaries.
- Multi-user readiness is partially implemented (schema fields exist) but not enforced in code, and some columns are not being populated. That means future multi-user enablement will still require a meaningful refactor (auth context + scoping + backfill).

## Architecture Diagnosis (detail-level)
- Ownership boundaries: `assertProjectAccess` is correctly applied in core services (projects/protocols/drafts/ledger/files), but AI and memory subsystems bypass ownership entirely. That’s the biggest architectural gap relative to the plan.
- Scope design: `SINGLE_USER_SCOPE` is a good placeholder, but it’s not wired through AI/memory, creating an identity split that will fail when memory tables are used.
- Storage strategy: JSONB for draft/protocol is consistent with the evolving schema; the code respects that with debounced saves and direct JSON persistence.
- Data lifecycle: `replaceStudies` is transaction-safe, but it’s “replace-all” semantics. This is acceptable for early prototypes; for production you’ll want incremental upserts or diffing.
- Ops configuration: Server Actions body size increased, and `runtime = "nodejs"` is set where Prisma is used, which is correct for the current stack.

## What’s Done
- Prisma + schema + migrations in place; DB connected.
- Service layer modules created and used by server actions.
- Projects, Protocol, Draft, Ledger, Copilot persistence working end-to-end.
- LocalStorage migration to backend implemented.
- FileAsset + Supabase storage upload wired (metadata + public URLs).
- AI subsystem scaffolded: provider abstraction, rate limiting, streaming API route, basic conversation history + memory tables.

## What Remains
- AI: migrate to Responses API, verification pipeline, regenerate, PDF extraction → Study.details.
- Evidence Ledger UX: expand rows, study detail page, study-specific copilot.
- Protocol-Ledger integration + PRISMA flow data.
- Draft: citation insertion + ledger-bound writing + export formats.
- Multi-user enablement: real auth, scoped queries, and backfill of `workspaceId` on Study/FileAsset.
- Actual export file generation (currently mocked).

## Quality Issues to Fix (prioritized)
- Unify user identity for AI memory with `SINGLE_USER_SCOPE` (or add a proper auth/identity provider now).
- Add ownership scoping to AI conversations, memory tables, and usage tracking before enabling multi-user.
- Populate `workspaceId` for Study and FileAsset at creation to preserve the intended denormalized query path.
- Make SSL verification behavior environment-driven; do not disable verification in production by default.
- Remove implicit dependency on “ProjectsProvider ran first” by seeding in other server actions or performing seed at app bootstrap.

## Final Report (concise)
- Overall architecture is solid for a modular monolith and matches the planB strategy, but multi-user readiness is only partially real: ownership/scoping is missing in AI/memory and denormalized workspace fields aren’t populated.
- Core persistence (Projects/Protocol/Draft/Ledger/Files) is done and consistent with DB_ARCHITECTURE; AI and memory systems are scaffolded but not fully wired for correctness in a real multi-user environment.
- Biggest real defects: AI memory userId mismatch, missing ownership scoping in AI/memory, and TLS verification disabled by default. These should be prioritized before scaling or enabling memory writes.
- Process gap: governance files required by the PRD are missing; add them to maintain auditability.
