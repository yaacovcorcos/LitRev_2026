import { expect, test } from "@playwright/test";

test("ai offline stream smoke: route remains responsive when offline is toggled", async ({ page, context }) => {
  await page.goto("/ai");
  await page.waitForLoadState("domcontentloaded");

  if (page.url().includes("/login")) {
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
    return;
  }

  await expect(page.getByRole("region", { name: /chat interface/i })).toBeVisible();
  await expect(page.getByLabel("Copilot prompt")).toBeVisible();

  await context.setOffline(true);
  await page.getByLabel("Copilot prompt").fill("Test offline send");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: /chat interface/i })).toBeVisible();
  await context.setOffline(false);
});
