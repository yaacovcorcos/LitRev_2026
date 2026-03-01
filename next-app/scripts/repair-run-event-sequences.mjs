#!/usr/bin/env node

import { Client } from "pg";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("ERROR: DIRECT_URL (preferred) or DATABASE_URL is required.");
  process.exit(1);
}

const client = new Client({ connectionString });

async function tableExists() {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'RunEvent'
    ) AS exists
  `);
  return Boolean(result.rows[0]?.exists);
}

async function duplicateSummary() {
  const result = await client.query(`
    WITH dup_groups AS (
      SELECT "runId", sequence, COUNT(*) AS cnt
      FROM "RunEvent"
      GROUP BY "runId", sequence
      HAVING COUNT(*) > 1
    )
    SELECT
      COUNT(*)::int AS groups,
      COALESCE(SUM(cnt), 0)::int AS rows
    FROM dup_groups
  `);
  return {
    groups: Number(result.rows[0]?.groups ?? 0),
    rows: Number(result.rows[0]?.rows ?? 0),
  };
}

async function repairDuplicates() {
  const result = await client.query(`
    WITH duplicate_runs AS (
      SELECT DISTINCT "runId"
      FROM "RunEvent"
      GROUP BY "runId", sequence
      HAVING COUNT(*) > 1
    ),
    reordered AS (
      SELECT
        id,
        "runId",
        ROW_NUMBER() OVER (
          PARTITION BY "runId"
          ORDER BY sequence ASC, "createdAt" ASC, id ASC
        ) AS new_sequence
      FROM "RunEvent"
      WHERE "runId" IN (SELECT "runId" FROM duplicate_runs)
    ),
    updated AS (
      UPDATE "RunEvent" event
      SET sequence = reordered.new_sequence
      FROM reordered
      WHERE event.id = reordered.id
        AND event.sequence <> reordered.new_sequence
      RETURNING event.id
    )
    SELECT COUNT(*)::int AS updated_rows
    FROM updated
  `);

  return Number(result.rows[0]?.updated_rows ?? 0);
}

await client.connect();

try {
  const exists = await tableExists();
  if (!exists) {
    console.log("[repair-run-event-sequences] RunEvent table not found. Skipping.");
    process.exit(0);
  }

  const before = await duplicateSummary();
  if (before.groups === 0) {
    console.log("[repair-run-event-sequences] No duplicate (runId, sequence) groups found.");
    process.exit(0);
  }

  await client.query("BEGIN");
  const updatedRows = await repairDuplicates();
  const after = await duplicateSummary();
  await client.query("COMMIT");

  console.log(
    JSON.stringify(
      {
        action: "repair-run-event-sequences",
        before,
        updatedRows,
        after,
      },
      null,
      2,
    ),
  );

  if (after.groups > 0) {
    console.error(
      "[repair-run-event-sequences] Duplicate groups remain after repair. Manual intervention required.",
    );
    process.exit(1);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("[repair-run-event-sequences] Failed:", error);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
