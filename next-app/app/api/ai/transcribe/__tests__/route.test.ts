import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockTranscriptionGovernanceError extends Error {
    code: string;
    status: number;
    retryAfterSeconds?: number;

    constructor(code: string, message: string, options: { status: number; retryAfterSeconds?: number }) {
      super(message);
      this.name = "TranscriptionGovernanceError";
      this.code = code;
      this.status = options.status;
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }

  return {
    requireApiSession: vi.fn(),
    transcribeAudioForActor: vi.fn(),
    classifyAIError: vi.fn(),
    logServerError: vi.fn(),
    MockTranscriptionGovernanceError,
  };
});

vi.mock("@/lib/server/auth/session", () => ({
  requireApiSession: mocks.requireApiSession,
}));

vi.mock("@/lib/server/actor", () => ({
  runWithActorContext: async (_context: unknown, fn: () => Promise<Response>) => fn(),
}));

vi.mock("@/lib/server/ai/transcription-service", () => ({
  TranscriptionGovernanceError: mocks.MockTranscriptionGovernanceError,
  isTranscriptionGovernanceError: (error: unknown) => error instanceof mocks.MockTranscriptionGovernanceError,
  transcribeAudioForActor: mocks.transcribeAudioForActor,
}));

vi.mock("@/lib/server/ai/error-classification", () => ({
  classifyAIError: mocks.classifyAIError,
}));

vi.mock("@/lib/server/logging", () => ({
  logServerError: mocks.logServerError,
}));

const { POST } = await import("../route");

describe("/api/ai/transcribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-1",
        workspaceId: "workspace-1",
        role: "member",
      },
    });
    mocks.transcribeAudioForActor.mockResolvedValue({ text: "hello world" });
    mocks.classifyAIError.mockReturnValue({
      reason: "unknown",
      retryable: false,
      retryAfterMs: undefined,
    });
  });

  function buildRequest(formData: FormData) {
    return new NextRequest("http://localhost/api/ai/transcribe", {
      method: "POST",
      body: formData,
    });
  }

  it("returns 400 when no audio file is provided", async () => {
    const formData = new FormData();
    formData.append("language", "en");

    const response = await POST(buildRequest(formData));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No audio file provided" });
    expect(mocks.transcribeAudioForActor).not.toHaveBeenCalled();
  });

  it("returns 413 when the uploaded audio exceeds 25MB", async () => {
    const formData = new FormData();
    formData.append(
      "audio",
      new File([new Uint8Array(25 * 1024 * 1024 + 1)], "huge.webm", { type: "audio/webm" }),
    );

    const response = await POST(buildRequest(formData));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "Audio file too large (max 25MB)" });
    expect(mocks.transcribeAudioForActor).not.toHaveBeenCalled();
  });

  it("returns 429 for typed local rate-limit failures", async () => {
    const formData = new FormData();
    formData.append("audio", new File(["audio"], "voice.webm", { type: "audio/webm" }));
    mocks.transcribeAudioForActor.mockRejectedValue(
      new mocks.MockTranscriptionGovernanceError(
        "AI_RATE_LIMIT_EXCEEDED",
        "Rate limit exceeded. Maximum 20 requests per minute.",
        { status: 429 },
      ),
    );

    const response = await POST(buildRequest(formData));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: "Rate limit exceeded. Maximum 20 requests per minute.",
      code: "AI_RATE_LIMIT_EXCEEDED",
    });
  });

  it("returns 403 for unauthorized project attribution", async () => {
    const formData = new FormData();
    formData.append("audio", new File(["audio"], "voice.webm", { type: "audio/webm" }));
    formData.append("projectId", "proj_1");
    mocks.transcribeAudioForActor.mockRejectedValue(
      new mocks.MockTranscriptionGovernanceError(
        "TRANSCRIPTION_PROJECT_ACCESS_DENIED",
        "Project not found or access denied.",
        { status: 403 },
      ),
    );

    const response = await POST(buildRequest(formData));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Project not found or access denied.",
      code: "TRANSCRIPTION_PROJECT_ACCESS_DENIED",
    });
  });

  it("passes validated voice attribution into the governed transcription service", async () => {
    const formData = new FormData();
    formData.append("audio", new File(["audio"], "voice.webm", { type: "audio/webm" }));
    formData.append("language", "en");
    formData.append("prompt", "Use concise wording");
    formData.append("page", "overview");
    formData.append("projectId", "proj_1");

    const response = await POST(buildRequest(formData));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ text: "hello world" });
    expect(mocks.transcribeAudioForActor).toHaveBeenCalledWith({
      actor: {
        userId: "user-1",
        workspaceId: "workspace-1",
        role: "member",
      },
      audioFile: expect.any(File),
      language: "en",
      prompt: "Use concise wording",
      page: "overview",
      projectId: "proj_1",
    });
  });

  it("maps provider timeout failures to a safe non-500 response", async () => {
    const formData = new FormData();
    formData.append("audio", new File(["audio"], "voice.webm", { type: "audio/webm" }));
    mocks.transcribeAudioForActor.mockRejectedValue(new Error("provider timeout"));
    mocks.classifyAIError.mockReturnValue({
      reason: "timeout",
      retryable: true,
      retryAfterMs: 2000,
    });

    const response = await POST(buildRequest(formData));

    expect(response.status).toBe(504);
    expect(response.headers.get("Retry-After")).toBe("2");
    await expect(response.json()).resolves.toEqual({
      error: "Transcription service timed out. Please try again.",
    });
  });
});
