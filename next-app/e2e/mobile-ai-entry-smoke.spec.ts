import { expect, test } from "@playwright/test";

test("mobile ai entry smoke: route is reachable or redirects to login with usable controls", async ({ page }) => {
  await page.goto("/ai");
  await page.waitForLoadState("domcontentloaded");

  if (page.url().includes("/login")) {
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
    return;
  }

  await expect(page.getByRole("region", { name: /chat interface/i })).toBeVisible();
  await expect(page.getByLabel("Copilot prompt")).toBeVisible();
});
