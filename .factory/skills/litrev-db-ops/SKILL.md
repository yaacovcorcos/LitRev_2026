---
name: litrev-db-ops
description: Manage LitRev database health, migrations, and production remediation for Prisma + Supabase Postgres + Vercel deploys. Use when users report Prisma errors, migration failures, schema drift (for example "column does not exist"), broken autosave/tool calls, or ask to run/verify DB updates safely.
---

# LitRev DB Ops

Execute a safe, repeatable workflow for LitRev DB diagnostics, migration updates, and production recovery.

## Command Map

Use commands from `next-app/`.

| Alias | Underlying command | Purpose |
|---|---|---|
| `npm run db:doctor` | `bash scripts/db-doctor.sh` | Connectivity + migration + index diagnostics |
| `npm run db:repair-run-events` | `node scripts/repair-run-event-sequences.mjs` | Repair duplicate `RunEvent(runId, sequence)` groups |
| `npm run db:migrate:safe` | `bash scripts/migrate-deploy-safe.sh` | Safe migration deploy with recovery path |
| `npm run db:release-gate` | `bash scripts/release-gate-prod.sh` | Full production DB gate |

If an alias is missing, run the underlying script directly and update `package.json`.

## Local vs Production Workflow

### Local-only diagnosis

Use local env and avoid production secrets:

```bash
cd next-app
npm run db:doctor
npx prisma migrate status
```

### Production diagnosis/remediation

Use pulled Vercel env and clean it afterward:

```bash
cd next-app
vercel env pull .env.vercel.prod --environment=production
set -a && source .env.vercel.prod && set +a
npm run db:migrate:safe
npx prisma migrate status
rm -f .env.vercel.prod
```

Never keep `.env.vercel.prod` in the repo after execution.

## Mandatory Safety Checkpoint (Before Risky Prod Ops)

Before `migrate resolve`, manual SQL fixes, or high-risk migration recovery:

1. Confirm Supabase Point-in-Time Recovery (PITR) is enabled.
2. Record a rollback anchor timestamp (UTC) in the incident notes.
3. Run `npm run db:doctor` and save output.
4. Proceed only after steps 1-3 are done.

## Incident Decision Tree

### 1) Runtime Prisma error from app

Run:

```bash
cd next-app
npm run db:doctor
npx prisma migrate status
```

If error contains `column does not exist`, `Invalid prisma.* invocation`, or `P2022`, treat as schema drift first.

### 2) Pending migrations or schema drift

Run:

```bash
npm run db:migrate:safe
npx prisma migrate status
```

Re-test the exact failing user flow after migrations succeed.

### 3) Migration blocked by RunEvent duplicate sequence

If `prisma migrate deploy` fails with `RunEvent_runId_sequence_key` / `P3018`:

```bash
npm run db:repair-run-events
npx prisma migrate resolve --rolled-back <migration_name>
npm run db:migrate:safe
```

Do not edit already-applied migration SQL.

## Rollback / Revert Policy

Prefer roll-forward fixes. Use rollback state only for failed migrations.

1. Fix blocking data issue.
2. Mark failed migration rolled back:

```bash
npx prisma migrate resolve --rolled-back <migration_name>
```

3. Re-run safe deploy:

```bash
npm run db:migrate:safe
```

Never run `prisma migrate reset` on production.

## Post-Migration Verification

Run:

```bash
npx prisma migrate status
npm run db:release-gate
```

Then run integrity checks from [references/verification-checks.md](references/verification-checks.md).

## Table Count Sanity Check

Quick row counts for core tables (useful after migration or data recovery):

```bash
cd next-app
set -a && source .env.vercel.prod && set +a
node -e "
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DIRECT_URL });
(async () => {
  await c.connect();
  const tables = ['User','Project','Study','AgentRun','RunEvent','Artifact','Note','AIConversation','AIMessage'];
  for (const t of tables) {
    const r = await c.query('SELECT COUNT(*)::int AS count FROM \"' + t + '\"');
    console.log(t + ':', r.rows[0].count);
  }
  await c.end();
})();
"
rm -f .env.vercel.prod
```

## Deploy Gate

Before `vercel --prod`:

```bash
cd next-app
npm run db:release-gate
npx tsc --noEmit
npx vitest run
```

Fail deployment if any command fails.

## Update Policy

When a new DB failure mode appears:

1. Add or update recovery logic in `next-app/scripts/*`.
2. Update `AGENTS.md` DB contract to make the recovery step mandatory.
3. Update references in this skill.

## References

- [references/error-signatures.md](references/error-signatures.md)
- [references/verification-checks.md](references/verification-checks.md)
