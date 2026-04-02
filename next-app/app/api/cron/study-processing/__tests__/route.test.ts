import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processOneStudyProcessingJob: vi.fn(),
}));

vi.mock("@/lib/server/study-processing", () => ({
  processOneStudyProcessingJob: (...args: unknown[]) => mocks.processOneStudyProcessingJob(...args),
}));

const { GET, POST } = await import("@/app/api/cron/study-processing/route");

describe("study-processing cron route", () => {
  const previousCronSecret = process.env.CRON_SECRET;
  const previousInternalToken = process.env.STUDY_PROCESSING_INTERNAL_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = "internal-secret";
    mocks.processOneStudyProcessingJob.mockResolvedValue({ processed: false });
  });

  afterEach(() => {
    process.env.CRON_SECRET = previousCronSecret;
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = previousInternalToken;
  });

  it("rejects requests without the cron secret", async () => {
    const response = await GET(new Request("http://localhost/api/cron/study-processing", {
      headers: {
        "x-vercel-cron": "1",
      },
    }));

    expect(response.status).toBe(401);
  });

  it("rejects requests authenticated with the internal token", async () => {
    const response = await GET(new Request("http://localhost/api/cron/study-processing", {
      headers: {
        Authorization: "Bearer internal-secret",
      },
    }));

    expect(response.status).toBe(401);
  });

  it("processes one job for requests authenticated with CRON_SECRET", async () => {
    mocks.processOneStudyProcessingJob.mockResolvedValue({
      processed: true,
      success: true,
      studyId: "study-1",
    });

    const response = await GET(new Request("http://localhost/api/cron/study-processing", {
      headers: {
        Authorization: "Bearer cron-secret",
      },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: true,
      success: true,
      studyId: "study-1",
    });
  });

  it("rejects POST requests", async () => {
    const response = await POST();

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET");
  });
});
