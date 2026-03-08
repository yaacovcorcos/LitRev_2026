import { expect, test } from "@playwright/test";

test("mobile home entry smoke: home presents a usable entry surface", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  if (page.url().includes("/login")) {
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
    return;
  }

  const zeroStatePrimary = page.getByRole("button", { name: /start a new review/i });
  const workspacePrimary = page.getByRole("button", { name: /create new project/i });
  const enterWorkspace = page.getByRole("button", { name: /enter workspace without creating a project/i });

  const homeIsVisible = await zeroStatePrimary.isVisible().catch(() => false);
  if (homeIsVisible) {
    await expect(enterWorkspace).toBeVisible();
    return;
  }

  await expect(workspacePrimary).toBeVisible();
});
