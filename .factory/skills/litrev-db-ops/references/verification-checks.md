# Verification Checks

Run these checks after migration/recovery to validate both schema and data shape.

## 1) Migration and release gate

```bash
cd next-app
npx prisma migrate status
npm run db:release-gate
```

Expected: schema up to date, release gate passes.

## 2) Targeted schema checks (production)

```bash
cd next-app
set -a && source .env.vercel.prod && set +a
node --input-type=module <<'NODE'
import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DIRECT_URL });
await c.connect();

const out = {
  agentRunCols: (await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='AgentRun'
      AND column_name IN ('parentRunId','rootRunId')
    ORDER BY column_name
  `)).rows,
  runEventUnique: (await c.query(`
    SELECT conname FROM pg_constraint
    WHERE conname='RunEvent_runId_sequence_key'
  `)).rows,
  noteCols: (await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Note'
      AND column_name IN ('contentText','deletedAt')
    ORDER BY column_name
  `)).rows,
  studyDeletedAt: (await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Study' AND column_name='deletedAt'
  `)).rows,
};

console.log(JSON.stringify(out, null, 2));
await c.end();
NODE
rm -f .env.vercel.prod
```

## 3) Data integrity quick checks (production)

```bash
cd next-app
set -a && source .env.vercel.prod && set +a
node --input-type=module <<'NODE'
import { Client } from 'pg';
const c = new Client({ connectionString: process.env.DIRECT_URL });
await c.connect();

const checks = {
  duplicateRunEventGroups: (await c.query(`
    SELECT COUNT(*)::int AS groups
    FROM (
      SELECT 1 FROM "RunEvent"
      GROUP BY "runId", sequence
      HAVING COUNT(*) > 1
    ) t
  `)).rows[0],
  softDeletedStudies: (await c.query(`
    SELECT COUNT(*)::int AS count
    FROM "Study"
    WHERE "deletedAt" IS NOT NULL
  `)).rows[0],
  softDeletedNotes: (await c.query(`
    SELECT COUNT(*)::int AS count
    FROM "Note"
    WHERE "deletedAt" IS NOT NULL
  `)).rows[0],
};

console.log(JSON.stringify(checks, null, 2));
await c.end();
NODE
rm -f .env.vercel.prod
```

Expected:
- `duplicateRunEventGroups.groups = 0`
- soft-delete counts can be any non-negative number.

## 4) Functional smoke check

Reproduce the original failure path that triggered the incident (for example draft autosave, agent run start, tool execution). Do not close the incident without this check.
