import { expect, test } from "@playwright/test";
import {
  buildFoundationSeedKey,
  enterHomeWorkspace,
  quickLoginWithSeed,
  setHomeState,
  waitForHomeReady,
} from "./helpers/foundation";

test("mobile home foundation: zero-state and workspace flows remain usable on phone", async ({ page }, testInfo) => {
  const seedKey = buildFoundationSeedKey(testInfo);
  await quickLoginWithSeed(page, { callbackUrl: "/", seedKey });
  await setHomeState(page, { seedKey, state: "zero_state" });
  const state = await waitForHomeReady(page);
  expect(state).toBe("zero_state");

  if (state === "zero_state") {
    await expect(page.getByRole("button", { name: /start a new review/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /explore sample/i })).toBeVisible();
  }

  await enterHomeWorkspace(page);

  await expect(page.getByRole("button", { name: /create new project/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sort by/i })).toBeVisible();
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
