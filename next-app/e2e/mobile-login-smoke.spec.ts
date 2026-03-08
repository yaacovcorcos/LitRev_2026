import { expect, test } from "@playwright/test";

test("mobile login smoke: renders and keeps key auth controls accessible", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByText("LitRev")).toBeVisible();

  const emailInput = page.getByLabel("Email address");
  await expect(emailInput).toBeVisible();
  await emailInput.tap();
  await expect(emailInput).toBeFocused();

  await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
});

test("mobile signup smoke: renders and keeps account creation controls accessible", async ({ page }) => {
  await page.goto("/signup");

  await expect(page.getByText("LitRev")).toBeVisible();

  const emailInput = page.getByLabel("Email address");
  await expect(emailInput).toBeVisible();
  await emailInput.tap();
  await expect(emailInput).toBeFocused();

  await expect(page.getByRole("button", { name: /magic link/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
});
