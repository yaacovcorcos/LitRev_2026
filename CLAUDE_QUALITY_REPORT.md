# LitRev 2026 - Architecture & Code Quality Report

**Generated:** February 2, 2026
**Analyzed by:** Claude Code
**Cross-referenced with:** Codex Quality Report

---

## Executive Summary

LitRev 2026 is an **AI-powered research literature review platform** built with modern technologies (Next.js 16, React 19, Prisma 7, PostgreSQL). The project demonstrates solid architectural foundations with clear separation of concerns and thoughtful design for future scalability. However, there are **critical bugs in the AI memory system**, **security considerations**, **zero test coverage**, and several code quality issues that need attention.

**Overall Score: 3.0/5** - Good foundation with critical gaps

> **Note:** Multi-user readiness is **partially implemented** (schema fields exist) but **not enforced in code**. Ownership/scoping is missing in AI/memory subsystems, and denormalized workspace fields aren't populated. Future multi-user enablement will require meaningful refactoring.

---

## Table of Contents

1. [What Has Been Done Well](#1-what-has-been-done-well)
2. [Critical Issues Requiring Attention](#2-critical-issues-requiring-attention)
3. [What Remains To Be Done](#3-what-remains-to-be-done)
4. [What Should Be Improved](#4-what-should-be-improved)
5. [Code Quality Issues](#5-code-quality-issues)
6. [Summary Scorecard](#6-summary-scorecard)
7. [Prioritized Action Plan](#7-prioritized-action-plan)

---

## 1. What Has Been Done Well

### Architecture Strengths

| Area | Implementation | Quality |
|------|----------------|---------|
| **Tech Stack** | Next.js 16 + React 19 + TypeScript (strict) | ⭐⭐⭐⭐⭐ |
| **Database Design** | Prisma 7 + PostgreSQL with 14 well-structured models | ⭐⭐⭐⭐ |
| **AI Integration** | Pluggable provider pattern, streaming support, memory system | ⭐⭐⭐⭐⭐ |
| **Multi-user Ready** | Schema supports workspaces, users, roles (scaffolded) | ⭐⭐⭐⭐ |
| **Component Architecture** | Modular components, Context API, CSS Modules | ⭐⭐⭐⭐ |
| **Server Actions** | Type-safe RPC pattern, centralized in `/app/actions/` | ⭐⭐⭐⭐ |
| **Documentation** | PRD, architecture docs, glossary, file index | ⭐⭐⭐⭐ |

### Specific Accomplishments

1. **Evidence-Binding Core Concept** - The application is built around traceability of claims to sources
2. **Structured Memory System** - Three-tier memory (User → Project → Study) for AI context
3. **Rate Limiting** - Token-based rate limiting with daily caps
4. **Connection Pooling** - Proper Supabase pooling for serverless
5. **Editable Component Library** - Reusable `EditableText`, `EditableList`, `EditableChips`
6. **React Compiler Enabled** - Automatic memoization for performance
7. **Streaming AI Responses** - Server-Sent Events for real-time chat
8. **Clean Git Hygiene** - Secrets properly gitignored, never committed

### Technology Stack Details

```
Frontend:
├── Next.js 16.1.4 (App Router)
├── React 19.2.0
├── TypeScript 5.x (strict mode)
├── TipTap 3.17.1 (rich text editor)
├── React Markdown 10.1.0
└── CSS Modules + Design Tokens

Backend:
├── Next.js Server Actions
├── Prisma 7.3.0
├── PostgreSQL (via Supabase)
├── OpenAI API (GPT-5.2)
└── Supabase Storage

Infrastructure:
├── Vercel (deployment)
├── Supabase (database + storage)
└── Connection pooling (PgBouncer)
```

---

## 2. Critical Issues Requiring Attention

### 2.1 Critical Bug: User ID Mismatch in AI Memory

| Issue | Severity | Impact |
|-------|----------|--------|
| **User ID Mismatch** | 🔴 HIGH | Memory writes will fail with FK constraint violation |

**The Problem:**
- `SINGLE_USER_SCOPE` uses `ownerId: "local-user"` ([lib/server/scope.ts:8](next-app/lib/server/scope.ts#L8))
- `AIService.chatWithMemory` defaults to `userId: "default-user"` ([lib/server/ai/ai-service.ts:123](next-app/lib/server/ai/ai-service.ts#L123))
- `UserMemory.userId` has a **required FK to User table**

**Result:** Any memory creation for "default-user" will fail unless that user is seeded. This is a **real bug** that will break memory writes once the feature is used.

**Fix:** Unify user identity - either:
1. Change AI service to use `"local-user"` consistently, OR
2. Implement proper auth context that both systems share

### 2.2 Security Considerations

| Issue | Severity | Location | Status |
|-------|----------|----------|--------|
| **No Authentication** | HIGH | `lib/server/scope.ts` | Hardcoded `SINGLE_USER_SCOPE` |
| **XSS Risk** | HIGH | `components/ProjectCopilot.tsx:408` | `ReactMarkdown` without sanitization |
| **File Upload Gaps** | HIGH | `lib/server/files.ts` | No file type validation |
| **SSL Mode** | MEDIUM | `lib/server/prisma.ts:10` | `sslmode=no-verify` |
| **Secrets in Git** | ✅ SAFE | `.env.local`, `secrets.local.md` | Properly gitignored, never committed |

#### Authentication Gap

```typescript
// lib/server/scope.ts:8-11 - Current implementation
export const SINGLE_USER_SCOPE: ServiceScope = {
  ownerId: "local-user",
  workspaceId: "local-workspace",
};
```

**Impact:** All requests use hardcoded scope - no real user identification.

**Recommendation:** Implement NextAuth, Clerk, or Auth0 for proper authentication.

#### XSS Vulnerability

```typescript
// components/ProjectCopilot.tsx:408-411 - Missing sanitization
<ReactMarkdown remarkPlugins={[remarkGfm]}>
    {msg.text}
</ReactMarkdown>
```

**Fix:** Add `rehype-sanitize` plugin:
```typescript
import rehypeSanitize from "rehype-sanitize";

<ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeSanitize]}
>
    {msg.text}
</ReactMarkdown>
```

### 2.3 Fragile Server Action Initialization

**The Problem:** Server actions for protocols, drafts, ledger, files, and copilot **don't call `ensureSingleUserSeed`**.

| Server Action | Calls `ensureSingleUserSeed`? |
|---------------|-------------------------------|
| `projects.ts` | ✅ Yes |
| `protocols.ts` | ❌ No |
| `drafts.ts` | ❌ No |
| `ledger.ts` | ❌ No |
| `files.ts` | ❌ No |
| `copilot.ts` | ❌ No |

**Impact:** A direct deep-link to a project page (e.g., `/project/123/protocol`) before loading the project list could fail if the user/workspace seed isn't present.

**Current Workaround:** Root Providers call `listProjectsAction`, which seeds the user, so it often works. But this is a fragile ordering dependency.

**Fix:** Either:
1. Call `ensureSingleUserSeed` in all server actions, OR
2. Add app-level bootstrap that guarantees seeding before any action

### 2.4 Zero Test Coverage

| Metric | Status |
|--------|--------|
| Unit Tests | ❌ None |
| Integration Tests | ❌ None |
| E2E Tests | ❌ None |
| Test Framework | ❌ Not configured |
| CI/CD Pipeline | ❌ No GitHub Actions |
| Pre-commit Hooks | ❌ None |
| Code Coverage | ❌ Not measured |

**Risk:** No automated quality assurance, no regression prevention, no safety net for refactoring.

---

## 3. What Remains To Be Done

### High Priority (Week 1-2)

- [ ] **Implement Real Authentication**
  - Replace `SINGLE_USER_SCOPE` with NextAuth/Clerk/Auth0
  - Add middleware for session validation
  - Scope all queries by authenticated user

- [ ] **Set Up Testing Infrastructure**
  - Install Jest/Vitest + React Testing Library
  - Create GitHub Actions CI/CD pipeline
  - Add pre-commit hooks with Husky + lint-staged

- [ ] **Fix Security Vulnerabilities**
  - Add XSS sanitization to markdown rendering
  - Implement file upload validation (whitelist, size limits)
  - Enable SSL verification for database
  - Add CORS headers to API routes

### Medium Priority (Week 3-4)

- [ ] **Populate Denormalized Fields**
  - `Study.workspaceId` never populated in `lib/server/ledger.ts`
  - `FileAsset.workspaceId` never populated
  - Currently breaks workspace-level queries

- [ ] **Add Input Validation**
  - Use Zod schemas for all server action inputs
  - Validate AI message lengths
  - Add bounds checking for configuration

- [ ] **Fix Rate Limiting**
  - Currently per-project only, not per-user
  - Add `(userId, projectId)` composite rate limits

### Lower Priority (Month 2+)

- [ ] **Implement Missing Features**
  - File attachment backend (TODO in code)
  - Conversation pagination
  - Full-text search with PostgreSQL

- [ ] **Refactor Large Components**
  - `app/ai/page.tsx` - 910 lines → split into components
  - `contexts/ProjectCopilotContext.tsx` - 603 lines → extract streaming logic

### Feature Roadmap (from PRD)

The following features are scaffolded but not yet implemented:

| Feature | Status | Notes |
|---------|--------|-------|
| **AI Responses API migration** | Not started | Currently using Chat Completions |
| **AI verification pipeline** | Not started | For claim verification |
| **PDF extraction → Study.details** | Not started | Parse uploaded PDFs |
| **Evidence Ledger expand rows** | Not started | Study detail in-page expansion |
| **Study-specific copilot** | Scaffolded | Context exists, UI not wired |
| **Protocol-Ledger PRISMA flow** | Not started | Systematic review workflow |
| **Citation insertion in Draft** | Not started | Ledger-bound writing |
| **Export file generation** | Mocked | Currently returns placeholder data |

---

## 4. What Should Be Improved

### 4.1 Code Organization - DRY Violations

**`isBrowser()` function duplicated in 7 files:**
- `lib/storage.ts`
- `lib/draftStorage.ts`
- `lib/projectCopilotStorage.ts`
- `lib/protocolStorage.ts`
- `lib/ledgerStorage.ts`
- `lib/chatStorage.ts`
- `lib/seedLocalStorage.ts`

**Recommendation:** Extract to shared utility:
```typescript
// lib/utils/browser.ts
export function isBrowser(): boolean {
  return typeof window !== "undefined";
}
```

### 4.2 Magic Numbers/Strings

Found 15+ magic values without constants:

```typescript
// Current (scattered throughout code)
scrollHeight - 80
Math.min(e.target.scrollHeight, 200)
width: 360
clampNumber(parsed.panel.width, 300, 560)
content.slice(0, 47) + "..."

// Recommended: Create constants file
// lib/constants/ui.ts
export const UI_CONSTANTS = {
  COPILOT_MIN_WIDTH: 300,
  COPILOT_MAX_WIDTH: 560,
  COPILOT_DEFAULT_WIDTH: 360,
  MAX_TEXTAREA_HEIGHT: 200,
  SCROLL_THRESHOLD: 80,
  TITLE_TRUNCATE_LENGTH: 47,
};
```

### 4.3 Type Safety Gaps

**11 instances of `any` type casts:**

| Location | Issue |
|----------|-------|
| `lib/server/ledger.ts:90, 105, 129, 197` | `details` field cast as `any` |
| `lib/server/protocols.ts:25, 26` | `data: data as any` |
| `lib/server/files.ts:94` | `metadata: input.metadata as any` |
| `lib/server/projects.ts:27` | `JSON.parse(JSON.stringify(value)) as any` |
| `lib/server/ledger.ts:118` | `prisma.$transaction(async (tx: any) =>` |

**Recommendation:** Use proper Prisma types and Zod for JSON validation.

### 4.4 Database Improvements

| Issue | Location | Fix |
|-------|----------|-----|
| Missing indexes | `(projectId, workspaceId)` on Study | Add composite index |
| N+1 in memory retrieval | `lib/server/memory/memory-retrieval.ts` | Single query with JOIN |
| No conversation pagination | `lib/server/ai/memory.ts` | Add `take`/`skip` params |
| JSON fields unvalidated | Protocol, Draft, details | Add Zod schemas |

### 4.5 Error Handling Inconsistency

**Current state:**
- Some actions: try-catch with logging
- Most actions: no error handling at all
- No standardized error response format

**Recommendation:** Create error handling utility:
```typescript
// lib/utils/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
  }
}

export function handleActionError(error: unknown): never {
  console.error("Action error:", error);
  if (error instanceof AppError) throw error;
  throw new AppError("An unexpected error occurred", "INTERNAL_ERROR");
}
```

### 4.6 Inconsistent LocalStorage Fallback

**Current state:**
- Projects context has localStorage fallback for offline use
- Protocol, Draft, Ledger, Copilot contexts do **NOT** have fallback

| Context | localStorage Fallback? |
|---------|------------------------|
| `ProjectsContext` | ✅ Yes |
| `ProtocolContext` | ❌ No |
| `LedgerContext` | ❌ No |
| `ProjectCopilotContext` | ❌ No |

**Impact:** UX inconsistency - some features work offline, others don't.

**Recommendation:** Either add fallback to all contexts or remove from Projects for consistency.

### 4.7 Ownership Scoping Gaps in AI/Memory

**`assertProjectAccess` is correctly applied in core services:**
- ✅ `projects.ts`
- ✅ `protocols.ts`
- ✅ `drafts.ts`
- ✅ `ledger.ts`
- ✅ `files.ts`

**But AI and memory subsystems bypass ownership entirely:**
- ❌ `lib/server/ai/memory.ts` - No user/workspace scoping
- ❌ `lib/server/ai/ai-service.ts` - No ownership validation
- ❌ `lib/server/memory/*.ts` - No access control

**This is the biggest architectural gap** relative to the "multi-user ready" plan. AI conversations and memory retrieval are completely unscoped.

---

## 5. Code Quality Issues

### 5.1 Anti-Patterns Found

| Anti-Pattern | Location | Impact |
|--------------|----------|--------|
| Scope passed everywhere | Every service function | Verbose, error-prone |
| Placeholder auth hardcoded | Multiple files | Security risk |
| No API versioning | All server actions | Breaking changes risk |
| Transactions with `any` | `lib/server/ledger.ts:118` | Type safety lost |
| ESLint rules disabled | Multiple components | Rules bypassed |

### 5.2 Large Components Needing Refactoring

| Component | Lines | Issues |
|-----------|-------|--------|
| `app/ai/page.tsx` | 910 | Mixes UI, state, data logic |
| `contexts/ProjectCopilotContext.tsx` | 603 | Streaming logic embedded |
| `components/ProjectCopilot.tsx` | 546 | Multiple responsibilities |

### 5.3 Duplicated Code Examples

**Time formatting (duplicated 3+ times):**
```typescript
// ProjectCopilot.tsx:157-159
const minutes = Math.floor(diff / (1000 * 60));
const hours = Math.floor(diff / (1000 * 60 * 60));
const days = Math.floor(diff / (1000 * 60 * 60 * 24));

// Also in app/project/[id]/page.tsx and app/ai/page.tsx
```

**Message filtering (duplicated 2+ times):**
```typescript
// ProjectCopilotContext.tsx:177-184
const copilotMessages = convo.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({...}));

// Also in app/ai/page.tsx:48-56
```

### 5.4 Console Statements

Found 57+ console statements (mostly `console.error`/`console.warn` which are acceptable for error logging, but some debug logs should be removed for production).

---

## 6. Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| **Architecture** | 4.0/5 | Solid modular monolith, matches planB strategy |
| **Security** | 2.0/5 | Auth placeholder, XSS risk, file upload gaps |
| **Testing** | 0/5 | Zero test coverage |
| **Code Quality** | 3.0/5 | Good patterns but inconsistent |
| **Documentation** | 4.0/5 | Good project docs (PRD, DB_ARCHITECTURE, FILE_INDEX, GLOSSARY) |
| **Database** | 3.5/5 | Well-designed but denormalized fields unpopulated |
| **Frontend** | 3.8/5 | Modern stack, some large components |
| **Backend** | 3.0/5 | Good patterns, but AI/memory subsystem bypasses ownership |
| **Multi-user Readiness** | 2.0/5 | Schema ready, code not enforcing |

**Overall: 3.0/5** - Good foundation with critical gaps

### Key Architectural Assessment

> "Overall architecture is solid for a modular monolith and matches the planB strategy, but multi-user readiness is only partially real: ownership/scoping is missing in AI/memory and denormalized workspace fields aren't populated."
>
> — Codex Quality Report

---

## 7. Prioritized Action Plan

### Week 1: Critical Bugs & Security

- [ ] **Fix User ID mismatch** - Unify `"local-user"` vs `"default-user"` in AI memory
- [ ] Add `rehype-sanitize` to markdown rendering (XSS fix)
- [ ] Enable SSL verification for database connection
- [ ] Add file upload validation (type whitelist, size limits)
- [ ] Add `ensureSingleUserSeed` to all server actions (or bootstrap)

### Week 2: Testing Foundation

- [ ] Set up Jest/Vitest + React Testing Library
- [ ] Create GitHub Actions CI/CD pipeline
- [ ] Add Husky pre-commit hooks
- [ ] Add ESLint to CI/CD with auto-check
- [ ] Configure Prettier for code formatting

### Week 3-4: Core Fixes

- [ ] Implement authentication (NextAuth/Clerk)
- [ ] Add ownership scoping to AI/memory subsystem
- [ ] Add Zod validation to server actions
- [ ] Populate `workspaceId` on Study and FileAsset creation
- [ ] Write tests for critical paths (AI chat, project CRUD)

### Month 2: Quality Improvements

- [ ] Extract shared utilities (DRY cleanup)
- [ ] Refactor large components
- [ ] Add comprehensive test coverage (target: 70%)
- [ ] Implement proper error handling pattern
- [ ] Add constants for magic numbers
- [ ] Make SSL verification environment-driven

### Month 3: Feature Completion

- [ ] Performance optimization
- [ ] Add conversation pagination
- [ ] Implement PDF extraction → Study.details
- [ ] Citation insertion in Draft
- [ ] Complete multi-user authentication
- [ ] Add monitoring/observability

### Open Questions to Resolve

1. Is SSL verification disabled intentionally for production, or only as a dev workaround?
2. Do you want AI memory writes enabled now, or should they remain dormant until auth is implemented?
3. Do you want localStorage fallbacks everywhere (offline support) or only for Projects?

---

## Appendix A: File Structure Overview

```
LitRev_2026/
├── next-app/
│   ├── app/                    # Next.js App Router
│   │   ├── actions/            # Server Actions (9 files)
│   │   ├── api/ai/stream/      # Streaming API endpoint
│   │   ├── project/[id]/       # Dynamic project routes
│   │   └── ai/                 # AI chat interface
│   ├── components/             # React components (~17 files)
│   ├── contexts/               # React Context providers (4 files)
│   ├── lib/
│   │   ├── server/             # Backend logic
│   │   │   ├── ai/             # AI service, providers, rate limiting
│   │   │   └── memory/         # Memory system
│   │   └── [storage utils]     # LocalStorage utilities
│   ├── types/                  # TypeScript definitions
│   ├── styles/                 # Global CSS + modules
│   └── prisma/                 # Database schema
├── PRD.md                      # Product requirements
├── DB_ARCHITECTURE.md          # Database documentation
├── FILE_INDEX.md               # Codebase map
└── GLOSSARY.md                 # Domain terms
```

---

## Appendix B: Database Schema Summary

**14 Models:**
- User, Workspace, WorkspaceMember (auth scaffold)
- Project, Protocol, Draft, Study, FileAsset (core entities)
- AIConversation, AIMessage, AIUsage (AI features)
- UserMemory, ProjectMemory, StudyMemory, ConversationSummary, MemoryRetrieval (memory system)

---

## Conclusion

LitRev 2026 has a **solid architectural foundation** with modern technologies and thoughtful design patterns. The modular monolith structure aligns with the planB strategy, and the AI integration is well-architected with a pluggable provider system and structured memory.

**Biggest real defects to fix first:**
1. **AI memory userId mismatch** - Will cause FK constraint failures
2. **Missing ownership scoping in AI/memory** - Security gap
3. **XSS vulnerability in markdown rendering** - User safety
4. **TLS verification disabled by default** - Production security

The highest priority actions are:
1. **Fix the user ID mismatch bug** (immediate)
2. **Add XSS sanitization** (immediate)
3. **Establish testing infrastructure** (this week)
4. **Implement real authentication** (this month)

With these foundations in place, the existing architecture will support scaling to production quality.

---

## Appendix C: Cross-Reference with Codex Report

This report was improved by cross-referencing findings from the Codex Quality Report. Key additions from Codex:

| Finding | Source | Impact |
|---------|--------|--------|
| User ID mismatch bug (`local-user` vs `default-user`) | Codex | Critical bug - added to Section 2.1 |
| Missing `ensureSingleUserSeed` in server actions | Codex | Fragile init - added to Section 2.3 |
| Inconsistent localStorage fallback | Codex | UX issue - added to Section 4.6 |
| AI/memory ownership scoping gap | Codex | Security - added to Section 4.7 |
| "Replace-all" semantics in `replaceStudies` | Codex | Noted for future optimization |

---

*This report was generated by Claude Code on February 2, 2026.*
*Cross-referenced with Codex Quality Report for completeness.*
