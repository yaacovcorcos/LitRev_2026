import { expect, test, type Route } from "@playwright/test";
import {
  assertLocalAgentRuntimeDatabase,
  cleanupSeededProject,
  fulfillAIStream,
  getStreamRequestPayload,
  openAuthenticatedAi,
  readStudyUpdateArtifactState,
  sendAgentPrompt,
  seedStudyUpdateArtifact,
} from "./helpers/agent-runtime";
import { createProjectFromHome } from "./helpers/foundation";

test("agent UI: successful output and tool receipts render through the real stream reducer", async ({ page }, testInfo) => {
  await openAuthenticatedAi(page, testInfo);
  await page.route("**/api/ai/stream", async (route) => {
    await fulfillAIStream(route, [
      { type: "run_start", runId: "run-browser-success" },
      {
        type: "tool_call",
        toolCall: {
          id: "tool-browser-pubmed",
          name: "search_pubmed",
          arguments: { query: "browser reliability evidence" },
        },
      },
      {
        type: "tool_result",
        toolName: "search_pubmed",
        toolResult: {
          callId: "tool-browser-pubmed",
          result: {
            source: "PubMed",
            query: "browser reliability evidence",
            returnedCount: 2,
            totalResults: 12,
            results: [
              { pmid: "10001", title: "Reliable browser evidence" },
              { pmid: "10002", title: "Stable browser evidence" },
            ],
          },
        },
      },
      { type: "content", content: "The deterministic agent response completed successfully." },
      { type: "run_end", runStatus: "completed", stopReason: "completed", toolCallCount: 1 },
    ]);
  }, { times: 1 });

  await sendAgentPrompt(page, "Run a deterministic browser proof");

  await expect(page.getByRole("article", { name: "You" })).toContainText(
    "Run a deterministic browser proof",
  );
  await expect(page.getByRole("article", { name: "Assistant" })).toContainText(
    "The deterministic agent response completed successfully.",
  );

  const collapsedTrace = page.getByRole("button", { name: "Show process details" });
  if (await collapsedTrace.isVisible().catch(() => false)) {
    await collapsedTrace.click();
  }
  const processDetails = page.getByRole("region", { name: "Process details" });
  await expect(processDetails).toBeVisible();
  await expect(processDetails).toContainText("PubMed");
  await expect(processDetails).toContainText(/Completed/);
  await expect(processDetails).toContainText(/2 returned|12 total|2 results/i);
  await expect(page.getByLabel("Stop generating")).toHaveCount(0);
});

test("agent UI: ask_user pauses, accepts a choice, and resumes with structured resolution", async ({ page }, testInfo) => {
  await openAuthenticatedAi(page, testInfo);
  let streamRequestCount = 0;

  await page.route("**/api/ai/stream", async (route) => {
    streamRequestCount += 1;
    if (streamRequestCount === 1) {
      await fulfillAIStream(route, [
        { type: "run_start", runId: "run-browser-ask" },
        {
          type: "user_input_required",
          userInputRequest: {
            callId: "ask-browser-source",
            questionId: "ask-browser-question",
            sourceRunId: "run-browser-ask",
            question: "Which evidence should I inspect first?",
            questionType: "single_choice",
            header: "Evidence",
            decisionBoundaryKey: "browser-evidence-order",
            options: [
              { optionId: "recent", label: "Most recent" },
              { optionId: "cited", label: "Highest cited" },
            ],
          },
        },
        { type: "run_end", runStatus: "paused", stopReason: "paused_for_input" },
      ]);
      return;
    }

    expect(getStreamRequestPayload(route).options?.userInputResolution).toMatchObject({
      sourceRunId: "run-browser-ask",
      callId: "ask-browser-source",
      questionId: "ask-browser-question",
      resolution: "answered",
      answerText: "Most recent",
      decisionBoundaryKey: "browser-evidence-order",
    });
    await fulfillAIStream(route, [
      { type: "run_start", runId: "run-browser-resumed" },
      { type: "content", content: "I resumed with the most recent evidence." },
      { type: "run_end", runStatus: "completed", stopReason: "completed" },
    ]);
  });

  await sendAgentPrompt(page, "Ask me before choosing evidence");
  await expect(page.getByText("Which evidence should I inspect first?", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Stop generating")).toHaveCount(0);

  const recentOption = page.getByRole("radio", { name: /Most recent/ }).last();
  await recentOption.click();
  await page.getByRole("button", { name: /^Submit/ }).last().click();

  await expect(page.getByRole("article", { name: "Assistant" })).toContainText(
    "I resumed with the most recent evidence.",
  );
  expect(streamRequestCount).toBe(2);
});

test("agent UI: user cancellation exits an in-flight request without leaving loading stuck", async ({ page }, testInfo) => {
  await openAuthenticatedAi(page, testInfo);
  let releaseRequest: () => void = () => undefined;
  let markRequestStarted: () => void = () => undefined;
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve;
  });
  const holdRequest = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });

  await page.route("**/api/ai/stream", async (route: Route) => {
    markRequestStarted();
    await holdRequest;
    await fulfillAIStream(route, [
      { type: "run_start", runId: "run-browser-cancelled" },
      { type: "run_end", runStatus: "cancelled", stopReason: "cancelled" },
    ]).catch(() => undefined);
  }, { times: 1 });

  try {
    await sendAgentPrompt(page, "Hold this request until I cancel it");
    await requestStarted;
    const stopButton = page.getByLabel("Stop generating");
    await expect(stopButton).toBeVisible();
    await stopButton.click();

    await expect(page.getByRole("status")).toContainText(
      "Stopped by you. Completed work is preserved.",
    );
    await expect(page.getByLabel("Stop generating")).toHaveCount(0);
    await expect(page.getByLabel("Copilot prompt")).toBeEnabled();
  } finally {
    releaseRequest();
  }
});

test("agent UI: an abruptly ended stream replays durable output and terminal truth", async ({ page }, testInfo) => {
  await openAuthenticatedAi(page, testInfo);

  await page.route("**/api/ai/stream", async (route) => {
    await fulfillAIStream(route, [
      { type: "run_start", runId: "run-browser-recovery" },
    ]);
  }, { times: 1 });
  await page.route("**/api/ai/recovery", async (route) => {
    const now = new Date().toISOString();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversationId: getStreamRequestPayload(route).options?.conversationId ?? "conversation-recovery",
        runId: "run-browser-recovery",
        runStatus: "completed",
        isActive: false,
        runPhase: "finalize",
        phaseEnteredAt: now,
        lastActivityAt: now,
        lastDurableProgressAt: now,
        durabilityState: "durable",
        durabilityDegradedReason: null,
        finalizationState: "completed",
        lastSequence: 2,
        replayableEvents: [{
          sequence: 1,
          chunk: {
            type: "content",
            content: "Recovered durable output is visible.",
            replay: true,
          },
        }],
        terminalEvent: {
          chunk: {
            type: "run_end",
            runStatus: "completed",
            stopReason: "completed",
            replay: true,
          },
        },
        recoveryRecommendation: "terminal",
        abnormalEndClassification: null,
      }),
    });
  }, { times: 1 });

  await sendAgentPrompt(page, "Recover this interrupted deterministic stream");

  await expect(page.getByRole("article", { name: "Assistant" })).toContainText(
    "Recovered durable output is visible.",
  );
  await expect(
    page.getByRole("region", { name: /chat interface/i }).getByRole("alert"),
  ).toHaveCount(0);
  await expect(page.getByLabel("Stop generating")).toHaveCount(0);
});

test("agent UI: a seeded study update accepts and undoes through real server actions", async ({ page }, testInfo) => {
  assertLocalAgentRuntimeDatabase();
  const seedKey = await openAuthenticatedAi(page, testInfo);
  const projectId = await createProjectFromHome(page, {
    name: "Agent artifact browser proof",
    seedKey,
    openProject: false,
  });
  try {
    const fixture = await seedStudyUpdateArtifact({ projectId, seedKey });
    await page.goto(
      `/ai?project=${encodeURIComponent(projectId)}&conversation=${encodeURIComponent(fixture.conversationId)}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByText("Deterministic study update", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply changes" })).toBeEnabled();

    await page.getByRole("button", { name: "Apply changes" }).click();
    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
    await expect.poll(async () => readStudyUpdateArtifactState(fixture)).toEqual({
      artifactStatus: "accepted",
      studyTitle: fixture.updatedTitle,
    });

    await page.getByRole("button", { name: "Undo" }).click();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toContainText("Undo applied change?");
    await confirmation.getByRole("button", { name: "Undo" }).click();

    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
    await expect.poll(async () => readStudyUpdateArtifactState(fixture)).toEqual({
      artifactStatus: "rejected",
      studyTitle: fixture.originalTitle,
    });
  } finally {
    await cleanupSeededProject(projectId);
  }
});
