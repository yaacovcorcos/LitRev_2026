import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requireApiSession: vi.fn(),
    findOwnedConversationAccess: vi.fn(),
    buildRunRecoveryResponse: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
    requireApiSession: mocks.requireApiSession,
}));

vi.mock("@/lib/server/access", () => ({
    findOwnedConversationAccess: mocks.findOwnedConversationAccess,
}));

vi.mock("@/lib/server/agent/run-recovery", () => ({
    buildRunRecoveryResponse: mocks.buildRunRecoveryResponse,
}));

const { POST } = await import("../route");

function request(body: unknown) {
    return new NextRequest("http://localhost/api/ai/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/ai/recovery", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireApiSession.mockResolvedValue({
            ok: true,
            context: {
                userId: "user-1",
                workspaceId: "workspace-1",
            },
        });
        mocks.findOwnedConversationAccess.mockResolvedValue({
            id: "conversation-1",
            projectId: null,
            studyId: null,
        });
        mocks.buildRunRecoveryResponse.mockResolvedValue({
            conversationId: "conversation-1",
            runId: "run-1",
            runStatus: "running",
            isActive: true,
            replayableEvents: [],
            terminalEvent: null,
            recoveryRecommendation: "reconnect",
        });
    });

    it("authorizes through the narrow owned-conversation access path", async () => {
        const response = await POST(request({
            conversationId: "conversation-1",
            runId: "run-1",
            afterSequence: 7,
        }));

        expect(response.status).toBe(200);
        expect(mocks.findOwnedConversationAccess).toHaveBeenCalledWith(
            { ownerId: "user-1", workspaceId: "workspace-1" },
            "conversation-1",
        );
        expect(mocks.buildRunRecoveryResponse).toHaveBeenCalledWith({
            conversationId: "conversation-1",
            runId: "run-1",
            afterSequence: 7,
        });
    });

    it("returns a safe missing response without reading run data when access is denied", async () => {
        mocks.findOwnedConversationAccess.mockResolvedValue(null);

        const response = await POST(request({
            conversationId: "conversation-foreign",
            runId: "run-foreign",
        }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            conversationId: "conversation-foreign",
            runId: "run-foreign",
            runStatus: "missing",
            recoveryRecommendation: "retry",
        });
        expect(mocks.buildRunRecoveryResponse).not.toHaveBeenCalled();
    });
});
