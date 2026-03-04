# Authentication Implementation Report — LitRev 2026

**Date:** February 25, 2026
**Status:** Proposal (pending approval)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
3. [Library Selection: Why Better Auth](#3-library-selection-why-better-auth)
4. [Patterns Stolen from Reference Repos](#4-patterns-stolen-from-reference-repos)
5. [Architecture Design](#5-architecture-design)
6. [Schema Changes](#6-schema-changes)
7. [Implementation Plan](#7-implementation-plan)
8. [Migration Strategy: Single-User to Multi-User](#8-migration-strategy-single-user-to-multi-user)
9. [Security Hardening](#9-security-hardening)
10. [Future-Proofing for Collaboration](#10-future-proofing-for-collaboration)
11. [Production Cutover Runbook](#11-production-cutover-runbook)
12. [Risk Assessment](#12-risk-assessment)

---

## 1. Executive Summary

LitRev 2026 was built with multi-user architecture in mind (User, Workspace,
WorkspaceMember models already exist, all models carry workspace/user scoping
fields) but currently runs on hardcoded placeholder IDs (`"local-user"` /
`"local-workspace"`). The time has come to wire real authentication.

**Key decision change from Phase 10 plan:** The original plan specified Auth.js
v5 + `@auth/prisma-adapter`. However, **Auth.js was officially absorbed into
Better Auth in September 2025** and is now in maintenance mode (security patches
only). Better Auth is the recommended successor with first-class Prisma support
and an organization plugin for future collaboration.

**Recommended stack:**
- **Better Auth** — open source, self-hosted, zero cost, first-class Prisma adapter
- **Google OAuth** + **Email magic links** (via Resend) — same providers as Phase 10 planned
- **Database sessions** (not JWT) — same as Phase 10 planned
- **Actor context pattern** (stolen from OpenCode) — type-safe authorization without parameter drilling

---

## 2. Current State Assessment

### What's Already Multi-User Ready

The codebase is architecturally prepared. This is a strength — the migration is
primarily about replacing placeholder values, not restructuring the data model.

| Layer | Current State | Multi-User Ready? |
|-------|--------------|-------------------|
| **Prisma schema** | User, Workspace, WorkspaceMember exist; all models carry `userId`/`workspaceId` | Yes |
| **ServiceScope type** | `{ ownerId, workspaceId }` used everywhere | Yes (swap values) |
| **Service layer** | `assertProjectAccess()` checks `ownerId` + `workspaceId` | Yes |
| **Server actions** | Call `getCurrentUserContext()` → returns placeholder | Swap placeholder |
| **API routes** | `/api/ai/stream`, `/api/ai/transcribe` accept `userId` from client | Needs server-side validation |
| **Proxy (middleware)** | Does not exist | Must create (`proxy.ts`) |
| **Frontend** | No user/auth context provider | Must create |

### Placeholder IDs (Two Systems, Need Unification)

There are currently **two different placeholder ID sets** — a known bug from the
quality report:

| File | userId | workspaceId |
|------|--------|-------------|
| `lib/server/scope.ts` (`SINGLE_USER_SCOPE`) | `"local-user"` | `"local-workspace"` |
| `app/actions/conversations.ts` (`getCurrentUserContext`) | `"single-user"` | `"single-workspace"` |

This identity split can cause FK errors (e.g., UserMemory writes). Must unify
before or during auth migration.

### Security Gaps (from QUALITY_REPORT.md)

1. **Critical:** No auth on AI cost-bearing endpoints (`/api/ai/stream`, `/api/ai/transcribe`)
2. **High:** Conversation operations allow ID-based access without ownership checks (IDOR risk)
3. **High:** Memory actions trust client-supplied scope
4. **High:** AI rate limiting can be bypassed via client-supplied `projectId`

All of these are resolved by implementing real auth.

### Denormalized workspaceId Fields Never Populated

The schema declares `workspaceId` on `Study` and `FileAsset` for query
efficiency, but the service layer never sets them:
- `ledger.ts` `upsertStudy()` / `study.create()` — no `workspaceId` in data
- `files.ts` `createFileAsset()` — no `workspaceId` in data

These must be backfilled from the parent project's workspace during auth
migration, and the create paths updated to populate them going forward.

### Production TLS Config

`prisma.ts:13` replaces `sslmode=require` with `sslmode=no-verify` for
non-local databases. This disables certificate verification in production and
should be fixed during the auth hardening phase.

---

## 3. Library Selection: Why Better Auth

### The Auth.js Situation

The Phase 10 plan specified Auth.js v5 + `@auth/prisma-adapter`. This is now
outdated:

- Auth.js v5 **never reached a stable release** (2+ years in beta)
- Its main contributor (Balazs Orban) left in January 2025
- In September 2025, **Auth.js was officially absorbed into Better Auth**
- Auth.js now receives security patches only; all new development happens in Better Auth
- Auth.js itself now has a migration guide pointing to Better Auth

### Comparison for Our Use Case

| Criterion | Better Auth | Auth.js v5 | Clerk | Supabase Auth |
|-----------|-------------|------------|-------|---------------|
| **Status** | Active, growing | Maintenance mode | Active | Active |
| **Cost** | Free (self-host) | Free | $0–$25+/mo | $0–$25+/mo |
| **Prisma adapter** | First-class (joins since v1.4) | Official adapter | Webhook sync only | Dual-DB required |
| **Next.js 16 support** | Full (including proxy rename) | Full | Full | Full |
| **Organization plugin** | Built-in plugin | Manual | Built-in | Manual (RLS) |
| **Data ownership** | Our PostgreSQL DB | Our DB | Clerk's servers | Supabase's DB |
| **Community** | Absorbed Auth.js community | Declining | Large | Large |

### Why Not the Others

- **Auth.js v5:** Dead project walking. We'd be building on abandoned software.
- **Clerk:** Excellent DX but vendor lock-in, no native Prisma adapter, user
  data on external servers. For a research tool handling academic data, we want
  data sovereignty.
- **Supabase Auth:** We already use Supabase Postgres as the primary deployed
  database (via Prisma) and Supabase Storage for files. We intentionally do not
  use Supabase Auth because Better Auth already manages identity/session tables
  in the same database. Better Auth is the sole identity authority in this
  project.

### Better Auth Specifics

- **Version:** v1.4.19 stable (v1.5.0 beta available)
- **License:** MIT
- **Prisma adapter:** `@better-auth/prisma` with experimental joins for efficient queries
- **Session model:** Database sessions (not JWT) — stored in our PostgreSQL
- **Plugin system:** Organization, two-factor, passkeys, multi-session, admin
- **Next.js integration:** Works with Server Components, Server Actions, Route
  Handlers, and Middleware/Proxy
- **TypeScript:** First-class types throughout

---

## 4. Patterns Stolen from Reference Repos

### From OpenCode: Actor Context Pattern (HIGH VALUE)

OpenCode's best pattern is their **Actor-based authorization** — a type-safe way
to carry auth context through the entire request lifecycle without parameter drilling.

**Their approach:**
```typescript
type Actor = Account | Public | User | System

// Set once at the request boundary
await Actor.provide("user", { userID, workspaceID, accountID, role }, () => {
  // All nested operations can call:
  Actor.workspace()  // → current workspaceId
  Actor.userID()     // → current userId
  Actor.assertAdmin() // → throws if not admin
})
```

**Our adaptation:** We already have `ServiceScope` (`{ ownerId, workspaceId }`).
We'll evolve this into an Actor context using `AsyncLocalStorage` so that:
- Auth proxy redirects unauthenticated users; `withAuth()` sets the actor
- All server actions and service functions read from it
- No more passing `scope` through every function signature
- Type-safe role assertions (`assertOwner()`, `assertMember()`)

This eliminates the current pattern where every action calls
`getCurrentUserContext()` and passes it down manually.

### From OpenCode: Provider Account Linking by Email (HIGH VALUE)

OpenCode links OAuth accounts to existing users by matching on verified email,
not just provider subject ID. This prevents duplicate identities when users
sign in with Google and later try magic link (or vice versa):

```typescript
// On OAuth callback: look for existing Auth by (provider, subject)
// If not found: look for existing Auth by email across any provider
// If found: link new provider to same Account
// If not found: create new Account
```

**Our adaptation:** Better Auth handles this natively with its account linking
feature, but we should ensure it's enabled and tested — especially the case
where a user signs up via magic link then later clicks "Sign in with Google"
using the same email. Both should land on the same account.

### From OpenCode: Deferred Account Binding (MEDIUM VALUE)

OpenCode allows inviting collaborators by email before they have an account.
When they sign up, the system auto-links:

```typescript
// On signup, find any pending invitations for this email
const invitations = await tx.update(UserTable)
  .set({ accountID: newAccount.id, email: null })
  .where(eq(UserTable.email, newAccount.email))
```

**Our adaptation:** When we add collaboration (Phase 2), workspace invitations
will use email. On first login, auto-link invited memberships. This means
collaborators can be pre-provisioned before they create accounts.

### From OpenCode: Multi-Account Session Support (LOW VALUE, FUTURE)

OpenCode stores multiple account identities in a single session with a "current"
pointer. Not needed for v1, but good to know the pattern exists for power users
with multiple workspaces.

### From OpenClaw: Rate Limiting with Scopes (HIGH VALUE)

OpenClaw implements per-scope, per-IP rate limiting:
- Separate rate limit buckets for different auth methods
- Loopback exemption for local development
- Sliding window with lockout after N failures
- `safeEqualSecret()` for constant-time comparison

**Our adaptation:** We already have `lib/server/ai/rate-limiter.ts` (Prisma-based).
We'll enhance it to rate-limit on `userId` (from auth session) instead of
client-supplied `projectId`. Add scoped limits: auth attempts, AI calls, and
API rate limits as separate buckets.

### From OpenClaw: Safe Secret Comparison (HIGH VALUE)

OpenClaw uses constant-time comparison for all credential checks. We'll apply
this to any token/secret validation (API keys, webhook signatures, etc.).

```typescript
// Stolen pattern — adapted to our stack
import { timingSafeEqual } from "crypto";

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

---

## 5. Architecture Design

### Request Lifecycle

```
Browser Request
  │
  ▼
┌──────────────────────────────────────────┐
│  Next.js Proxy (proxy.ts)               │
│  • Check Better Auth session cookie      │
│  • Redirect unauthenticated → /login     │
│  • Allow public routes (/login, /signup, │
│    /api/auth/*)                           │
│  • UX convenience only — NOT a security  │
│    boundary                              │
└──────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────┐
│  Server Component / Server Action        │
│  • Call auth.api.getSession(headers)     │
│  • Initialize Actor context (ALS)        │
│  • Actor.userId(), Actor.workspaceId()   │
│  • All service calls use Actor context   │
│  • THIS is the security boundary         │
└──────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────┐
│  Service Layer (lib/server/)             │
│  • Read from Actor (no param drilling)   │
│  • assertProjectAccess() uses Actor      │
│  • Rate limiter uses Actor.userId()      │
└──────────────────────────────────────────┘
```

### File Layout

```
next-app/
├── lib/
│   ├── auth.ts                    # Better Auth server instance
│   ├── auth-client.ts             # Better Auth client instance
│   └── server/
│       ├── actor.ts               # Actor context (AsyncLocalStorage)
│       ├── scope.ts               # ServiceScope (updated, derives from Actor)
│       ├── bootstrap.ts           # Updated: no more placeholder seeding
│       └── access.ts              # Updated: uses Actor
├── app/
│   ├── api/auth/[...all]/route.ts # Better Auth catch-all route handler
│   ├── login/page.tsx             # Login page
│   └── ...
├── proxy.ts                       # Route protection (Next.js 16 naming)
└── components/
    └── AuthProvider.tsx            # Client-side auth context
```

### Actor Context Design

```typescript
// lib/server/actor.ts
import { AsyncLocalStorage } from "async_hooks";

type Actor =
  | { type: "user"; userId: string; workspaceId: string; email: string; role: string }
  | { type: "system" }
  | { type: "public" };

const store = new AsyncLocalStorage<Actor>();

export const Actor = {
  /** Run a function with actor context */
  provide<T>(actor: Actor, fn: () => T): T {
    return store.run(actor, fn);
  },

  /** Get the current actor (throws if none) */
  current(): Actor {
    const actor = store.getStore();
    if (!actor) throw new Error("No actor context. Was this called outside a request?");
    return actor;
  },

  /** Get userId (throws if not a user actor) */
  userId(): string {
    const actor = this.current();
    if (actor.type !== "user") throw new Error("Not authenticated");
    return actor.userId;
  },

  /** Get workspaceId */
  workspaceId(): string {
    const actor = this.current();
    if (actor.type !== "user") throw new Error("Not authenticated");
    return actor.workspaceId;
  },

  /** Get ServiceScope (backwards-compatible) */
  scope(): ServiceScope {
    return { ownerId: this.userId(), workspaceId: this.workspaceId() };
  },

  /** Assert admin role */
  assertOwner(): void {
    const actor = this.current();
    if (actor.type !== "user" || actor.role !== "owner")
      throw new Error("Owner access required");
  },
};
```

This replaces the current pattern where every action does:
```typescript
// BEFORE (current)
const { userId, workspaceId } = getCurrentUserContext();
await someService(userId, workspaceId, ...);

// AFTER (with Actor)
const scope = Actor.scope(); // reads from AsyncLocalStorage
await someService(scope, ...);
// OR — service reads Actor directly, no scope param needed
```

---

## 6. Schema Changes

Better Auth requires specific tables. With the Prisma adapter, these are added
to our existing schema. The User model gets extended, not replaced.

### New/Modified Models

**Migration safety note:** The existing placeholder user (`"local-user"`) has a
null email. Before the `ALTER COLUMN "email" SET NOT NULL` runs, the migration
must backfill it:

```sql
-- Step 1: Backfill null emails on placeholder rows before constraint
UPDATE "User" SET email = 'placeholder@local.invalid'
  WHERE email IS NULL;

-- Step 2: Alter column (Prisma migration handles this)
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
```

This placeholder email is harmless — it's overwritten when the user is deleted
during the first-login claim (Phase 3). The important thing is that the NOT NULL
constraint doesn't fail on existing rows.

```prisma
// ---- Better Auth required tables ----

model User {
  id            String    @id @default(cuid())
  email         String    @unique          // was optional, now required (see migration note above)
  name          String?
  emailVerified Boolean   @default(false)  // NEW: Better Auth needs this
  image         String?                    // NEW: profile picture URL
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Existing relations (unchanged)
  memberships   WorkspaceMember[]
  projects      Project[]          @relation("ProjectOwner")
  memories      UserMemory[]

  // NEW: Better Auth relations
  sessions      Session[]
  accounts      Account[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique              // Session token (indexed for lookups)
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([token])
}

model Account {
  id                String   @id @default(cuid())
  userId            String
  accountId         String                // Provider-side user ID
  providerId        String                // "google", "credential", "email-otp"
  accessToken       String?
  refreshToken      String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope             String?
  idToken           String?
  password          String?               // For credential provider (hashed)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@unique([providerId, accountId])
}

model Verification {
  id         String   @id @default(cuid())
  identifier String                       // email address
  value      String                       // OTP or magic link token
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
}
```

### What Doesn't Change

All existing models (Workspace, WorkspaceMember, Project, Study, FileAsset,
AIConversation, AIMessage, AIUsage, etc.) remain exactly as they are. The only
change to the User model is making `email` required and adding `emailVerified`,
`image`, `sessions`, and `accounts` relations.

---

## 7. Implementation Plan

### Phase 1: Foundation (Core Auth + Placeholder Unification)

**Goal:** Working login/logout with Google OAuth and email magic links.
All endpoints protected from day one.

1. **Unify placeholder IDs first** (pre-migration script)
   - Consolidate `"single-user"` → `"local-user"` and `"single-workspace"` →
     `"local-workspace"` across all tables
   - This eliminates the identity split bug before auth goes live
   - Must happen before any other auth work

2. **Install dependencies**
   - `better-auth` + `@better-auth/prisma`
   - `@better-auth/next-js` (Next.js integration)
   - `resend` (for magic link emails)

3. **Schema migration**
   - Add `Session`, `Account`, `Verification` models
   - Update `User` model (add `emailVerified`, `image`, make `email` required)
   - Run `prisma migrate dev`

4. **Configure Better Auth server**
   - `lib/auth.ts`: Initialize with Prisma adapter, Google OAuth, email OTP
   - Enable account linking by email (so Google + magic link land on same user)
   - Environment variables: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`,
     `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `BETTER_AUTH_URL`

5. **Create API route handler**
   - `app/api/auth/[...all]/route.ts`: Catch-all for Better Auth endpoints

6. **Create login page**
   - `app/login/page.tsx`: Google button + email input for magic link
   - Minimal, clean UI using our design tokens

7. **Add proxy** (Next.js 16 `proxy.ts`, replaces `middleware.ts`)
   - `proxy.ts`: Redirect unauthenticated users to `/login`
   - Allow public routes: `/login`, `/api/auth/*`, public assets
   - Defense-in-depth: also validate session in server actions via `withAuth()`
     (never trust proxy alone — see CVE-2025-29927)

8. **Add client provider**
   - `components/AuthProvider.tsx`: Wraps app with Better Auth client context
   - `useSession()` hook available in all client components

### Phase 2: Actor Context & Scope Migration (All Endpoints, First Wave)

**Goal:** Replace all placeholder IDs with real session data. Cover every
server action and API route — no gaps left for later.

1. **Implement Actor context**
   - `lib/server/actor.ts`: AsyncLocalStorage-based actor
   - Wrapper function for server actions that initializes Actor from session

2. **Create `withAuth()` wrapper for server actions**
   ```typescript
   export async function withAuth<T>(fn: () => Promise<T>): Promise<T> {
     const session = await auth.api.getSession({ headers: await headers() });
     if (!session) throw new Error("Unauthorized");

     const membership = await getDefaultWorkspaceMembership(session.user.id);
     return Actor.provide({
       type: "user",
       userId: session.user.id,
       workspaceId: membership.workspaceId,
       email: session.user.email,
       role: membership.role,
     }, fn);
   }
   ```

3. **Migrate ALL server actions** (no action left behind)
   - Replace `getCurrentUserContext()` → `withAuth()`
   - Replace `SINGLE_USER_SCOPE` → `Actor.scope()`
   - Remove `ensureSingleUserSeed()` calls
   - **Remove all client-supplied userId/workspaceId from action signatures**
   - Specifically: `conversations.ts`, `memory.ts`, `projects.ts`, and all
     other action files

4. **Migrate ALL API routes**
   - `/api/ai/stream`: Validate session, use `Actor.userId()` for rate limiting
   - `/api/ai/transcribe`: Same treatment
   - No AI endpoint accessible without a valid session

5. **Update `assertProjectAccess()`**
   - Read from Actor context instead of requiring scope parameter

6. **Update service-layer create paths**
   - `ledger.ts`: populate `Study.workspaceId` from Actor on create/upsert
   - `files.ts`: populate `FileAsset.workspaceId` from Actor on create

### Phase 3: First-Login Claim (First-Class Migration Feature)

**Goal:** Existing single-user data survives the transition. This is treated
as a first-class feature, not a later cleanup.

1. **First-login claim** (transactional, idempotent)
   - On first authenticated login, check for orphaned `"local-user"` data
   - Reassign `ownerId` and `userId` fields to the real authenticated user ID
   - Reassign `workspaceId` fields to the user's real workspace ID
   - Lock claim path to one-time execution with transaction + idempotency guard
   - This is safer than bulk ID rewrites because relations are already centered
     on those IDs

2. **Auto-provision workspace**
   - On signup, create a default Workspace and WorkspaceMember (role: "owner")
     inside one transaction (pattern from OpenCode)
   - Replace `ensureSingleUserSeed()` with `ensureDefaultWorkspace()`

3. **Backfill denormalized workspaceId**
   - Backfill `Study.workspaceId` and `FileAsset.workspaceId` from their parent
     project's workspace scope
   - Run as part of the claim transaction or as a separate data migration

4. **Remove bootstrap**
   - Delete `ensureSingleUserSeed()` and all calls to it
   - Delete placeholder constants from `scope.ts` and `conversations.ts`

### Phase 4: Hardening

1. **Rate limiting upgrade**
   - Rate-limit AI calls on `userId` (from Actor), not client-supplied `projectId`
   - Add auth attempt rate limiting (from OpenClaw's scoped limiter pattern)
   - Constant-time secret comparison utility for any future API key validation

2. **Fix production TLS**
   - Replace `sslmode=no-verify` in `prisma.ts` with proper certificate config

3. **Session management UI**
   - Show active sessions, allow revoking other sessions
   - Display last login time, IP, user agent

4. **CSRF protection**
   - Better Auth handles this via `SameSite=Lax` cookies + origin checking
   - Verify this works correctly with our deployment

5. **Error pages**
   - `/login?error=OAuthCallback` — friendly error for failed OAuth
   - `/login?error=EmailSend` — friendly error for failed magic link

6. **Auth tests**
   - Login flow (Google OAuth, magic link)
   - Session revocation
   - First-login claim path (claim works, idempotent on re-run)
   - Access denial (cross-workspace isolation)
   - Account linking (same email via different providers → same account)

---

## 8. Migration Strategy: Single-User to Multi-User

This is the most delicate part. Existing users have data under placeholder IDs.
The first-login claim is treated as a **first-class migration feature** — it
must be robust, transactional, and idempotent from day one.

### Step 1: Pre-Migration (Before Auth Deploys)

Run a Prisma migration script that:
1. Unifies `"single-user"` → `"local-user"` (or vice versa) across all tables
2. Unifies `"single-workspace"` → `"local-workspace"` across all tables
3. This eliminates the identity split bug before auth goes live

### Step 2: First-Login Claim

When a user logs in for the first time:

```typescript
async function claimExistingData(userId: string, workspaceId: string) {
  await prisma.$transaction(async (tx) => {
    // Idempotency: check for unclaimed placeholder data
    const placeholderUser = await tx.user.findUnique({
      where: { id: "local-user" },
    });

    if (!placeholderUser) return; // Already claimed or fresh install

    // Reassign all owned data to the real authenticated user
    await tx.project.updateMany({
      where: { ownerId: "local-user" },
      data: { ownerId: userId, workspaceId },
    });

    // Update conversations, memories, agent runs, etc.
    await tx.aIConversation.updateMany({
      where: { userId: "local-user" },
      data: { userId, workspaceId },
    });

    await tx.userMemory.updateMany({
      where: { userId: "local-user" },
      data: { userId },
    });

    // Backfill denormalized workspaceId on Study and FileAsset
    // (these fields exist in schema but were never populated)
    // Scoped to placeholder-owned projects only — don't touch unrelated rows
    const claimedProjectIds = await tx.project.findMany({
      where: { ownerId: userId }, // already reassigned above
      select: { id: true },
    });
    const projectIds = claimedProjectIds.map((p) => p.id);

    await tx.study.updateMany({
      where: { projectId: { in: projectIds }, workspaceId: null },
      data: { workspaceId },
    });
    await tx.fileAsset.updateMany({
      where: { projectId: { in: projectIds }, workspaceId: null },
      data: { workspaceId },
    });

    // ... repeat for all other userId/workspaceId-bearing tables ...

    // Delete the placeholder user and workspace
    await tx.workspaceMember.deleteMany({
      where: { userId: "local-user" },
    });
    await tx.user.delete({ where: { id: "local-user" } });
    await tx.workspace.delete({ where: { id: "local-workspace" } });
  });
}
```

**Why claim instead of bulk rewrite:** The existing relations are already
centered on the placeholder IDs. Claiming (reassigning ownership) inside a
transaction is safer than rewriting IDs across all foreign keys, because it
preserves referential integrity at every step.

### Step 3: Remove Bootstrap

Once auth is live, `ensureSingleUserSeed()` is no longer needed. Remove it and
all calls to it across server actions.

---

## 9. Security Hardening

### Defense in Depth

Based on CVE-2025-29927 (Next.js middleware bypass via `x-middleware-subrequest`
header), **never rely solely on proxy/middleware for auth**:

```
Proxy (proxy.ts) → Quick redirect for UX (not security boundary)
Server Action    → MUST call withAuth() (security boundary)
API Route        → MUST validate session (security boundary)
Service Layer    → Actor context carries validated identity
```

**Important:** The proxy must NOT set identity headers (like `x-user-id`).
Identity is derived exclusively from session lookup inside `withAuth()` /
`requireApiSession()`. Headers from proxy can be forged if proxy is bypassed.

### Session Security

| Setting | Value | Rationale |
|---------|-------|-----------|
| Session storage | Database (PostgreSQL) | No client-side JWT to steal |
| Cookie flags | `httpOnly`, `secure`, `SameSite=Lax` | XSS protection |
| Session expiry | 30 days | Balance convenience/security |
| Session refresh | On activity (sliding window) | Active users stay logged in |

### Rate Limiting

Stolen from OpenClaw, adapted:

| Scope | Limit | Window |
|-------|-------|--------|
| Auth attempts (per IP) | 10 attempts | 60 seconds, 5-min lockout |
| AI calls (per user) | Existing limits | Already implemented |
| API calls (per user) | 100 req | 60 seconds |

### Input Validation

- All `userId` and `workspaceId` values come from Actor (server-derived), never from client
- `assertProjectAccess()` always validates workspace ownership before any data access
- API routes reject requests without valid sessions (no more trusting client-supplied userId)

---

## 10. Future-Proofing for Collaboration

The architecture is designed so collaboration (multi-user workspaces) can be
added later without another migration:

### What's Already in Place

- `Workspace` + `WorkspaceMember` models with role field
- All data scoped to workspace (denormalized `workspaceId` on many models)
- `assertProjectAccess()` checks workspace membership

### What Collaboration Would Add (Not Now)

1. **Better Auth Organization plugin** — provides invite/accept/role management
2. **Workspace switcher** — UI to switch active workspace (Actor.workspaceId changes)
3. **Invitation flow** — using OpenCode's deferred binding pattern (invite by
   email, auto-link on signup)
4. **Role-based access** — `"owner"` | `"editor"` | `"viewer"` on WorkspaceMember
5. **Workspace creation UI** — create new workspaces, invite collaborators

The key insight: **we don't need to build any of this now**. The auth system is
designed so that when collaboration time comes, it's additive (new plugin +
new UI), not a migration.

---

## 11. Production Cutover Runbook

Auth deployment touches the database schema (new tables, User model changes,
placeholder unification). This runbook ensures a safe rollout.

### Prerequisites (Before Auth Code Deploys)

These are handled by a separate DB reliability track, not the auth work itself:

1. Run `npx prisma migrate deploy` against production Supabase (via `DIRECT_URL`)
2. Run `npx prisma migrate status` — confirm "up to date"
3. Verify critical indexes exist in production (SQL spot-check):
   - `AIMessage_conversationId_createdAt_id_idx`
   - `UserMemory_userId_pinned_idx`, `ProjectMemory_projectId_pinned_idx`,
     `StudyMemory_projectId_pinned_idx`
   - `MemoryEmbedding_embedding_hnsw_idx`
4. Take a DB snapshot/backup

### Auth Deploy Sequence

```
1. Validate env target
   - Confirm DIRECT_URL points to production (not localhost)
   - Confirm BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, etc. are set

2. Run auth migrations
   npx prisma migrate deploy    # from next-app/, with prod DIRECT_URL

3. Verify migration
   npx prisma migrate status    # should show all migrations applied
   -- SQL: verify Session, Account, Verification tables exist

4. Deploy app
   vercel --prod                # from repo root

5. Smoke test
   - Visit /login → Google OAuth flow → lands on dashboard
   - Visit /login → magic link → email arrives → click → lands on dashboard
   - First-login claim: existing projects visible under authenticated user
   - Hit /api/ai/stream without session → 401
   - Hit a protected server action without session → error
```

### Rollback Plan

- Auth tables (Session, Account, Verification) are additive — they don't break
  existing code if rolled back
- If app deploy fails: redeploy previous version, auth tables remain harmless
- If migration fails: restore from DB snapshot, investigate before retrying

---

## 12. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Better Auth breaking change in v2 | Low | Medium | Pin version, test before upgrading |
| Data loss during migration | Low | Critical | Transaction-wrapped, tested in staging first |
| OAuth provider outage | Low | Medium | Email magic link as fallback |
| Session fixation/hijack | Low | High | Database sessions, httpOnly cookies, IP tracking |
| Proxy bypass (CVE-2025-29927 class) | Medium | Critical | Defense-in-depth: validate in server actions, not just proxy |
| Resend email deliverability | Medium | Low | Google OAuth as primary, magic link as secondary |

### Environment Variables Required

```env
# Better Auth
BETTER_AUTH_SECRET=           # Random 32+ char secret (generate with openssl rand -hex 32)
BETTER_AUTH_URL=              # App URL (e.g., https://litrev.app)

# Google OAuth
GOOGLE_CLIENT_ID=             # From Google Cloud Console
GOOGLE_CLIENT_SECRET=         # From Google Cloud Console

# Resend (magic link emails)
RESEND_API_KEY=               # From resend.com
```

---

## Summary

| Aspect | Decision |
|--------|----------|
| **Library** | Better Auth (replaces Auth.js v5 from Phase 10 plan) |
| **Auth methods** | Google OAuth + Email magic links (via Resend) |
| **Session storage** | Database (PostgreSQL, via Prisma) |
| **Context pattern** | Actor (AsyncLocalStorage), stolen from OpenCode |
| **Rate limiting** | Scoped per-userId, stolen from OpenClaw |
| **Data migration** | First-login claim of placeholder data, transactional |
| **Schema impact** | 3 new tables (Session, Account, Verification), User extended |
| **Collaboration** | Deferred but architecturally supported from day 1 |
| **Enterprise SSO** | Explicitly out of scope (deferred per PRD) |

The architecture change is clean: Better Auth handles the auth plumbing, Actor
context replaces placeholder drilling, and all existing service-layer scoping
works unchanged — just with real IDs instead of `"local-user"`.

---

## Definition of Done

1. Unauthenticated callers cannot access `/api/ai/*` or any protected server action
2. No server action accepts caller-provided user/workspace identity
3. Placeholder identity split (`"local-user"` vs `"single-user"`) eliminated
4. Existing local data visible to first authenticated user without manual migration
5. `Study.workspaceId` and `FileAsset.workspaceId` backfilled from project scope
6. Rate limiting keyed on authenticated `userId`, not client-supplied values
7. `sslmode=no-verify` replaced with proper TLS config in production
8. `npx tsc --noEmit` and `npx vitest run` pass from `next-app/`
9. Auth tests cover: login, session revocation, claim path, access denial,
   cross-workspace isolation, and account linking (same email, different providers)
