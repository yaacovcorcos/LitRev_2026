import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 1280, height: 900 },
  isMobile: false,
  hasTouch: false,
});

test("desktop project shell interaction smoke: wheel + mode switches stay responsive", async ({ page }) => {
  const projectId = process.env.E2E_PROJECT_ID ?? "demo-project";
  await page.goto(`/project/${projectId}`);
  await page.waitForLoadState("domcontentloaded");

  if (page.url().includes("/login")) {
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: /send magic link/i })).toBeVisible();
    return;
  }

  const workspaceModeBtn = page.getByRole("radio", { name: /workspace/i });
  const conversationModeBtn = page.getByRole("radio", { name: /conversation/i });
  await expect(workspaceModeBtn).toBeVisible();
  await expect(conversationModeBtn).toBeVisible();

  await workspaceModeBtn.click();
  await expect(workspaceModeBtn).toHaveAttribute("aria-checked", "true");

  const copilot = page.getByLabel("AI copilot");
  await expect(copilot).toBeVisible();

  const header = copilot.locator("button[aria-label='Collapse copilot']").first();
  await expect(header).toBeVisible();
  await header.hover();
  await page.mouse.wheel(0, 400);
  await page.mouse.wheel(0, -400);

  await conversationModeBtn.click();
  await expect(conversationModeBtn).toHaveAttribute("aria-checked", "true");
  await workspaceModeBtn.click();
  await expect(workspaceModeBtn).toHaveAttribute("aria-checked", "true");
});
