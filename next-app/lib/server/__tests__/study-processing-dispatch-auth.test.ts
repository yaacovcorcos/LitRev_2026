import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isAuthorizedStudyProcessingCronRequest,
  isAuthorizedStudyProcessingInternalRequest,
} from "@/lib/server/study-processing-dispatch-auth";

describe("study-processing dispatch auth", () => {
  const previousInternalToken = process.env.STUDY_PROCESSING_INTERNAL_TOKEN;
  const previousCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = "internal-secret";
    process.env.CRON_SECRET = "cron-secret";
  });

  afterEach(() => {
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = previousInternalToken;
    process.env.CRON_SECRET = previousCronSecret;
  });

  it("rejects requests with no authorization header", () => {
    const request = new Request("http://localhost/api/internal/study-processing");

    expect(isAuthorizedStudyProcessingInternalRequest(request)).toBe(false);
    expect(isAuthorizedStudyProcessingCronRequest(request)).toBe(false);
  });

  it("rejects malformed and blank bearer tokens", () => {
    const malformedHeader = new Request("http://localhost/api/internal/study-processing", {
      headers: {
        Authorization: "Token internal-secret",
      },
    });
    const blankBearer = new Request("http://localhost/api/internal/study-processing", {
      headers: {
        Authorization: "Bearer   ",
      },
    });

    expect(isAuthorizedStudyProcessingInternalRequest(malformedHeader)).toBe(false);
    expect(isAuthorizedStudyProcessingInternalRequest(blankBearer)).toBe(false);
  });

  it("rejects otherwise correct tokens when the expected secret is missing", () => {
    process.env.STUDY_PROCESSING_INTERNAL_TOKEN = "";
    process.env.CRON_SECRET = "";

    const internalRequest = new Request("http://localhost/api/internal/study-processing", {
      headers: {
        Authorization: "Bearer internal-secret",
      },
    });
    const cronRequest = new Request("http://localhost/api/cron/study-processing", {
      headers: {
        Authorization: "Bearer cron-secret",
      },
    });

    expect(isAuthorizedStudyProcessingInternalRequest(internalRequest)).toBe(false);
    expect(isAuthorizedStudyProcessingCronRequest(cronRequest)).toBe(false);
  });

  it("requires an exact secret match for each boundary", () => {
    const internalRequest = new Request("http://localhost/api/internal/study-processing", {
      headers: {
        Authorization: "Bearer internal-secret",
      },
    });
    const wrongInternalRequest = new Request("http://localhost/api/internal/study-processing", {
      headers: {
        Authorization: "Bearer cron-secret",
      },
    });
    const cronRequest = new Request("http://localhost/api/cron/study-processing", {
      headers: {
        Authorization: "Bearer cron-secret",
      },
    });
    const wrongCronRequest = new Request("http://localhost/api/cron/study-processing", {
      headers: {
        Authorization: "Bearer internal-secret",
      },
    });

    expect(isAuthorizedStudyProcessingInternalRequest(internalRequest)).toBe(true);
    expect(isAuthorizedStudyProcessingInternalRequest(wrongInternalRequest)).toBe(false);
    expect(isAuthorizedStudyProcessingCronRequest(cronRequest)).toBe(true);
    expect(isAuthorizedStudyProcessingCronRequest(wrongCronRequest)).toBe(false);
  });
});
