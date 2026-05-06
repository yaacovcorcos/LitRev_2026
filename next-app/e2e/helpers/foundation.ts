import { expect, type Page, type TestInfo } from "@playwright/test";

const nonOperationalTelemetryStubbedPages = new WeakSet<Page>();

async function stubNonOperationalTelemetry(page: Page): Promise<void> {
  if (nonOperationalTelemetryStubbedPages.has(page)) return;

  const endpointsToStub = {
    "**/api/admin/status": JSON.stringify({ isPlatformAdmin: false }),
    "**/api/telemetry/chat-unification": "{}",
    "**/api/telemetry/citation-preview": "{}",
    "**/api/telemetry/context-capture": "{}",
    "**/api/telemetry/performance": "{}",
    "**/api/telemetry/reliability": "{}",
  };

  for (const [endpoint, body] of Object.entries(endpointsToStub)) {
    await page.route(endpoint, async (route) => {
      await route.fulfill({
        status: 204,
        contentType: "application/json",
        body,
      });
    });
  }

  nonOperationalTelemetryStubbedPages.add(page);
}

async function postWithRetries(
  page: Page,
  url: string,
  data: Record<string, unknown> | undefined,
  attempts = 4,
): Promise<Awaited<ReturnType<Page["request"]["post"]>>> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await page.request.post(url, data ? { data } : undefined);
      if (response.ok()) {
        return response;
      }

      lastError = new Error(`Request to ${url} failed with status ${response.status()}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts - 1) {
      await page.waitForTimeout(500 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request to ${url} failed`);
}

function normalizeSeedSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "fixture";
}

export function buildFoundationSeedKey(testInfo: Pick<TestInfo, "project" | "workerIndex" | "title">): string {
  const projectName = normalizeSeedSegment(testInfo.project.name);
  const title = normalizeSeedSegment(testInfo.title);
  return `${projectName}-w${testInfo.workerIndex}-${title}`;
}

type QuickLoginOptions = {
  callbackUrl?: string;
  seedKey?: string;
};

export async function quickLoginWithSeed(
  page: Page,
  { callbackUrl = "/", seedKey }: QuickLoginOptions = {},
): Promise<void> {
  await stubNonOperationalTelemetry(page);
  await postWithRetries(page, "/api/dev/quick-login", { callbackUrl, seedKey });

  const callbackTarget = new URL(callbackUrl, "http://localhost");
  await page.goto(callbackUrl);
  if (page.url().includes("/login")) {
    await postWithRetries(page, "/api/dev/quick-login", { callbackUrl, seedKey });
    await page.goto(callbackUrl);
  }

  await page.waitForURL((url) =>
    url.pathname === callbackTarget.pathname &&
    url.search === callbackTarget.search,
  );
  await page.waitForLoadState("domcontentloaded");
}

export async function quickLogin(page: Page, callbackUrl = "/"): Promise<void> {
  await quickLoginWithSeed(page, { callbackUrl });
}

export async function waitForHomeReady(page: Page): Promise<"loading" | "workspace"> {
  const loadingText = page.getByText(/syncing your workspace|loading your projects|warming up ai tools|preparing your reviews/i);
  const workspacePrimary = page.getByRole("button", { name: /create new project/i });

  await expect.poll(async () => {
    if (await loadingText.isVisible().catch(() => false)) return "loading";
    if (await workspacePrimary.isVisible().catch(() => false)) return "workspace";
    return "pending";
  }).toMatch(/loading|workspace/);

  if (await workspacePrimary.isVisible().catch(() => false)) return "workspace";
  return "loading";
}

async function waitForHomeHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const perf = (window as Window & {
      __litrevHomePerf?: { homeReadyMs?: number };
    }).__litrevHomePerf;
    return typeof perf?.homeReadyMs === "number";
  }, { timeout: 15_000 });
}

export async function enterHomeWorkspace(page: Page): Promise<void> {
  let state = await waitForHomeReady(page);
  if (state === "loading") {
    await expect.poll(async () => {
      const nextState = await waitForHomeReady(page);
      return nextState === "loading" ? "pending" : nextState;
    }).toBe("workspace");
    state = await waitForHomeReady(page);
  }
  if (state === "workspace") {
    await waitForHomeHydration(page);
  }
}

export async function setHomeState(
  page: Page,
  {
    seedKey,
    state,
    projectCount,
  }: {
    seedKey: string;
    state: "empty_workspace" | "workspace";
    projectCount?: number;
  },
): Promise<void> {
  await postWithRetries(page, "/api/dev/test-home-state", {
    seedKey,
    state,
    projectCount,
  });

  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await enterHomeWorkspace(page);

  await expect.poll(async () => waitForHomeReady(page), { timeout: 30_000 }).toBe("workspace");
}

export async function createProjectFromHome(
  page: Page,
  {
    name = "E2E Mobile Project",
    seedKey,
    openProject = true,
  }: {
    name?: string;
    seedKey?: string;
    openProject?: boolean;
  } = {},
): Promise<string> {
  const response = await postWithRetries(page, "/api/dev/test-project", {
    name,
    seedKey,
  });
  const payload = (await response.json()) as { projectId?: string };
  expect(payload.projectId).toMatch(/^.+$/);

  if (openProject) {
    await page.goto(`/project/${payload.projectId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForURL(/\/project\/[^/]+$/);
    await expect(page.getByRole("heading", { name: /project not found/i })).not.toBeVisible();
  }

  return payload.projectId!;
}

export async function openSampleProjectFromHome(
  page: Page,
  { seedKey }: { seedKey?: string } = {},
): Promise<string> {
  const response = await postWithRetries(page, "/api/dev/demo-project", { seedKey });
  const payload = (await response.json()) as { projectId?: string };
  expect(payload.projectId).toMatch(/^.+$/);

  await page.goto(`/project/${payload.projectId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForURL(/\/project\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /project not found/i })).not.toBeVisible();

  const match = page.url().match(/\/project\/([^/]+)$/);
  expect(match).not.toBeNull();
  return match![1];
}
