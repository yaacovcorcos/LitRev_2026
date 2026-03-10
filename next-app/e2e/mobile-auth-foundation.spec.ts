import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("mobile auth foundation: login supports quick access and redirects to home", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email address")).toBeVisible();

  const devMode = page.getByRole("button", { name: /dev mode/i });
  await expect(devMode).toBeVisible();
  await devMode.click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await expect(page).toHaveURL(/\/$/);
});

test("mobile auth foundation: signup keeps account creation controls accessible", async ({ page }) => {
  await page.goto("/signup");

  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: /magic link/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
});
