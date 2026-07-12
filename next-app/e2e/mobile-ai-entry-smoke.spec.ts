import { expect, test } from "@playwright/test";
import { buildFoundationSeedKey, quickLoginWithSeed } from "./helpers/foundation";

test("mobile ai entry smoke: an authenticated user reaches the real chat composer", async ({ page }, testInfo) => {
  await quickLoginWithSeed(page, {
    callbackUrl: "/ai",
    seedKey: buildFoundationSeedKey(testInfo),
  });

  await expect(page).toHaveURL(/\/ai(?:\?|$)/);
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("region", { name: /chat interface/i })).toBeVisible();
  await expect(page.getByLabel("Copilot prompt")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});
