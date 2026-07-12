import { createHash } from "node:crypto";
import { Client } from "pg";
import { expect, type Page, type Route, type TestInfo } from "@playwright/test";
import { SELECTABLE_MODEL_IDS } from "../../lib/ai/config";
import type { AIStreamChunk } from "../../types/ai";
import { buildFoundationSeedKey, quickLoginWithSeed } from "./foundation";

type StreamRequestPayload = {
  options?: {
    conversationId?: string;
    userInputResolution?: unknown;
  };
};

function readStreamRequest(route: Route): StreamRequestPayload {
  try {
    return route.request().postDataJSON() as StreamRequestPayload;
  } catch {
    return {};
  }
}

export function getStreamRequestPayload(route: Route): StreamRequestPayload {
  return readStreamRequest(route);
}

export async function fulfillAIStream(
  route: Route,
  chunks: AIStreamChunk[],
): Promise<void> {
  const conversationId = readStreamRequest(route).options?.conversationId;
  const normalizedChunks = chunks.map((chunk) => (
    chunk.type === "run_start" && conversationId
      ? { ...chunk, conversationId }
      : chunk
  ));

  await route.fulfill({
    status: 200,
    contentType: "application/x-ndjson; charset=utf-8",
    body: `${normalizedChunks.map((chunk) => JSON.stringify(chunk)).join("\n")}\n`,
  });
}

export async function openAuthenticatedAi(
  page: Page,
  testInfo: Pick<TestInfo, "project" | "workerIndex" | "title">,
): Promise<string> {
  await stubAgentModelAvailability(page);
  const seedKey = buildFoundationSeedKey(testInfo);
  await quickLoginWithSeed(page, { callbackUrl: "/ai", seedKey });
  await expect(page).toHaveURL(/\/ai(?:\?|$)/);
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("region", { name: /chat interface/i })).toBeVisible();
  await expect(page.getByLabel("Copilot prompt")).toBeVisible();
  return seedKey;
}

/**
 * Stream-contract scenarios replace the provider request with deterministic
 * NDJSON, so they must also declare their deterministic models ready. This
 * keeps credential-free CI honest without weakening production readiness.
 */
export async function stubAgentModelAvailability(page: Page): Promise<void> {
  await page.route("**/api/ai/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        availability: Object.fromEntries(SELECTABLE_MODEL_IDS.map((modelId) => [modelId, true])),
      }),
    });
  });
}

export async function sendAgentPrompt(page: Page, prompt: string): Promise<void> {
  const promptInput = page.getByLabel("Copilot prompt");
  const sendButton = page.getByRole("button", { name: "Send" });

  // The composer is server-rendered before its React handlers attach. Refill while
  // waiting for interactivity so a cold, parallel dev compile cannot lose the
  // first input event during hydration.
  await expect.poll(async () => {
    await promptInput.fill(prompt);
    return sendButton.isEnabled();
  }).toBe(true);

  await sendButton.click();
}

function stableFixtureId(seed: string, kind: string): string {
  const digest = createHash("sha256").update(`${seed}:${kind}`).digest("hex").slice(0, 24);
  return `e2e-${kind}-${digest}`;
}

function getFixtureUserId(seedKey: string): string {
  const seedHash = createHash("sha256").update(seedKey.trim()).digest("hex").slice(0, 12);
  return `preview-dev-user-${seedHash}`;
}

export async function seedGlobalConversation(seedKey: string): Promise<string> {
  const userId = getFixtureUserId(seedKey);
  const workspaceId = `workspace-${userId}`;
  const conversationId = stableFixtureId(seedKey, "global-conversation");

  await withLocalDatabase(async (client) => {
    await client.query(
      `INSERT INTO "AIConversation"
        ("id", "userId", "workspaceId", "title", "context", "page", "archived", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'Offline recovery proof', 'global', 'ai', false, NOW(), NOW())
       ON CONFLICT ("id") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "workspaceId" = EXCLUDED."workspaceId",
        "archived" = false,
        "updatedAt" = NOW()`,
      [conversationId, userId, workspaceId],
    );
  });

  return conversationId;
}

function getLocalDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the seeded artifact browser scenario");
  }

  const parsed = new URL(databaseUrl);
  if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("Seeded browser scenarios may only mutate a loopback PostgreSQL database");
  }
  return databaseUrl;
}

export function assertLocalAgentRuntimeDatabase(): void {
  getLocalDatabaseUrl();
}

async function withLocalDatabase<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: getLocalDatabaseUrl() });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

export type StudyUpdateArtifactFixture = {
  artifactId: string;
  conversationId: string;
  originalTitle: string;
  studyId: string;
  updatedTitle: string;
};

export async function seedStudyUpdateArtifact(params: {
  projectId: string;
  seedKey: string;
}): Promise<StudyUpdateArtifactFixture> {
  const { projectId, seedKey } = params;
  const userId = getFixtureUserId(seedKey);
  const conversationId = stableFixtureId(`${seedKey}:${projectId}`, "conversation");
  const studyId = stableFixtureId(`${seedKey}:${projectId}`, "study");
  const runId = stableFixtureId(`${seedKey}:${projectId}`, "run");
  const artifactId = stableFixtureId(`${seedKey}:${projectId}`, "artifact");
  const messageId = stableFixtureId(`${seedKey}:${projectId}`, "message");
  const originalTitle = "Baseline evidence title";
  const updatedTitle = "Reliably updated evidence title";

  await withLocalDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      const project = await client.query<{ workspaceId: string }>(
        `SELECT "workspaceId" FROM "Project" WHERE "id" = $1`,
        [projectId],
      );
      if (project.rowCount !== 1) {
        throw new Error(`Seed project not found: ${projectId}`);
      }
      const workspaceId = project.rows[0].workspaceId;

      await client.query(
        `INSERT INTO "AIConversation"
          ("id", "userId", "workspaceId", "title", "context", "page", "projectId", "archived", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'project', 'ai', $5, false, NOW(), NOW())
         ON CONFLICT ("id") DO UPDATE SET
          "userId" = EXCLUDED."userId",
          "workspaceId" = EXCLUDED."workspaceId",
          "title" = EXCLUDED."title",
          "projectId" = EXCLUDED."projectId",
          "archived" = false,
          "updatedAt" = NOW()`,
        [conversationId, userId, workspaceId, "Artifact action proof", projectId],
      );
      const study = await client.query<{ snapshotAt: string }>(
        `INSERT INTO "Study"
          ("id", "projectId", "workspaceId", "title", "authors", "year", "status", "quality", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'Fixture Author', 2026, 'active', '-', NOW(), NOW())
         ON CONFLICT ("id") DO UPDATE SET
          "title" = EXCLUDED."title",
          "authors" = EXCLUDED."authors",
          "year" = EXCLUDED."year",
          "status" = EXCLUDED."status",
          "quality" = EXCLUDED."quality",
          "deletedAt" = NULL,
          "updatedAt" = NOW()
         RETURNING to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "snapshotAt"`,
        [studyId, projectId, workspaceId, originalTitle],
      );
      // Prisma treats the schema's timestamp-without-time-zone value as a UTC
      // wall clock. Read that exact representation instead of letting node-pg
      // reinterpret it using the local machine timezone.
      const snapshotAt = study.rows[0]?.snapshotAt;
      if (!snapshotAt || !Number.isFinite(new Date(snapshotAt).getTime())) {
        throw new Error(`Study fixture did not return a valid updatedAt value: ${studyId}`);
      }
      const payload = {
        studyId,
        studyTitle: originalTitle,
        snapshotAt,
        idempotencyKey: stableFixtureId(`${seedKey}:${projectId}`, "update-key"),
        patch: { top: { title: updatedTitle } },
        changes: [{
          field: "title",
          label: "Title",
          operation: "set",
          typedOldValue: originalTitle,
          typedNewValue: updatedTitle,
          displayOld: originalTitle,
          displayNew: updatedTitle,
        }],
        rationale: "A deterministic browser fixture verifies accept and undo through the real server action.",
      };
      await client.query(
        `INSERT INTO "AgentRun"
          ("id", "projectId", "conversationId", "userId", "trigger", "agentMode", "status", "completedAt")
         VALUES ($1, $2, $3, $4, 'event', 'general', 'completed', NOW())
         ON CONFLICT ("id") DO UPDATE SET
          "status" = 'completed',
          "completedAt" = NOW()`,
        [runId, projectId, conversationId, userId],
      );
      await client.query(
        `INSERT INTO "AIMessage" ("id", "conversationId", "role", "content")
         VALUES ($1, $2, 'assistant', $3)
         ON CONFLICT ("id") DO UPDATE SET "content" = EXCLUDED."content"`,
        [messageId, conversationId, "Review this deterministic study update."],
      );
      await client.query(
        `INSERT INTO "Artifact"
          ("id", "runId", "projectId", "conversationId", "userId", "type", "status", "title", "payload")
         VALUES ($1, $2, $3, $4, $5, 'study_update', 'proposed', $6, $7::jsonb)
         ON CONFLICT ("id") DO UPDATE SET
          "status" = 'proposed',
          "title" = EXCLUDED."title",
          "payload" = EXCLUDED."payload",
          "snapshot" = NULL,
          "applyId" = NULL,
          "appliedAt" = NULL,
          "appliedByUserId" = NULL,
          "reviewedAt" = NULL,
          "reviewNote" = NULL`,
        [
          artifactId,
          runId,
          projectId,
          conversationId,
          userId,
          "Deterministic study update",
          JSON.stringify(payload),
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return { artifactId, conversationId, originalTitle, studyId, updatedTitle };
}

export async function readStudyUpdateArtifactState(fixture: StudyUpdateArtifactFixture): Promise<{
  artifactStatus: string | null;
  studyTitle: string | null;
}> {
  return withLocalDatabase(async (client) => {
    const [artifact, study] = await Promise.all([
      client.query<{ status: string }>(
        `SELECT "status" FROM "Artifact" WHERE "id" = $1`,
        [fixture.artifactId],
      ),
      client.query<{ title: string }>(
        `SELECT "title" FROM "Study" WHERE "id" = $1`,
        [fixture.studyId],
      ),
    ]);
    return {
      artifactStatus: artifact.rows[0]?.status ?? null,
      studyTitle: study.rows[0]?.title ?? null,
    };
  });
}

export async function cleanupSeededProject(projectId: string): Promise<void> {
  await withLocalDatabase(async (client) => {
    await client.query(`DELETE FROM "Project" WHERE "id" = $1`, [projectId]);
  });
}
