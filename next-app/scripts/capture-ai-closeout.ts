import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { serializeSignedCookie } from "better-call";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";

import { buildAiBundleReport } from "../lib/ai-bundle-report";
import type { AiCaptureReport } from "../lib/ai-closeout-metrics";

const execFileAsync = promisify(execFile);
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_PORT = 3301;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_AUTH_SECRET = "abcdefghijklmnopqrstuvwxyz1234567890abcdef";
const QUICK_LOGIN_USER_ID = "preview-dev-user";
const QUICK_LOGIN_EMAIL = "preview-dev-user@local.invalid";
const QUICK_LOGIN_NAME = "Preview Dev User";
const QUICK_LOGIN_WORKSPACE_ID = `workspace-${QUICK_LOGIN_USER_ID}`;
const FIXTURE_TITLE = "AI Perf Fixture Conversation";
const FIXTURE_MESSAGE_COUNT = 160;

type ScriptArgs = {
  appRoot: string;
  outputPath?: string;
  port: number;
  host: string;
  skipBuild: boolean;
};

type PerfCookie = {
  name: string;
  value: string;
  url: string;
  httpOnly: boolean;
  sameSite: "Lax";
  secure: boolean;
};

type SeededConversationFixture = {
  id: string;
  title: string;
  latestAssistantText: string;
};

let pool: Pool | null = null;
let prisma: PrismaClient | null = null;

function parseArgs(argv: string[]): ScriptArgs {
  const args: ScriptArgs = {
    appRoot: process.cwd(),
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    skipBuild: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [key, inlineValue] = token.slice(2).split("=");
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue == null && argv[index + 1] && !argv[index + 1].startsWith("--")) {
      index += 1;
    }

    if (key === "app-root" && value) args.appRoot = path.resolve(value);
    if (key === "output" && value) args.outputPath = path.resolve(value);
    if (key === "port" && value) args.port = Number.parseInt(value, 10);
    if (key === "host" && value) args.host = value;
    if (key === "skip-build") args.skipBuild = true;
  }

  if (!Number.isFinite(args.port) || args.port < 1) {
    throw new Error(`Invalid --port value: ${args.port}`);
  }

  return args;
}

function loadTargetEnv(appRoot: string) {
  loadEnv({ path: path.join(appRoot, ".env.local"), override: true });
  loadEnv({ path: path.join(appRoot, ".env"), override: false });
}

function parseCookieValue(serializedCookie: string): string {
  const [nameValue] = serializedCookie.split(";");
  const separatorIndex = nameValue?.indexOf("=");
  if (nameValue == null || separatorIndex == null || separatorIndex < 0) {
    throw new Error("Unable to parse serialized session cookie.");
  }
  return nameValue.slice(separatorIndex + 1);
}

async function ensureQuickLoginOwner() {
  if (!prisma) throw new Error("Prisma client is not initialized.");
  await prisma.user.upsert({
    where: { id: QUICK_LOGIN_USER_ID },
    update: {
      email: QUICK_LOGIN_EMAIL,
      name: QUICK_LOGIN_NAME,
      emailVerified: true,
    },
    create: {
      id: QUICK_LOGIN_USER_ID,
      email: QUICK_LOGIN_EMAIL,
      name: QUICK_LOGIN_NAME,
      emailVerified: true,
    },
  });

  await prisma.workspace.upsert({
    where: { id: QUICK_LOGIN_WORKSPACE_ID },
    update: { name: "Preview Dev Workspace" },
    create: {
      id: QUICK_LOGIN_WORKSPACE_ID,
      name: "Preview Dev Workspace",
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: QUICK_LOGIN_WORKSPACE_ID,
        userId: QUICK_LOGIN_USER_ID,
      },
    },
    update: { role: "owner" },
    create: {
      workspaceId: QUICK_LOGIN_WORKSPACE_ID,
      userId: QUICK_LOGIN_USER_ID,
      role: "owner",
    },
  });
}

async function resetAiConversations() {
  if (!prisma) throw new Error("Prisma client is not initialized.");
  await prisma.aIConversation.deleteMany({
    where: {
      userId: QUICK_LOGIN_USER_ID,
      workspaceId: QUICK_LOGIN_WORKSPACE_ID,
      page: "ai",
      projectId: null,
      studyId: null,
    },
  });
}

function buildFixtureMessages(count: number) {
  const now = Date.now() - count * 60_000;
  const rows = Array.from({ length: count }, (_, index) => {
    const role = index % 2 === 0 ? "user" : "assistant";
    const sequence = `${String(index + 1).padStart(3, "0")}`;
    const content = role === "user"
      ? `Fixture user message ${sequence}. Summarize evidence thread ${index % 9}.`
      : `Fixture assistant message ${sequence}. This is the deterministic readiness sentinel for step ${index % 11}.`;
    return {
      role,
      content,
      createdAt: new Date(now + index * 60_000),
    };
  });
  return rows;
}

async function seedPopulatedConversation(): Promise<SeededConversationFixture> {
  if (!prisma) throw new Error("Prisma client is not initialized.");
  const messages = buildFixtureMessages(FIXTURE_MESSAGE_COUNT);
  const latestAssistantText = messages.findLast(
    (message) => message.role === "assistant",
  )?.content;
  if (!latestAssistantText) {
    throw new Error("Unable to build populated AI fixture without an assistant message.");
  }

  const conversation = await prisma.aIConversation.create({
    data: {
      userId: QUICK_LOGIN_USER_ID,
      workspaceId: QUICK_LOGIN_WORKSPACE_ID,
      title: FIXTURE_TITLE,
      context: "global",
      page: "ai",
      archived: false,
    },
  });

  await prisma.aIMessage.createMany({
    data: messages.map((message) => ({
      conversationId: conversation.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
  });

  await prisma.aIConversation.update({
    where: { id: conversation.id },
    data: {
      updatedAt: messages[messages.length - 1]?.createdAt ?? new Date(),
    },
  });

  return {
    id: conversation.id,
    title: FIXTURE_TITLE,
    latestAssistantText,
  };
}

async function createPerfCookie(baseUrl: string): Promise<PerfCookie> {
  if (!prisma) throw new Error("Prisma client is not initialized.");
  await prisma.session.deleteMany({
    where: { userId: QUICK_LOGIN_USER_ID },
  });

  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId: QUICK_LOGIN_USER_ID,
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      ipAddress: "127.0.0.1",
      userAgent: "ai-closeout-playwright",
    },
  });

  const url = new URL(baseUrl);
  const secure = url.protocol === "https:";
  const cookieName = secure
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
  const serializedCookie = await serializeSignedCookie(
    cookieName,
    token,
    process.env.BETTER_AUTH_SECRET?.trim() || DEFAULT_AUTH_SECRET,
    {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  );

  return {
    name: cookieName,
    value: parseCookieValue(serializedCookie),
    url: baseUrl,
    httpOnly: true,
    sameSite: "Lax",
    secure,
  };
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
) {
  await execFileAsync(command, args, {
    cwd,
    env,
    maxBuffer: 1024 * 1024 * 20,
  });
}

function spawnServer(appRoot: string, host: string, port: number, env: NodeJS.ProcessEnv): ChildProcess {
  return spawn("npx", ["next", "start", "--hostname", host, "--port", String(port)], {
    cwd: appRoot,
    env,
    stdio: "pipe",
  });
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  const closePromise = once(child, "close").catch(() => undefined);
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(resolve, 5_000);
  });
  await Promise.race([closePromise, timeoutPromise]);
  if (child.exitCode == null) {
    child.kill("SIGKILL");
    await once(child, "close").catch(() => undefined);
  }
}

async function waitForServerReady(baseUrl: string, child: ChildProcess) {
  const deadline = Date.now() + 120_000;
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`next start exited early with code ${child.exitCode}\n${stderr}`);
    }
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Timed out waiting for ${baseUrl}.\n${stderr}`);
}

async function createAuthedContext(browser: Browser, baseUrl: string): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 900 },
  });
  const cookie = await createPerfCookie(baseUrl);
  await context.addCookies([cookie]);
  return context;
}

async function waitForPromptReady(page: Page) {
  await page.getByRole("region", { name: /chat interface/i }).waitFor();
  await page.waitForFunction(() => {
    const prompt = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Copilot prompt"]');
    return Boolean(prompt && !prompt.disabled);
  });
}

async function captureEmptyScenario(browser: Browser, baseUrl: string) {
  const context = await createAuthedContext(browser, baseUrl);
  const page = await context.newPage();
  const start = Date.now();
  await page.goto("/ai", { waitUntil: "domcontentloaded" });
  await waitForPromptReady(page);
  const composerReadyMs = Date.now() - start;
  const marker = await page.evaluate(() => window.__litrevAiPerf ?? null);
  await context.close();
  return {
    composerReadyMs,
    routeMarkerComposerReadyMs: marker?.composerReadyMs ?? null,
    activeConversationId: marker?.activeConversationId ?? null,
  };
}

async function capturePopulatedScenario(browser: Browser, baseUrl: string, fixture: SeededConversationFixture) {
  const context = await createAuthedContext(browser, baseUrl);
  const page = await context.newPage();
  await page.goto("/ai", { waitUntil: "domcontentloaded" });
  await waitForPromptReady(page);
  const openHistoryButton = page.getByRole("button", { name: /open chat history/i });
  if (await openHistoryButton.isVisible().catch(() => false)) {
    await openHistoryButton.click();
  }
  const historyButton = page.getByRole("button", { name: fixture.title });
  await historyButton.waitFor();
  const start = Date.now();
  await historyButton.click();
  await page.waitForFunction((latestText) => {
    const loading = document.querySelector('[aria-label="Loading conversation"]');
    if (loading) return false;
    return document.body.innerText.includes(String(latestText));
  }, fixture.latestAssistantText);
  const timelineReadyMs = Date.now() - start;
  const marker = await page.evaluate(() => window.__litrevAiPerf ?? null);
  await context.close();
  return {
    timelineReadyMs,
    routeMarkerTimelineReadyMs: marker?.timelineReadyMs ?? null,
    activeConversationId: marker?.activeConversationId ?? null,
    visibleItems: marker?.visibleItems ?? null,
    hiddenItems: marker?.hiddenItems ?? null,
    totalItems: marker?.totalItems ?? null,
  };
}

async function resolveCommitSha(appRoot: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: path.resolve(appRoot, ".."),
  });
  return stdout.trim();
}

async function main() {
  const args = parseArgs(process.argv);
  loadTargetEnv(args.appRoot);

  const baseUrl = `http://${args.host}:${args.port}`;
  const env = {
    ...process.env,
    ENABLE_DEV_QUICK_LOGIN: "1",
    VERCEL_ENV: "preview",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET?.trim() || DEFAULT_AUTH_SECRET,
  };

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for AI closeout capture.");
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ["error"],
  });

  await ensureQuickLoginOwner();

  if (!args.skipBuild) {
    await runCommand("npx", ["next", "build"], args.appRoot, env);
  }

  const bundleReport = buildAiBundleReport(args.appRoot);
  const server = spawnServer(args.appRoot, args.host, args.port, env);
  const browser = await chromium.launch({ headless: true });

  try {
    await waitForServerReady(baseUrl, server);

    await resetAiConversations();
    const empty = await captureEmptyScenario(browser, baseUrl);

    await resetAiConversations();
    const fixture = await seedPopulatedConversation();
    const populated = await capturePopulatedScenario(browser, baseUrl, fixture);

    const report: AiCaptureReport = {
      label: path.basename(path.resolve(args.appRoot, "..")),
      commit: await resolveCommitSha(args.appRoot),
      appRoot: args.appRoot,
      bundle: {
        chunkCount: bundleReport.chunkCount,
        totalBytes: bundleReport.totalBytes,
      },
      scenarios: {
        empty,
        populated,
      },
    };

    const serialized = JSON.stringify(report, null, 2);
    if (args.outputPath) {
      fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
      fs.writeFileSync(args.outputPath, serialized);
      console.log(`[ai-closeout] wrote ${args.outputPath}`);
    } else {
      console.log(serialized);
    }
  } finally {
    await browser.close().catch(() => {});
    await stopServer(server);
    await pool?.end().catch(() => {});
    await prisma?.$disconnect().catch(() => {});
  }
}

main().catch(async (error) => {
  console.error(`[ai-closeout] ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  await pool?.end().catch(() => {});
  await prisma?.$disconnect().catch(() => {});
  process.exitCode = 1;
});
