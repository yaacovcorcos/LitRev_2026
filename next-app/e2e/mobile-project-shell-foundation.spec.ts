import { expect, test } from "@playwright/test";
import {
  buildFoundationSeedKey,
  openSampleProjectFromHome,
  quickLoginWithSeed,
} from "./helpers/foundation";

test("mobile project shell foundation: project entry remains usable on phone", async ({ page }, testInfo) => {
  const seedKey = buildFoundationSeedKey(testInfo);
  await quickLoginWithSeed(page, { callbackUrl: "/", seedKey });
  await openSampleProjectFromHome(page, { seedKey });

  const conversationModeBtn = page.getByRole("radio", { name: /conversation|chat/i });
  const workspaceModeBtn = page.getByRole("radio", { name: /workspace|workspaces/i });

  await expect(conversationModeBtn).toBeVisible();
  await expect(workspaceModeBtn).toBeVisible();
  await workspaceModeBtn.click();
  await expect(workspaceModeBtn).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("heading", { name: /project not found/i })).not.toBeVisible();
});

test.describe("compact project shell foundation", () => {
  test.use({
    viewport: { width: 1024, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test("project entry remains usable at compact width", async ({ page }, testInfo) => {
    const seedKey = buildFoundationSeedKey(testInfo);
    await quickLoginWithSeed(page, { callbackUrl: "/", seedKey });
    await openSampleProjectFromHome(page, { seedKey });

    const conversationModeBtn = page.getByRole("radio", { name: /conversation|chat/i });
    const workspaceModeBtn = page.getByRole("radio", { name: /workspace|workspaces/i });

    await expect(conversationModeBtn).toBeVisible();
    await expect(workspaceModeBtn).toBeVisible();
    await conversationModeBtn.click();
    // Entering conversation mode may need to create the project's first
    // durable conversation before the shell can switch. Under parallel cold
    // compilation that is intentionally asynchronous, so wait for its route
    // contract instead of treating it as a synchronous radio toggle.
    await expect(page).toHaveURL(/\/project\/[^/]+\/conversation\/[^/]+$/, { timeout: 30_000 });
    await expect(conversationModeBtn).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /project not found/i })).not.toBeVisible();
  });
});
