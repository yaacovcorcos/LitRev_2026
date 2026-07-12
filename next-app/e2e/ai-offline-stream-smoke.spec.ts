import { expect, test } from "@playwright/test";
import {
  fulfillAIStream,
  openAuthenticatedAi,
  sendAgentPrompt,
} from "./helpers/agent-runtime";

test("ai offline stream smoke: a real authenticated chat exits loading and offers recovery", async ({ page, context }, testInfo) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await openAuthenticatedAi(page, testInfo);

  await page.route("**/api/ai/stream", async (route) => {
    await fulfillAIStream(route, [
      { type: "run_start", runId: "run-offline-primer" },
      { type: "content", content: "The offline recovery check is ready." },
      { type: "run_end", runStatus: "completed", stopReason: "completed" },
    ]);
  }, { times: 1 });

  await sendAgentPrompt(page, "Prepare the offline recovery check");
  await expect(page.getByRole("article", { name: "Assistant" })).toContainText(
    "The offline recovery check is ready.",
  );

  try {
    await context.setOffline(true);
    await sendAgentPrompt(page, "Send while offline");

    const chat = page.getByRole("region", { name: /chat interface/i });
    await expect(chat.getByRole("alert")).toBeVisible();
    await expect(chat.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByLabel("Stop generating")).toHaveCount(0);
    await expect(page.getByRole("region", { name: /chat interface/i })).toBeVisible();
    expect(pageErrors).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});
