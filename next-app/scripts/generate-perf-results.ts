import "./load-env";

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { PrismaPg } from "@prisma/adapter-pg";
import { serializeSignedCookie } from "better-call";
import { chromium, devices, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { Pool } from "pg";
import { createDefaultProtocolData } from "../types/protocol";
import { createDefaultDraftState } from "../lib/draftStorage";
import {
  createPerformanceArtifactRoots,
  parseAllowList,
  resolvePathWithinRoots,
  validatePerformanceProbeBaseUrl,
} from "../lib/performance-probe-config";
import {
  PROBE_MATRIX_NAMES,
  PROBE_METRIC_NAMES,
  SUPPORTED_PROBE_PROFILES,
  buildProbeResultsArtifact,
  findMatrixCoverageIssues,
  type ProbeMatrixName,
  type ProbeMetricName,
  type ProbeProfile,
  type ProbeSample,
} from "../lib/performance-probe-results";
import type { PerformanceRouteTemplate } from "../types/performance-telemetry";

const DEFAULT_BUDGET_PATH = "../output/performance/baseline/budget-thresholds.json";
const DEFAULT_OUTPUT_PATHS: Record<ProbeMatrixName, string> = {
  mandatory: "../output/performance/results/results-latest.json",
  nightly: "../output/performance/nightly/results-nightly-latest.json",
};
const DEFAULT_BASE_URL = process.env.PERF_PROBE_BASE_URL ?? "http://127.0.0.1:3201";
const DEFAULT_RUNS = 9;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const ARTIFACT_ROOTS = createPerformanceArtifactRoots(REPO_ROOT);
const ALLOWED_PROBE_HOSTS = parseAllowList(process.env.PERF_PROBE_ALLOWED_HOSTS);
const ALLOWED_PROBE_ORIGINS = parseAllowList(process.env.PERF_PROBE_ALLOWED_ORIGINS);

const PERF_USER_ID = "perf-probe-user";
const PERF_WORKSPACE_ID = `workspace-${PERF_USER_ID}`;
const PERF_PROJECT_ID = "perf-probe-project";
const PERF_STUDY_A_ID = "perf-probe-study-a";
const PERF_STUDY_B_ID = "perf-probe-study-b";
const DEV_FALLBACK_AUTH_SECRET = "litrev-dev-only-better-auth-secret";
const DATABASE_URL = process.env.DATABASE_URL || "";

const pool = new Pool({
  connectionString: DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
  log: ["error"],
});

function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getBetterAuthSecret(): string {
  const configuredSecret = process.env.BETTER_AUTH_SECRET?.trim();
  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required in production.");
  }

  return DEV_FALLBACK_AUTH_SECRET;
}

type BudgetContract = {
  mandatoryRoutes?: PerformanceRouteTemplate[];
  mandatoryProfiles?: string[];
  nightlyRoutes?: PerformanceRouteTemplate[];
  nightlyProfiles?: string[];
  samples?: {
    ci?: {
      minRunsPerRouteProfile?: number;
    };
  };
};

type ScriptArgs = {
  baseUrl: string;
  budgetPath: string;
  commit: string;
  matrix: ProbeMatrixName;
  outputPath: string;
  source: string;
  runs: number;
};

type PerfCookie = {
  name: string;
  value: string;
  url: string;
  httpOnly: boolean;
  sameSite: "Lax";
  secure: boolean;
};

type BrowserProbeMetrics = {
  lcp: number | null;
  cls: number;
  inp: number | null;
};

type BrowserProbeWindow = Window & typeof globalThis & {
  __perfProbe?: BrowserProbeMetrics;
};

type CollectedBrowserMetrics = Record<ProbeMetricName, number | null>;

function getBrowserProbeTarget(target: BrowserProbeWindow): BrowserProbeMetrics {
  if (!target.__perfProbe) {
    target.__perfProbe = {
      lcp: null,
      cls: 0,
      inp: null,
    };
  }
  return target.__perfProbe;
}

const PROFILE_CONFIGS: Record<ProbeProfile, BrowserContextOptions> = {
  "desktop-normal": {
    viewport: { width: 1440, height: 900 },
    screen: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  },
  "mobile-mid": {
    ...devices["Pixel 7"],
  },
  "slow-network": {
    viewport: { width: 1440, height: 900 },
    screen: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  },
};

const SLOW_NETWORK_PROFILE = {
  downloadThroughputBytesPerSecond: 180_000,
  uploadThroughputBytesPerSecond: 90_000,
  latencyMs: 150,
};

function parseArgs(argv: string[]): ScriptArgs {
  let rawBudgetPath = DEFAULT_BUDGET_PATH;
  let rawOutputPath: string | null = null;
  const args: ScriptArgs = {
    baseUrl: validatePerformanceProbeBaseUrl(DEFAULT_BASE_URL, {
      allowedHosts: ALLOWED_PROBE_HOSTS,
      allowedOrigins: ALLOWED_PROBE_ORIGINS,
    }),
    budgetPath: "",
    commit: process.env.GITHUB_SHA ?? "local",
    matrix: "mandatory",
    outputPath: "",
    source: "ci-probe-playwright",
    runs: DEFAULT_RUNS,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const [rawKey, rawVal] = value.slice(2).split("=");
    const next = rawVal ?? argv[i + 1];
    if (rawVal == null && argv[i + 1] && !argv[i + 1].startsWith("--")) i += 1;

    if (rawKey === "base-url" && next) {
      args.baseUrl = validatePerformanceProbeBaseUrl(next, {
        allowedHosts: ALLOWED_PROBE_HOSTS,
        allowedOrigins: ALLOWED_PROBE_ORIGINS,
      });
    }
    if (rawKey === "budget" && next) rawBudgetPath = next;
    if (rawKey === "output" && next) rawOutputPath = next;
    if (rawKey === "commit" && next) args.commit = next;
    if (rawKey === "matrix" && next) {
      if (!PROBE_MATRIX_NAMES.includes(next as ProbeMatrixName)) {
        throw new Error(`Invalid --matrix value: ${next}`);
      }
      args.matrix = next as ProbeMatrixName;
    }
    if (rawKey === "source" && next) args.source = next;
    if (rawKey === "runs" && next) args.runs = Number.parseInt(next, 10);
  }

  if (!Number.isFinite(args.runs) || args.runs < 1) {
    throw new Error(`Invalid --runs value: ${args.runs}`);
  }

  args.budgetPath = resolvePathWithinRoots({
    cwd: process.cwd(),
    inputPath: rawBudgetPath,
    label: "budget",
    allowedRoots: [ARTIFACT_ROOTS.baselineRoot],
  });
  args.outputPath = resolvePathWithinRoots({
    cwd: process.cwd(),
    inputPath: rawOutputPath ?? DEFAULT_OUTPUT_PATHS[args.matrix],
    label: "output",
    allowedRoots: args.matrix === "mandatory"
      ? [ARTIFACT_ROOTS.resultsRoot]
      : [ARTIFACT_ROOTS.nightlyRoot],
  });

  return args;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function parseCookieValue(serializedCookie: string): string {
  const [nameValue] = serializedCookie.split(";");
  const separatorIndex = nameValue?.indexOf("=");
  if (nameValue == null || separatorIndex == null || separatorIndex < 0) {
    throw new Error("Unable to parse serialized session cookie.");
  }
  return nameValue.slice(separatorIndex + 1);
}

function routeTemplateToPath(routeTemplate: PerformanceRouteTemplate, projectId: string): string {
  switch (routeTemplate) {
    case "/ai":
      return "/ai";
    case "/project/[id]":
      return `/project/${projectId}`;
    case "/project/[id]/ledger":
      return `/project/${projectId}/ledger`;
    case "/project/[id]/draft":
      return `/project/${projectId}/draft`;
    case "/project/[id]/protocol":
      return `/project/${projectId}/protocol`;
    case "/project/[id]/notes":
      return `/project/${projectId}/notes`;
    case "/":
      return "/";
    default:
      throw new Error(`Unsupported probe route template: ${routeTemplate}`);
  }
}

async function seedProbeFixture(baseUrl: string): Promise<{ cookie: PerfCookie; projectId: string }> {
  const protocol = createDefaultProtocolData();
  protocol.researchQuestion = "How does the perf probe behave under CI?";
  protocol.eligibility.inclusion = ["Peer-reviewed studies"];
  protocol.eligibility.exclusion = ["Editorials"];

  const draftState = createDefaultDraftState();

  await prisma.user.upsert({
    where: { id: PERF_USER_ID },
    update: {
      email: "perf-probe@example.com",
      name: "Perf Probe User",
      emailVerified: true,
    },
    create: {
      id: PERF_USER_ID,
      email: "perf-probe@example.com",
      name: "Perf Probe User",
      emailVerified: true,
    },
  });

  await prisma.workspace.upsert({
    where: { id: PERF_WORKSPACE_ID },
    update: { name: "Perf Probe Workspace" },
    create: {
      id: PERF_WORKSPACE_ID,
      name: "Perf Probe Workspace",
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: PERF_WORKSPACE_ID,
        userId: PERF_USER_ID,
      },
    },
    update: { role: "owner" },
    create: {
      workspaceId: PERF_WORKSPACE_ID,
      userId: PERF_USER_ID,
      role: "owner",
    },
  });

  await prisma.project.upsert({
    where: { id: PERF_PROJECT_ID },
    update: {
      ownerId: PERF_USER_ID,
      workspaceId: PERF_WORKSPACE_ID,
      name: "Perf Probe Project",
      description: "Synthetic fixture for CI performance probes.",
      status: "harvesting",
      statusText: "Perf probe ready",
      papers: 2,
    },
    create: {
      id: PERF_PROJECT_ID,
      ownerId: PERF_USER_ID,
      workspaceId: PERF_WORKSPACE_ID,
      name: "Perf Probe Project",
      description: "Synthetic fixture for CI performance probes.",
      status: "harvesting",
      statusText: "Perf probe ready",
      papers: 2,
    },
  });

  await prisma.protocol.upsert({
    where: { projectId: PERF_PROJECT_ID },
    update: {
      data: toJsonValue(protocol),
    },
    create: {
      projectId: PERF_PROJECT_ID,
      data: toJsonValue(protocol),
    },
  });

  await prisma.draft.upsert({
    where: { projectId: PERF_PROJECT_ID },
    update: {
      state: toJsonValue(draftState),
    },
    create: {
      projectId: PERF_PROJECT_ID,
      state: toJsonValue(draftState),
    },
  });

  await prisma.study.upsert({
    where: { id: PERF_STUDY_A_ID },
    update: {
      projectId: PERF_PROJECT_ID,
      workspaceId: PERF_WORKSPACE_ID,
      title: "Perf Probe Study A",
      authors: "LitRev QA",
      year: 2025,
      status: "extracted",
      quality: "high",
    },
    create: {
      id: PERF_STUDY_A_ID,
      projectId: PERF_PROJECT_ID,
      workspaceId: PERF_WORKSPACE_ID,
      title: "Perf Probe Study A",
      authors: "LitRev QA",
      year: 2025,
      status: "extracted",
      quality: "high",
    },
  });

  await prisma.study.upsert({
    where: { id: PERF_STUDY_B_ID },
    update: {
      projectId: PERF_PROJECT_ID,
      workspaceId: PERF_WORKSPACE_ID,
      title: "Perf Probe Study B",
      authors: "LitRev QA",
      year: 2024,
      status: "active",
      quality: "medium",
    },
    create: {
      id: PERF_STUDY_B_ID,
      projectId: PERF_PROJECT_ID,
      workspaceId: PERF_WORKSPACE_ID,
      title: "Perf Probe Study B",
      authors: "LitRev QA",
      year: 2024,
      status: "active",
      quality: "medium",
    },
  });

  await prisma.session.deleteMany({
    where: { userId: PERF_USER_ID },
  });

  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId: PERF_USER_ID,
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      ipAddress: "127.0.0.1",
      userAgent: "perf-probe-playwright",
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
    getBetterAuthSecret(),
    {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  );

  return {
    projectId: PERF_PROJECT_ID,
    cookie: {
      name: cookieName,
      value: parseCookieValue(serializedCookie),
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
      secure,
    },
  };
}

async function installBrowserProbe(context: BrowserContext) {
  await context.addInitScript(() => {
    const target = window as BrowserProbeWindow;
    const probe = getBrowserProbeTarget(target);

    try {
      new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          probe.lcp = lastEntry.startTime;
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      probe.lcp = null;
    }

    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as Array<{ hadRecentInput?: boolean; value?: number }>) {
          if (!entry.hadRecentInput) {
            probe.cls += entry.value ?? 0;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      probe.cls = 0;
    }

    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as Array<{ duration?: number }>) {
          const duration = entry.duration ?? null;
          if (duration == null) continue;
          probe.inp = Math.max(probe.inp ?? 0, duration);
        }
      }).observe({
        type: "event",
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit & { durationThreshold: number });
    } catch {
      probe.inp = null;
    }

    const recordPaintLatency = () => {
      const start = performance.now();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const latency = performance.now() - start;
          probe.inp = Math.max(probe.inp ?? 0, latency);
        });
      });
    };

    window.addEventListener("pointerdown", recordPaintLatency, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", recordPaintLatency, {
      capture: true,
    });
  });
}

async function readBrowserProbeMetrics(page: Page): Promise<CollectedBrowserMetrics> {
  return page.evaluate(() => {
    const navigationEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const probe = ((window as BrowserProbeWindow).__perfProbe ?? {}) as BrowserProbeMetrics;
    return {
      LCP: typeof probe.lcp === "number" ? probe.lcp : null,
      INP: typeof probe.inp === "number" ? probe.inp : null,
      CLS: typeof probe.cls === "number" ? probe.cls : null,
      TTFB: navigationEntry ? navigationEntry.responseStart : null,
    };
  });
}

async function measureNextPaintLatency(page: Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve) => {
    const start = performance.now();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve(performance.now() - start);
      });
    });
  }));
}

async function triggerInteraction(page: Page) {
  const preferredTargets = [
    "textarea",
    "button",
    "[role='button']",
    "input",
    "a[href]",
  ];

  for (const selector of preferredTargets) {
    const target = page.locator(selector).first();
    if (await target.isVisible().catch(() => false)) {
      await target.click({ timeout: 5_000 });
      return;
    }
  }

  await page.locator("body").click({ position: { x: 24, y: 24 }, timeout: 5_000 });
}

async function captureSample(args: {
  context: BrowserContext;
  baseUrl: string;
  profile: ProbeProfile;
  routeTemplate: PerformanceRouteTemplate;
  routePath: string;
}): Promise<Record<ProbeMetricName, number>> {
  const page = await args.context.newPage();

  try {
    if (args.profile === "slow-network") {
      const session = await args.context.newCDPSession(page);
      await session.send("Network.enable");
      await session.send("Network.emulateNetworkConditions", {
        offline: false,
        downloadThroughput: SLOW_NETWORK_PROFILE.downloadThroughputBytesPerSecond,
        uploadThroughput: SLOW_NETWORK_PROFILE.uploadThroughputBytesPerSecond,
        latency: SLOW_NETWORK_PROFILE.latencyMs,
      });
    }

    await page.goto(new URL(args.routePath, args.baseUrl).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");

    if (page.url().includes("/login")) {
      throw new Error(`Unexpected login redirect for ${args.routeTemplate}`);
    }

    await page.waitForTimeout(500);
    try {
      await page.waitForFunction(() => {
        const probe = (window as BrowserProbeWindow).__perfProbe;
        return performance.getEntriesByType("navigation").length > 0 && typeof probe?.lcp === "number";
      }, { timeout: 10_000 });
    } catch {
      const snapshot = await readBrowserProbeMetrics(page);
      throw new Error(`Timed out waiting for LCP on ${args.routeTemplate}: ${JSON.stringify(snapshot)}`);
    }

    await triggerInteraction(page);

    await page.waitForFunction(() => {
      const probe = (window as BrowserProbeWindow).__perfProbe;
      return typeof probe?.inp === "number";
    }, { timeout: 2_000 }).catch(() => undefined);

    await page.waitForTimeout(250);

    const metrics = await readBrowserProbeMetrics(page);
    if (metrics.INP == null) {
      metrics.INP = await measureNextPaintLatency(page);
    }
    const missing = PROBE_METRIC_NAMES.filter((metricName) => metrics[metricName] == null);
    if (missing.length > 0) {
      throw new Error(`Timed out waiting for metrics: ${missing.join(", ")}`);
    }

    return {
      LCP: Math.round(metrics.LCP!),
      INP: Math.round(metrics.INP!),
      CLS: Number(metrics.CLS!.toFixed(3)),
      TTFB: Math.round(metrics.TTFB!),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

function resolveMatrix(args: {
  budget: BudgetContract;
  matrix: ProbeMatrixName;
}): {
  profiles: ProbeProfile[];
  routes: PerformanceRouteTemplate[];
} {
  const routes = args.matrix === "mandatory"
    ? args.budget.mandatoryRoutes ?? []
    : args.budget.nightlyRoutes ?? [];
  const profiles = (
    args.matrix === "mandatory"
      ? args.budget.mandatoryProfiles ?? []
      : args.budget.nightlyProfiles ?? []
  ) as ProbeProfile[];

  const unsupportedProfiles = profiles.filter(
    (profile) => !SUPPORTED_PROBE_PROFILES.includes(profile),
  );
  if (unsupportedProfiles.length > 0) {
    throw new Error(`Unsupported ${args.matrix} profiles: ${unsupportedProfiles.join(", ")}`);
  }

  if (routes.length === 0) {
    throw new Error(`No ${args.matrix} routes configured in the performance budget contract.`);
  }

  if (profiles.length === 0) {
    throw new Error(`No ${args.matrix} profiles configured in the performance budget contract.`);
  }

  return {
    profiles,
    routes,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const budget = readJson<BudgetContract>(args.budgetPath);
  const minSamples = budget.samples?.ci?.minRunsPerRouteProfile ?? args.runs;
  const matrix = resolveMatrix({
    budget,
    matrix: args.matrix,
  });

  const { cookie, projectId } = await seedProbeFixture(args.baseUrl);
  let browser: Browser | null = null;
  const collectedSamples: ProbeSample[] = [];

  try {
    browser = await chromium.launch({ headless: true });

    for (const profile of matrix.profiles) {
      const context = await browser.newContext(PROFILE_CONFIGS[profile]);
      await context.addCookies([cookie]);
      await installBrowserProbe(context);

      try {
        for (const routeTemplate of matrix.routes) {
          const routePath = routeTemplateToPath(routeTemplate, projectId);
          for (let run = 1; run <= args.runs; run += 1) {
            console.log(`[perf-probe] ${profile} ${routeTemplate} run ${run}/${args.runs}`);
            const metrics = await captureSample({
              context,
              baseUrl: args.baseUrl,
              profile,
              routeTemplate,
              routePath,
            });
            collectedSamples.push({
              routeTemplate,
              profile,
              metrics,
            });
          }
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await prisma.$disconnect();
  }

  const artifact = buildProbeResultsArtifact({
    capturedAt: new Date().toISOString(),
    commit: args.commit,
    matrix: args.matrix,
    source: args.source,
    runId: `${args.commit}-${Date.now()}`,
    samples: collectedSamples,
  });

  const coverageIssues = findMatrixCoverageIssues({
    results: artifact,
    routes: matrix.routes,
    profiles: matrix.profiles,
    minSamples,
  });

  if (coverageIssues.length > 0) {
    throw new Error(`Probe coverage failed:\n${coverageIssues.map((issue) => ` - ${issue}`).join("\n")}`);
  }

  fs.mkdirSync(path.dirname(args.outputPath), { recursive: true });
  fs.writeFileSync(args.outputPath, JSON.stringify(artifact, null, 2));

  const latestOutputPath = path.join(
    path.dirname(args.outputPath),
    args.matrix === "mandatory" ? "results-latest.json" : "results-nightly-latest.json",
  );
  if (latestOutputPath !== args.outputPath) {
    fs.writeFileSync(latestOutputPath, JSON.stringify(artifact, null, 2));
  }

  console.log(`[perf-probe] wrote ${args.outputPath}`);
}

void main().catch((error) => {
  console.error(`[perf-probe] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
