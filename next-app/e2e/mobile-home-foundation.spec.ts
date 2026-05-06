import { expect, test } from "@playwright/test";
import {
  buildFoundationSeedKey,
  quickLoginWithSeed,
  setHomeState,
  waitForHomeReady,
} from "./helpers/foundation";

test("mobile home foundation: empty workspace opens directly on phone", async ({ page }, testInfo) => {
  const seedKey = buildFoundationSeedKey(testInfo);
  await quickLoginWithSeed(page, { callbackUrl: "/", seedKey });
  await setHomeState(page, { seedKey, state: "empty_workspace" });
  const state = await waitForHomeReady(page);
  expect(state).toBe("workspace");

  await expect(page.getByRole("button", { name: /create new project/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sort by/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /enter workspace/i })).toHaveCount(0);
});

test.describe("compact home foundation", () => {
  test.use({
    viewport: { width: 1024, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test("home workspace remains usable at compact width", async ({ page }, testInfo) => {
    const seedKey = buildFoundationSeedKey(testInfo);
    await quickLoginWithSeed(page, { callbackUrl: "/", seedKey });
    await setHomeState(page, { seedKey, state: "workspace" });

    await expect(page.getByRole("button", { name: /create new project/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sort by/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /list view/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /grid view/i })).toBeVisible();
  });
});
