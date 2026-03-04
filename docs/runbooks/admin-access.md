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
