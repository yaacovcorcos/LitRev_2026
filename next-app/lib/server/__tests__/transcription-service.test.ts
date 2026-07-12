import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  assertProjectAccess: vi.fn(),
  reserveProviderUsageAttempt: vi.fn(),
  tryMarkUsageReservationReconcilable: vi.fn(),
  trySettleUsageReservation: vi.fn(),
  transcribeAudio: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));

vi.mock("@/lib/ai/config", () => ({
  AI_CONFIG: {
    maxRequestsPerMinute: 20,
    maxTokensPerDay: 300000,
    maxTranscriptionsPerDay: 100,
  },
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: mocks.assertProjectAccess,
}));

vi.mock("@/lib/server/ai/rate-limiter", () => ({
  reserveProviderUsageAttempt: mocks.reserveProviderUsageAttempt,
  tryMarkUsageReservationReconcilable: mocks.tryMarkUsageReservationReconcilable,
  trySettleUsageReservation: mocks.trySettleUsageReservation,
}));

vi.mock("@/lib/server/ai/transcription", () => ({
  TRANSCRIPTION_MODEL: "whisper-large-v3-turbo",
  transcribeAudio: mocks.transcribeAudio,
}));

import {
  TranscriptionGovernanceError,
  transcribeAudioForActor,
} from "@/lib/server/ai/transcription-service";

const actor = {
  userId: "user-1",
  workspaceId: "workspace-1",
  role: "member" as const,
};

function audioFile(): File {
  return new File(["audio"], "voice.webm", { type: "audio/webm" });
}

function admissionError(code: string): AIErrorWithEnvelope {
  return new AIErrorWithEnvelope({
    kind: "provider_request",
    code,
    retryable: code === "AI_RATE_LIMIT_EXCEEDED",
    source: "usage_reservation",
    status: 429,
    message: code,
  });
}

describe("transcription-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertProjectAccess.mockResolvedValue(undefined);
    mocks.reserveProviderUsageAttempt.mockResolvedValue({
      id: "reservation-1",
      reservedTokens: 1,
      status: "active",
    });
    mocks.tryMarkUsageReservationReconcilable.mockResolvedValue(true);
    mocks.trySettleUsageReservation.mockResolvedValue(true);
    mocks.transcribeAudio.mockResolvedValue({ text: "transcribed text" });
  });

  it("atomically admits and settles successful transcription provider use", async () => {
    const result = await transcribeAudioForActor({
      actor,
      audioFile: audioFile(),
      language: "en",
      prompt: "Summarize clearly",
      page: "overview",
      projectId: "proj_1",
    });

    expect(result).toEqual({ text: "transcribed text" });
    expect(mocks.assertProjectAccess).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj_1",
    );
    expect(mocks.reserveProviderUsageAttempt).toHaveBeenCalledWith({
      attemptKey: expect.any(String),
      scope: {
        projectId: "proj_1",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      provider: "openai",
      model: "whisper-large-v3-turbo",
      estimatedTokens: 1,
      source: "voice_transcription",
      contextPage: "overview",
      conversationId: null,
      dailyAttemptLimit: 100,
    });
    expect(mocks.transcribeAudio).toHaveBeenCalledWith(
      expect.any(File),
      { language: "en", prompt: "Summarize clearly" },
    );
    expect(mocks.trySettleUsageReservation).toHaveBeenCalledWith({
      reservationId: "reservation-1",
      model: "whisper-large-v3-turbo",
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it("rejects unauthorized project attribution before admission", async () => {
    mocks.assertProjectAccess.mockRejectedValue(new Error("denied"));

    await expect(transcribeAudioForActor({
      actor,
      audioFile: audioFile(),
      projectId: "proj_1",
    })).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROJECT_ACCESS_DENIED",
      status: 403,
    });

    expect(mocks.reserveProviderUsageAttempt).not.toHaveBeenCalled();
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });

  it.each([
    ["AI_RATE_LIMIT_EXCEEDED", "AI_RATE_LIMIT_EXCEEDED"],
    ["DAILY_TOKEN_LIMIT_EXCEEDED", "AI_DAILY_TOKEN_LIMIT_EXCEEDED"],
    ["AI_SOURCE_DAILY_ATTEMPT_LIMIT_EXCEEDED", "AI_TRANSCRIPTION_DAILY_LIMIT_EXCEEDED"],
  ])("maps atomic admission code %s and never calls the provider", async (sourceCode, expectedCode) => {
    mocks.reserveProviderUsageAttempt.mockRejectedValue(admissionError(sourceCode));

    await expect(transcribeAudioForActor({
      actor,
      audioFile: audioFile(),
    })).rejects.toMatchObject({
      code: expectedCode,
      status: 429,
    });

    expect(mocks.reserveProviderUsageAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });

  it.each([
    "AI_USAGE_ADMISSION_TIMEOUT",
    "AI_USAGE_ADMISSION_FAILED",
  ])("returns a typed retryable 503 for %s without provider use", async (sourceCode) => {
    mocks.reserveProviderUsageAttempt.mockRejectedValue(new AIErrorWithEnvelope({
      kind: "runtime",
      code: sourceCode,
      retryable: true,
      source: "usage_reservation",
      status: 503,
      message: "admission unavailable",
    }));

    await expect(transcribeAudioForActor({
      actor,
      audioFile: audioFile(),
    })).rejects.toMatchObject({
      code: sourceCode,
      status: 503,
      retryAfterSeconds: 1,
    });
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
  });

  it("marks a rejected provider attempt reconcilable without hiding the provider error", async () => {
    const providerError = new Error("transcription provider failed");
    mocks.transcribeAudio.mockRejectedValue(providerError);

    await expect(transcribeAudioForActor({
      actor,
      audioFile: audioFile(),
    })).rejects.toBe(providerError);

    expect(mocks.tryMarkUsageReservationReconcilable).toHaveBeenCalledWith(
      "reservation-1",
      "failed",
      "TRANSCRIPTION_PROVIDER_FAILED",
    );
  });

  it("returns provider output and schedules retry when bounded settlement cannot finish", async () => {
    mocks.trySettleUsageReservation.mockResolvedValueOnce(false);

    await expect(transcribeAudioForActor({
      actor,
      audioFile: audioFile(),
    })).resolves.toEqual({ text: "transcribed text" });

    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("schedules reconciliation when the bounded provider-failure outcome write cannot finish", async () => {
    mocks.transcribeAudio.mockRejectedValue(new Error("provider rejected"));
    mocks.tryMarkUsageReservationReconcilable.mockResolvedValueOnce(false);

    await expect(transcribeAudioForActor({
      actor,
      audioFile: audioFile(),
    })).rejects.toThrow("provider rejected");

    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid page attribution with a typed local governance error", async () => {
    await expect(transcribeAudioForActor({
      actor,
      audioFile: audioFile(),
      page: "invalid-page",
    })).rejects.toBeInstanceOf(TranscriptionGovernanceError);

    expect(mocks.reserveProviderUsageAttempt).not.toHaveBeenCalled();
  });
});
