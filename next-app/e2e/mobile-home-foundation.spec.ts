import { expect, test } from "@playwright/test";
import { enterHomeWorkspace, quickLogin, waitForHomeReady } from "./helpers/foundation";

test.describe.configure({ mode: "serial" });

test("mobile home foundation: zero-state and workspace flows remain usable on phone", async ({ page }) => {
  await quickLogin(page, "/");
  const state = await waitForHomeReady(page);

  if (state === "zero_state") {
    await expect(page.getByRole("button", { name: /start a new review/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /explore sample/i })).toBeVisible();
    await page.getByRole("button", { name: /enter workspace/i }).click();
  }

  await expect(page.getByRole("button", { name: /create new project/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sort by/i })).toBeVisible();
});

test.describe("compact home foundation", () => {
  test.use({
    viewport: { width: 1024, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test("home workspace remains usable at compact width", async ({ page }) => {
    await quickLogin(page, "/");
    await enterHomeWorkspace(page);

    await expect(page.getByRole("button", { name: /create new project/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sort by/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /list view/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /grid view/i })).toBeVisible();
  });
});
