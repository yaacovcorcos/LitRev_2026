import { expect, test } from "@playwright/test";
import { enterHomeWorkspace } from "./helpers/foundation";

test.use({
  viewport: { width: 1280, height: 900 },
  isMobile: false,
  hasTouch: false,
});

test("desktop home shell scroll smoke: tall workspaces scroll inside the project list surface", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/login?callbackUrl=%2F", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /dev mode/i }).click();
  await page.waitForURL(/\/$/, { timeout: 60_000 });
  await enterHomeWorkspace(page);

  await expect(page.getByRole("button", { name: /create new project/i })).toBeVisible();

  const scrollBody = page.locator(".surface-scroll-body");
  await expect(scrollBody).toBeVisible();

  await scrollBody.evaluate((element) => {
    const grid = element.firstElementChild;
    if (!grid) return;

    const cards = Array.from(grid.children);
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < 20; index += 1) {
      const source = cards[index % cards.length];
      const clone = source.cloneNode(true);
      if (clone instanceof HTMLElement) {
        clone.setAttribute("data-scroll-fixture-clone", String(index + 1));
      }
      fragment.appendChild(clone);
    }
    grid.appendChild(fragment);
  });

  await expect
    .poll(async () => scrollBody.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    })))
    .toEqual(expect.objectContaining({
      clientHeight: expect.any(Number),
      scrollHeight: expect.any(Number),
    }));

  const hasOverflow = await scrollBody.evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(hasOverflow).toBe(true);

  const box = await scrollBody.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + box!.width / 2, box!.y + Math.min(200, box!.height / 2));

  const beforeWindowY = await page.evaluate(() => window.scrollY);
  expect(beforeWindowY).toBe(0);

  await page.mouse.wheel(0, 700);

  await expect.poll(() => scrollBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
