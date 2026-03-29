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

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = "secret-token";
    mocks.processOneStudyProcessingJob.mockResolvedValue({ processed: false });
  });

  afterEach(() => {
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = previousToken;
  });

  it("rejects unauthorized requests", async () => {
    const response = await GET(new Request("http://localhost/api/internal/study-processing"));

    expect(response.status).toBe(401);
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
        Authorization: "Bearer secret-token",
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
