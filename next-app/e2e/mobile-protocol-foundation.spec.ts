import { expect, test } from "@playwright/test";
import {
  buildFoundationSeedKey,
  createProjectFromHome,
  quickLoginWithSeed,
} from "./helpers/foundation";

test.setTimeout(60_000);

test("mobile protocol foundation: protocol route remains usable on phone", async ({ page }, testInfo) => {
  const seedKey = buildFoundationSeedKey(testInfo);
  await quickLoginWithSeed(page, { callbackUrl: "/", seedKey });
  const projectId = await createProjectFromHome(page, {
    name: "Mobile Protocol Foundation",
    seedKey,
    openProject: false,
  });
  await page.goto(`/project/${projectId}/protocol`, { waitUntil: "domcontentloaded", timeout: 30_000 });

  await expect(page.getByRole("heading", { name: /project not found/i })).not.toBeVisible();
  await expect(page.getByText(/protocol completeness/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /export/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("radio", { name: /chat|conversation/i })).toBeVisible();
});

test.describe("compact protocol foundation", () => {
  test.use({
    viewport: { width: 1024, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test("protocol route remains usable at compact width", async ({ page }, testInfo) => {
    const seedKey = buildFoundationSeedKey(testInfo);
    await quickLoginWithSeed(page, { callbackUrl: "/", seedKey });
    const projectId = await createProjectFromHome(page, {
      name: "Compact Protocol Foundation",
      seedKey,
      openProject: false,
    });
    await page.goto(`/project/${projectId}/protocol`, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await expect(page.getByRole("heading", { name: /project not found/i })).not.toBeVisible();
    await expect(page.getByText(/protocol completeness/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /export/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("radio", { name: /chat|conversation/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /workspace|workspaces/i })).toBeVisible();
  });
});
