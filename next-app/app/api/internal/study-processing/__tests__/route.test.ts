import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processOneStudyProcessingJob: vi.fn(),
}));

vi.mock("@/lib/server/study-processing", () => ({
  processOneStudyProcessingJob: (...args: unknown[]) => mocks.processOneStudyProcessingJob(...args),
}));

const { GET, POST } = await import("@/app/api/internal/study-processing/route");

describe("study-processing internal route", () => {
  const previousToken = process.env.STUDY_PROCESSING_INTERNAL_TOKEN;
  const previousCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = "internal-secret";
    process.env.CRON_SECRET = "cron-secret";
    mocks.processOneStudyProcessingJob.mockResolvedValue({ processed: false });
  });

  afterEach(() => {
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = previousToken;
    process.env.CRON_SECRET = previousCronSecret;
  });

  it("rejects GET requests", async () => {
    const response = await GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("rejects unauthorized POST requests", async () => {
    const response = await POST(new Request("http://localhost/api/internal/study-processing", {
      method: "POST",
    }));

    expect(response.status).toBe(401);
  });

  it("rejects requests authenticated with CRON_SECRET or cron headers only", async () => {
    const cronSecretResponse = await POST(new Request("http://localhost/api/internal/study-processing", {
      method: "POST",
      headers: {
        Authorization: "Bearer cron-secret",
      },
    }));
    const headerOnlyResponse = await POST(new Request("http://localhost/api/internal/study-processing", {
      method: "POST",
      headers: {
        "x-vercel-cron": "1",
      },
    }));

    expect(cronSecretResponse.status).toBe(401);
    expect(headerOnlyResponse.status).toBe(401);
  });

  it("processes one job for authorized POST requests", async () => {
    mocks.processOneStudyProcessingJob.mockResolvedValue({
      processed: true,
      success: true,
      studyId: "study-1",
    });

    const response = await POST(new Request("http://localhost/api/internal/study-processing", {
      method: "POST",
      headers: {
        Authorization: "Bearer internal-secret",
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: true,
      success: true,
      studyId: "study-1",
    });
  });
});
