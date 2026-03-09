import { expect, test } from "@playwright/test";
import { createProjectFromHome, quickLogin } from "./helpers/foundation";

test.describe.configure({ mode: "serial" });

test("mobile protocol foundation: protocol route remains usable on phone", async ({ page }) => {
  await quickLogin(page, "/");
  const projectId = await createProjectFromHome(page, "Mobile Protocol Foundation");
  await page.goto(`/project/${projectId}/protocol`);

  await expect(page.getByRole("heading", { name: /project not found/i })).not.toBeVisible();
  await expect(page.getByRole("button", { name: /export/i })).toBeVisible();
  await expect(page.getByText(/protocol completeness/i)).toBeVisible();
  await expect(page.getByRole("radio", { name: /chat|conversation/i })).toBeVisible();
});

test.describe("compact protocol foundation", () => {
  test.use({
    viewport: { width: 1024, height: 900 },
    isMobile: false,
    hasTouch: false,
  });

  test("protocol route remains usable at compact width", async ({ page }) => {
    await quickLogin(page, "/");
    const projectId = await createProjectFromHome(page, "Compact Protocol Foundation");
    await page.goto(`/project/${projectId}/protocol`);

    await expect(page.getByRole("heading", { name: /project not found/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /export/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /chat|conversation/i })).toBeVisible();
    await expect(page.getByRole("radio", { name: /workspace|workspaces/i })).toBeVisible();
    await expect(page.getByText(/protocol completeness/i)).toBeVisible();
  });
});
