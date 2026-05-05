// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultProjectConversationState, type ProjectConversationState } from "@/lib/project-conversation-storage";
import type { ArtifactData } from "@/types/artifacts";
import type { ChoiceOption, StreamPhase, UserInputRequest } from "@/types/ai";
import type { PendingAttachment } from "@/types/project-conversation-context";

const {
    mockReviewArtifactAction,
    mockUndoArtifactAction,
    mockDispatchProjectDataChanged,
    mockCreateConversation,
    mockProcessAIStream,
    mockRequestAgentRunCancellation,
} = vi.hoisted(() => ({
    mockReviewArtifactAction: vi.fn(),
    mockUndoArtifactAction: vi.fn(),
    mockDispatchProjectDataChanged: vi.fn(),
    mockCreateConversation: vi.fn(),
    mockProcessAIStream: vi.fn(),
    mockRequestAgentRunCancellation: vi.fn(),
}));

vi.mock("@/app/actions/agent", () => ({
    reviewArtifactAction: (...args: unknown[]) => mockReviewArtifactAction(...args),
    undoArtifactAction: (...args: unknown[]) => mockUndoArtifactAction(...args),
}));

vi.mock("@/app/actions/conversations", () => ({
    createConversation: (...args: unknown[]) => mockCreateConversation(...args),
}));

vi.mock("@/lib/ai/stream-processor", () => ({
    processAIStream: (...args: unknown[]) => mockProcessAIStream(...args),
}));

vi.mock("@/lib/ai/run-cancel-client", () => ({
    requestAgentRunCancellation: (...args: unknown[]) => mockRequestAgentRunCancellation(...args),
}));

vi.mock("@/lib/project-data-events", () => ({
    dispatchProjectDataChanged: (...args: unknown[]) => mockDispatchProjectDataChanged(...args),
    getChangedDomainsForAcceptedArtifact: vi.fn(() => ["drafts"]),
    getProtocolPatchForAcceptedArtifact: vi.fn(() => null),
}));

vi.mock("@/lib/protocol-live-sync-feature-flags", () => ({
    isProtocolLiveSyncV1Enabled: () => false,
}));

import { useProjectConversationStreamActions } from "../useProjectConversationStreamActions";

function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function buildArtifact(status: ArtifactData["status"] = "proposed"): ArtifactData {
    return {
        id: "artifact-1",
        runId: "run-1",
        projectId: "project-1",
        conversationId: "conv-1",
        type: "draft_diff",
        status,
        title: "Draft revision",
        payload: {
            section: "Introduction",
            content: "Draft body",
            citations: [],
            wordCount: 2,
        },
        version: 1,
        sourceEventId: null,
        appliedAt: null,
        reviewedAt: null,
        reviewNote: null,
        createdAt: "2026-03-20T10:00:00.000Z",
    };
}

function useHarness() {
    const initialArtifact = buildArtifact();
    const [state, setState] = useState<ProjectConversationState>({
        ...createDefaultProjectConversationState(),
        messages: [{
            id: "message-artifact-1",
            sender: "ai",
            text: "[draft_diff] Draft revision",
            createdAt: "2026-03-20T10:00:00.000Z",
            context: { page: "overview" },
            artifact: {
                id: initialArtifact.id,
                type: initialArtifact.type,
                status: initialArtifact.status,
                title: initialArtifact.title,
                payload: initialArtifact.payload as Record<string, unknown>,
                version: initialArtifact.version,
            },
        }],
    });
    const stateRef = useRef(state);

    const [artifacts, setArtifactsState] = useState<Map<string, ArtifactData>>(
        () => new Map([[initialArtifact.id, initialArtifact]]),
    );
    const [isLoading, setIsLoading] = useState(false);
    const [streamPhase, setStreamPhase] = useState<StreamPhase>("idle");
    const [currentRunId, setCurrentRunId] = useState<string | null>(null);
    const [, setPendingChoices] = useState<ChoiceOption[]>([]);
    const [pendingUserInput, setPendingUserInput] = useState<UserInputRequest | null>(null);
    const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);

    const hook = useProjectConversationStreamActions({
        projectId: "project-1",
        updateState: (updater) => {
            setState((prev) => {
                const next = updater(prev);
                stateRef.current = next;
                return next;
            });
        },
        stateRef,
        streamGenRef: useRef(0),
        abortControllerRef: useRef<AbortController | null>(null),
        isLoadingRef: useRef(isLoading),
        setIsLoading,
        setStreamPhase: setStreamPhase as Dispatch<SetStateAction<StreamPhase>>,
        setCurrentRunId,
        setPendingChoices,
        setPendingUserInput,
        pendingUserInput,
        currentRunId,
        setArtifacts: setArtifactsState,
        pendingAttachment,
        setPendingAttachment,
        reasoningMode: "full",
        convo: {
            currentConversationId: "conv-1",
            currentConversationIdRef: { current: "conv-1" },
            setCurrentConversationId: vi.fn(),
            setConversations: vi.fn(),
            markConversationActivity: vi.fn(),
            loadConversations: vi.fn(),
            studyFilterRef: { current: null },
        } as never,
        onNavigate: vi.fn(),
    });

    return {
        ...hook,
        state,
        artifacts,
        streamPhase,
        pendingAttachment,
        setPendingAttachment,
        setCurrentRunId,
    };
}

describe("useProjectConversationStreamActions artifact review path", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockUndoArtifactAction.mockResolvedValue({ success: true, artifact: buildArtifact("rejected") });
        mockCreateConversation.mockResolvedValue({ success: true, data: { id: "conv-1" } });
        mockProcessAIStream.mockResolvedValue({
            runStatus: "completed",
            stopReason: "done",
            errorMessage: null,
            actualModel: null,
            actualModelSource: "unknown",
            terminalReason: "completed",
        });
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: true,
            body: {
                getReader: () => ({} as ReadableStreamDefaultReader<Uint8Array>),
            },
        })));
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        vi.unstubAllGlobals();
    });

    it("keeps artifact state proposed until review succeeds on the shared project path", async () => {
        const deferred = createDeferred<{
            success: true;
            artifact: ArtifactData;
        }>();
        mockReviewArtifactAction.mockReturnValue(deferred.promise);

        const { result } = renderHook(() => useHarness());

        let reviewPromise!: Promise<void>;
        act(() => {
            reviewPromise = result.current.handleReviewArtifact("artifact-1", "accepted");
        });

        expect(result.current.artifacts.get("artifact-1")?.status).toBe("proposed");
        expect(result.current.state.messages.find((message) => message.artifact?.id === "artifact-1")?.artifact?.status).toBe("proposed");

        deferred.resolve({
            success: true,
            artifact: {
                ...buildArtifact("accepted"),
                reviewedAt: "2026-03-20T10:01:00.000Z",
                appliedAt: "2026-03-20T10:01:00.000Z",
            },
        });

        await act(async () => {
            await reviewPromise!;
        });

        expect(result.current.artifacts.get("artifact-1")?.status).toBe("accepted");
        expect(result.current.state.messages.find((message) => message.artifact?.id === "artifact-1")?.artifact?.status).toBe("accepted");
        expect(mockDispatchProjectDataChanged).toHaveBeenCalledWith(expect.objectContaining({
            projectId: "project-1",
            reason: "artifact_accept",
            source: "artifact_review",
        }));
    });

    it("appends a visible typed error and leaves the artifact proposed when review fails", async () => {
        const deferred = createDeferred<{
            success: false;
            error: string;
            errorCode: string;
        }>();
        mockReviewArtifactAction.mockReturnValue(deferred.promise);

        const { result } = renderHook(() => useHarness());

        let reviewPromise!: Promise<void>;
        act(() => {
            reviewPromise = result.current.handleReviewArtifact("artifact-1", "accepted");
        });

        expect(result.current.artifacts.get("artifact-1")?.status).toBe("proposed");

        deferred.resolve({
            success: false,
            error: "The proposed change could not be applied.",
            errorCode: "ARTIFACT_APPLY_FAILED",
        });

        await act(async () => {
            await reviewPromise!;
        });

        await waitFor(() => {
            expect(
                result.current.state.messages.some((message) => message.streamError?.code === "ARTIFACT_APPLY_FAILED"),
            ).toBe(true);
        });

        const errorMessage = result.current.state.messages.find((message) => message.streamError?.code === "ARTIFACT_APPLY_FAILED");
        expect(errorMessage?.text).toBe("The proposed change could not be applied.");
        expect(errorMessage?.context?.page).toBe("overview");
        expect(result.current.artifacts.get("artifact-1")?.status).toBe("proposed");
        expect(result.current.state.messages.find((message) => message.artifact?.id === "artifact-1")?.artifact?.status).toBe("proposed");
        expect(mockDispatchProjectDataChanged).not.toHaveBeenCalled();
    });

    it("refuses to send when the attached PDF could not be read for chat", async () => {
        const { result } = renderHook(() => useHarness());

        act(() => {
            result.current.setPendingAttachment({
                fileAssetId: "file-1",
                filename: "broken.pdf",
                size: 1024,
                mimeType: "application/pdf",
                isExisting: false,
                extraction: {
                    status: "failed",
                    reason: "pdf_parse_failed",
                    message: "LitRev uploaded the PDF, but could not read usable text from it. Remove it or attach a different PDF.",
                },
            });
        });

        await act(async () => {
            await result.current.sendMessage("Please summarize this", "overview");
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Blocking send because the attached PDF could not be read for chat.",
        );
        expect(result.current.state.messages).toHaveLength(1);
    });

    it("requests semantic cancellation for the active run when the stream is stopped", () => {
        const { result } = renderHook(() => useHarness());

        act(() => {
            result.current.setCurrentRunId("run-active-1");
        });

        act(() => {
            result.current.cancelStream();
        });

        expect(mockRequestAgentRunCancellation).toHaveBeenCalledWith("run-active-1");
    });

    it("sends a readable PDF attachment through the truthful shared chat payload and clears local attachment state", async () => {
        const { result } = renderHook(() => useHarness());

        act(() => {
            result.current.setPendingAttachment({
                fileAssetId: "file-7",
                filename: "readable.pdf",
                size: 2048,
                mimeType: "application/pdf",
                isExisting: true,
                extraction: {
                    status: "ready",
                    text: "Extracted PDF text",
                },
            });
        });

        await act(async () => {
            await result.current.sendMessage("Please summarize this", "overview", undefined, "gpt-5.2");
        });

        const fetchMock = vi.mocked(fetch);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, requestInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
        const body = JSON.parse(String(requestInit.body));

        expect(body.userMessage).toContain('<attached_document filename="readable.pdf" size="2 KB">');
        expect(body.userMessage).toContain("Extracted PDF text");
        expect(body.userMessage).toContain("Please summarize this");
        expect(body.options).toMatchObject({
            conversationId: "conv-1",
            projectId: "project-1",
            model: "gpt-5.2",
            page: "overview",
        });
        expect(body.options.userMessageAttachments).toEqual([
            {
                fileAssetId: "file-7",
                filename: "readable.pdf",
                size: 2048,
                mimeType: "application/pdf",
                isExisting: true,
            },
        ]);
        expect(result.current.pendingAttachment).toBeNull();
        const userMessage = [...result.current.state.messages].reverse().find((message) => message.sender === "user");
        expect(userMessage).toMatchObject({
            sender: "user",
            text: "Please summarize this",
            attachments: [
                {
                    fileAssetId: "file-7",
                    filename: "readable.pdf",
                    size: 2048,
                    mimeType: "application/pdf",
                    isExisting: true,
                },
            ],
        });
    });
});
