import { expect, type Page } from "@playwright/test";

const telemetryStubbedPages = new WeakSet<Page>();

async function stubTelemetry(page: Page): Promise<void> {
  if (telemetryStubbedPages.has(page)) return;

  await page.route("**/api/telemetry/**", async (route) => {
    await route.fulfill({
      status: 204,
      contentType: "application/json",
      body: "{}",
    });
  });

  telemetryStubbedPages.add(page);
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

export async function quickLogin(page: Page, callbackUrl = "/"): Promise<void> {
  await stubTelemetry(page);
  await postWithRetries(page, "/api/dev/quick-login", { callbackUrl });

  const callbackTarget = new URL(callbackUrl, "http://localhost");
  await page.goto(callbackUrl);
  if (page.url().includes("/login")) {
    await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    const devMode = page.getByRole("button", { name: /dev mode/i });
    await expect(devMode).toBeVisible();
    await devMode.click();
  }

  await page.waitForURL((url) =>
    url.pathname === callbackTarget.pathname &&
    url.search === callbackTarget.search,
  );
  await page.waitForLoadState("domcontentloaded");
}

export async function waitForHomeReady(page: Page): Promise<"loading" | "zero_state" | "workspace"> {
  const loadingText = page.getByText(/syncing your workspace|loading your projects|warming up ai tools|preparing your reviews/i);
  const zeroPrimary = page.getByRole("button", { name: /start a new review/i });
  const workspacePrimary = page.getByRole("button", { name: /create new project/i });
  const enterWorkspace = page.getByRole("button", { name: /enter workspace/i });

  await expect.poll(async () => {
    if (await loadingText.isVisible().catch(() => false)) return "loading";
    if (await zeroPrimary.isVisible().catch(() => false)) return "zero_state";
    if (await workspacePrimary.isVisible().catch(() => false)) return "workspace";
    if (await enterWorkspace.isVisible().catch(() => false)) return "zero_state";
    return "pending";
  }).toMatch(/loading|zero_state|workspace/);

  if (await zeroPrimary.isVisible().catch(() => false)) return "zero_state";
  if (await workspacePrimary.isVisible().catch(() => false)) return "workspace";
  return "loading";
}

export async function enterHomeWorkspace(page: Page): Promise<void> {
  let state = await waitForHomeReady(page);
  if (state === "loading") {
    await expect.poll(async () => {
      const nextState = await waitForHomeReady(page);
      return nextState === "loading" ? "pending" : nextState;
    }).toMatch(/zero_state|workspace/);
    state = await waitForHomeReady(page);
  }
  if (state === "zero_state") {
    await page.getByRole("button", { name: /enter workspace/i }).click();
    await expect(page.getByRole("button", { name: /create new project/i })).toBeVisible();
  }
}

export async function createProjectFromHome(page: Page, name = "E2E Mobile Project"): Promise<string> {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await enterHomeWorkspace(page);
  await page.getByRole("button", { name: /create new project/i }).click();

  await expect(page.getByRole("heading", { name: /what are you researching/i })).toBeVisible();
  await page.getByLabel(/project name/i).fill(name);
  await page.getByRole("button", { name: /create blank/i }).click();

  const createdProjectLink = page.getByRole("link", { name: new RegExp(`open project ${name}`, "i") });
  await expect.poll(async () => {
    if (/\/project\/[^/]+$/.test(page.url())) return "navigated";
    if (await createdProjectLink.isVisible().catch(() => false)) return "linked";
    if (await page.getByText(/failed to create the project/i).isVisible().catch(() => false)) return "failed";
    return "pending";
  }, { timeout: 30_000 }).toMatch(/navigated|linked/);

  if (!/\/project\/[^/]+$/.test(page.url())) {
    const projectHref = await createdProjectLink.getAttribute("href");
    expect(projectHref).toMatch(/^\/project\/[^/]+$/);
    await page.goto(projectHref!, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForURL(/\/project\/[^/]+$/);
  }

  const match = page.url().match(/\/project\/([^/]+)$/);
  expect(match).not.toBeNull();
  await expect(page.getByRole("heading", { name: /project not found/i })).not.toBeVisible();
  return match![1];
}

export async function openSampleProjectFromHome(page: Page): Promise<string> {
  const response = await postWithRetries(page, "/api/dev/demo-project", undefined);
  const payload = (await response.json()) as { projectId?: string };
  expect(payload.projectId).toMatch(/^.+$/);

  await page.goto(`/project/${payload.projectId}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForURL(/\/project\/[^/]+$/);
  await expect(page.getByRole("heading", { name: /project not found/i })).not.toBeVisible();

  const match = page.url().match(/\/project\/([^/]+)$/);
  expect(match).not.toBeNull();
  return match![1];
}
