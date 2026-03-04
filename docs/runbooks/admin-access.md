# Admin Access Runbook

This runbook defines platform-admin bootstrap and recovery operations.

## Scope
- In scope: assigning/recovering platform admin access (`User.isPlatformAdmin`).
- Out of scope: workspace member roles (`WorkspaceMember.role`), feature-level permissions.

## Preconditions
1. Run commands from `next-app/`.
2. Confirm environment target before making changes:
   - local development: localhost database
   - production: Supabase Postgres
3. Use Better Auth identity email values from the app `User` table.

## Bootstrap First Platform Admin (one-time)

Use when no platform admin exists yet.

```bash
npx tsx scripts/bootstrap-platform-admin.ts --mode bootstrap --email coryacos1@gmail.com
```

Expected behavior:
- succeeds only when no platform admin currently exists, or target is already admin
- fails if admins already exist and target is not currently admin

## Recover Platform Admin Access

Use when admin access was lost or needs explicit re-grant.

```bash
npx tsx scripts/bootstrap-platform-admin.ts --mode recover --email coryacos1@gmail.com
```

Expected behavior:
- grants `isPlatformAdmin=true` for target user if needed
- safe to re-run (idempotent)

## Env Fallback Mode

If `--email` is omitted, the script reads:

- `PLATFORM_ADMIN_BOOTSTRAP_EMAIL`

Example:

```bash
PLATFORM_ADMIN_BOOTSTRAP_EMAIL=coryacos1@gmail.com npx tsx scripts/bootstrap-platform-admin.ts --mode bootstrap
```

## Verification SQL (read-only)

```sql
select id, email, name, "isPlatformAdmin", "createdAt"
from "User"
order by "isPlatformAdmin" desc, "createdAt" asc;
```

## Guard Boundary Checklist

When adding admin capabilities, enforce server-side platform-admin guards at every boundary:

1. Route/server-component entry points (`/admin/**`) must call `requirePlatformAdmin()`.
2. Admin server actions must wrap execution with `withPlatformAdminAction(...)`.
3. Admin API handlers must call `requirePlatformAdminApi(request)` before any admin data access.
4. Background/cron admin tasks must call `requirePlatformAdminBackground(userId)` before reading or mutating admin-only data.

Never rely on hidden UI controls as authorization.

## Admin Shell Access

- Route: `/admin`
- Guard: `requirePlatformAdmin()` at the route boundary.
- Non-admin behavior: `403` response via `app/admin/forbidden.tsx`.
- Navigation visibility: admin links are shown only when `/api/admin/status` returns `isPlatformAdmin=true`.

## Users Directory (Read-only)

- Route: `/admin/users`
- Guard: `requirePlatformAdmin()` at the route boundary.
- Query behavior:
  - server-side pagination only (`page`, `pageSize`)
  - search by user name/email
  - admin filter (`all` / `true` / `false`)
  - created date window and last-seen date window
  - sortable by created/name/email
- Columns exposed:
  - `id`, `name`, `email`, `createdAt`, `emailVerified`, `isPlatformAdmin`, `lastSeenAt`
  - workspace count (`WorkspaceMember`)
  - project count (`Project`)
  - 7-day token summary from `AIUsage`

Migration index set for this page:
1. `Session_userId_updatedAt_idx`
2. `User_createdAt_idx`
3. `User_isPlatformAdmin_createdAt_idx`

## Usage Analytics Dashboard

- Route: `/admin/usage`
- Guard: `requirePlatformAdmin()` at the route boundary.
- Query behavior:
  - rolling windows: 7, 30, 90 days
  - summary totals (requests/tokens/users/workspaces)
  - breakdown tables by `source`, `contextPage`, and `model`
  - daily trend from DB-side day truncation
- Legacy compatibility contract:
  - `AIUsage.source` or `AIUsage.contextPage` rows with `legacy_unknown` are treated as legacy rows.
  - `AIUsage.conversationId` is optional and may be `NULL` for historical rows.
  - Dashboard semantics:
    - `legacyRequests`: rows where `source='legacy_unknown'` OR `contextPage='legacy_unknown'`
    - `attributedRequests`: `totalRequests - legacyRequests`

## Platform Admin Mutations + Audit

- Endpoint: `POST /api/admin/users/[userId]/platform-admin`
- Request body:
  - `makeAdmin: boolean`
  - `reason?: string` (stored in audit log)
- Server-side safeguards:
  - only platform admins can mutate
  - serializable transaction + admin-row lock before revoke flow
  - last-admin protection blocks downgrade of final platform admin (`409`)
- Audit writes:
  - table: `AdminAuditLog`
  - fields: `actorUserId`, `targetUserId`, `action`, `reason`, `requestId`, `before`, `after`, `createdAt`

## Incident Response

### Recover Platform Admin Lockout

If no authorized admin can access `/admin`, run explicit recovery:

```bash
npx tsx scripts/bootstrap-platform-admin.ts --mode recover --email coryacos1@gmail.com
```

Then verify:

```sql
select id, email, "isPlatformAdmin"
from "User"
where email = 'coryacos1@gmail.com';
```

### Verify Audit Trail Integrity

```sql
select "createdAt", "actorUserId", "targetUserId", action, reason, "requestId"
from "AdminAuditLog"
order by "createdAt" desc
limit 50;
```

Notes:
- Successful platform-admin role changes must write one `AdminAuditLog` row each.
- Failed mutation attempts are currently surfaced via API status/error responses and are not persisted as audit rows.
