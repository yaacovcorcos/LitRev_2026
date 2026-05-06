import { expect, test } from "@playwright/test";

test("mobile home entry smoke: home presents a usable entry surface", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  if (page.url().includes("/login")) {
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
    return;
  }

  const unauthenticatedEntry = page.getByRole("button", { name: /start a new review/i });
  const workspacePrimary = page.getByRole("button", { name: /create new project/i });
  if (await unauthenticatedEntry.isVisible().catch(() => false)) {
    await expect(page.getByRole("button", { name: /enter workspace/i })).toHaveCount(0);
    return;
  }

  await expect(workspacePrimary).toBeVisible();
  await expect(page.getByRole("button", { name: /enter workspace/i })).toHaveCount(0);
});
