import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertProjectAccess: vi.fn(),
  checkRateLimit: vi.fn(),
  checkDailyTokenLimit: vi.fn(),
  countUsageRequestsSince: vi.fn(),
  recordUsage: vi.fn(),
  transcribeAudio: vi.fn(),
}));

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
  checkRateLimit: mocks.checkRateLimit,
  checkDailyTokenLimit: mocks.checkDailyTokenLimit,
  countUsageRequestsSince: mocks.countUsageRequestsSince,
  recordUsage: mocks.recordUsage,
}));

vi.mock("@/lib/server/ai/transcription", () => ({
  TRANSCRIPTION_MODEL: "whisper-large-v3-turbo",
  transcribeAudio: mocks.transcribeAudio,
}));

import {
  TranscriptionGovernanceError,
  transcribeAudioForActor,
} from "@/lib/server/ai/transcription-service";

describe("transcription-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertProjectAccess.mockResolvedValue(undefined);
    mocks.checkRateLimit.mockResolvedValue(true);
    mocks.checkDailyTokenLimit.mockResolvedValue(true);
    mocks.countUsageRequestsSince.mockResolvedValue(0);
    mocks.recordUsage.mockResolvedValue(undefined);
    mocks.transcribeAudio.mockResolvedValue({ text: "transcribed text" });
  });

  it("governs successful transcription requests and records truthful usage", async () => {
    const result = await transcribeAudioForActor({
      actor: {
        userId: "user-1",
        workspaceId: "workspace-1",
        role: "member",
      },
      audioFile: new File(["audio"], "voice.webm", { type: "audio/webm" }),
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
    expect(mocks.checkRateLimit).toHaveBeenCalledWith({
      projectId: "proj_1",
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    expect(mocks.checkDailyTokenLimit).toHaveBeenCalledWith({
      projectId: "proj_1",
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    expect(mocks.countUsageRequestsSince).toHaveBeenCalledWith(
      {
        projectId: "proj_1",
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      expect.any(Date),
      { source: "voice_transcription" },
    );
    expect(mocks.transcribeAudio).toHaveBeenCalledWith(
      expect.any(File),
      { language: "en", prompt: "Summarize clearly" },
    );
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      "proj_1",
      "whisper-large-v3-turbo",
      0,
      0,
      {
        userId: "user-1",
        workspaceId: "workspace-1",
        source: "voice_transcription",
        contextPage: "overview",
      },
    );
  });

  it("rejects unauthorized project attribution", async () => {
    mocks.assertProjectAccess.mockRejectedValue(new Error("denied"));

    await expect(
      transcribeAudioForActor({
        actor: {
          userId: "user-1",
          workspaceId: "workspace-1",
          role: "member",
        },
        audioFile: new File(["audio"], "voice.webm", { type: "audio/webm" }),
        projectId: "proj_1",
      }),
    ).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROJECT_ACCESS_DENIED",
      status: 403,
    });

    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });

  it("fails fast when the shared AI rate limit is exceeded", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);

    await expect(
      transcribeAudioForActor({
        actor: {
          userId: "user-1",
          workspaceId: "workspace-1",
          role: "member",
        },
        audioFile: new File(["audio"], "voice.webm", { type: "audio/webm" }),
      }),
    ).rejects.toMatchObject({
      code: "AI_RATE_LIMIT_EXCEEDED",
      status: 429,
    });

    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });

  it("enforces the successful-transcription daily cap before provider use", async () => {
    mocks.countUsageRequestsSince.mockResolvedValue(100);

    await expect(
      transcribeAudioForActor({
        actor: {
          userId: "user-1",
          workspaceId: "workspace-1",
          role: "member",
        },
        audioFile: new File(["audio"], "voice.webm", { type: "audio/webm" }),
      }),
    ).rejects.toMatchObject({
      code: "AI_TRANSCRIPTION_DAILY_LIMIT_EXCEEDED",
      status: 429,
    });

    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
    expect(mocks.recordUsage).not.toHaveBeenCalled();
  });

  it("rejects invalid page attribution with a typed local governance error", async () => {
    await expect(
      transcribeAudioForActor({
        actor: {
          userId: "user-1",
          workspaceId: "workspace-1",
          role: "member",
        },
        audioFile: new File(["audio"], "voice.webm", { type: "audio/webm" }),
        page: "invalid-page",
      }),
    ).rejects.toBeInstanceOf(TranscriptionGovernanceError);

    await expect(
      transcribeAudioForActor({
        actor: {
          userId: "user-1",
          workspaceId: "workspace-1",
          role: "member",
        },
        audioFile: new File(["audio"], "voice.webm", { type: "audio/webm" }),
        page: "invalid-page",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_TRANSCRIPTION_PAGE",
      status: 400,
    });
  });
});
