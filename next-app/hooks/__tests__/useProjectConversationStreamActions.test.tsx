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
    mockGetChangedDomainsForAcceptedArtifact,
    mockGetProtocolPatchForAcceptedArtifact,
    mockIsProtocolLiveSyncV1Enabled,
    mockCreateConversation,
    mockProcessAIStream,
    mockRequestAgentRunCancellation,
    mockPollRunRecovery,
    mockBeginDeliveryRequest,
    mockCompleteDeliveryRequest,
    mockSetActualDeliveryMode,
} = vi.hoisted(() => ({
    mockReviewArtifactAction: vi.fn(),
    mockUndoArtifactAction: vi.fn(),
    mockDispatchProjectDataChanged: vi.fn(),
    mockGetChangedDomainsForAcceptedArtifact: vi.fn(),
    mockGetProtocolPatchForAcceptedArtifact: vi.fn(),
    mockIsProtocolLiveSyncV1Enabled: vi.fn(),
    mockCreateConversation: vi.fn(),
    mockProcessAIStream: vi.fn(),
    mockRequestAgentRunCancellation: vi.fn(),
    mockPollRunRecovery: vi.fn(),
    mockBeginDeliveryRequest: vi.fn(),
    mockCompleteDeliveryRequest: vi.fn(),
    mockSetActualDeliveryMode: vi.fn(),
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
    cancelAgentRun: (...args: unknown[]) => mockRequestAgentRunCancellation(...args),
}));

vi.mock("@/lib/ai/run-recovery-client", async () => {
    const actual = await vi.importActual<typeof import("@/lib/ai/run-recovery-client")>("@/lib/ai/run-recovery-client");
    return {
        ...actual,
        pollRunRecovery: (...args: unknown[]) => mockPollRunRecovery(...args),
    };
});

vi.mock("@/lib/project-data-events", () => ({
    dispatchProjectDataChanged: (...args: unknown[]) => mockDispatchProjectDataChanged(...args),
    getChangedDomainsForAcceptedArtifact: (...args: unknown[]) => mockGetChangedDomainsForAcceptedArtifact(...args),
    getProtocolPatchForAcceptedArtifact: (...args: unknown[]) => mockGetProtocolPatchForAcceptedArtifact(...args),
}));

vi.mock("@/lib/protocol-live-sync-feature-flags", () => ({
    isProtocolLiveSyncV1Enabled: () => mockIsProtocolLiveSyncV1Enabled(),
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

function useHarness(generation: {
    selectedModel?: "gpt-5.6-luna" | "gpt-5.6-terra";
    reasoningEffort?: "medium" | "high";
    deliveryMode?: "standard" | "priority";
} = {}) {
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
    const isLoadingRef = useRef(isLoading);
    const [streamPhase, setStreamPhase] = useState<StreamPhase>("idle");
    const [currentRunId, setCurrentRunId] = useState<string | null>(null);
    const [, setPendingChoices] = useState<ChoiceOption[]>([]);
    const [pendingUserInput, setPendingUserInput] = useState<UserInputRequest | null>(null);
    const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
    const beginDeliveryRequest = mockBeginDeliveryRequest;
    const completeDeliveryRequest = mockCompleteDeliveryRequest;
    const setActualDeliveryMode = mockSetActualDeliveryMode;

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
        isLoadingRef,
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
        selectedModel: generation.selectedModel ?? "gpt-5.6-luna",
        reasoningEffort: generation.reasoningEffort ?? "medium",
        deliveryMode: generation.deliveryMode ?? "standard",
        beginDeliveryRequest,
        completeDeliveryRequest,
        setActualDeliveryMode,
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
        beginDeliveryRequest,
        completeDeliveryRequest,
        setActualDeliveryMode,
    };
}

describe("useProjectConversationStreamActions artifact review path", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockUndoArtifactAction.mockResolvedValue({ success: true, artifact: buildArtifact("rejected") });
        mockGetChangedDomainsForAcceptedArtifact.mockReturnValue(["draft"]);
        mockGetProtocolPatchForAcceptedArtifact.mockReturnValue(null);
        mockIsProtocolLiveSyncV1Enabled.mockReturnValue(false);
        mockCreateConversation.mockResolvedValue({ success: true, data: { id: "conv-1" } });
        mockProcessAIStream.mockResolvedValue({
            runStatus: "completed",
            stopReason: "done",
            errorMessage: null,
            actualModel: null,
            actualModelSource: "unknown",
            terminalReason: "completed",
        });
        mockPollRunRecovery.mockResolvedValue({
            outcome: "retry",
            response: null,
            lastAppliedSequence: -1,
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

    it("converts a rejected artifact server action into a visible error", async () => {
        mockReviewArtifactAction.mockRejectedValueOnce(new Error("network unavailable"));
        const { result } = renderHook(() => useHarness());

        await act(async () => {
            await result.current.handleReviewArtifact("artifact-1", "accepted");
        });

        expect(result.current.artifacts.get("artifact-1")?.status).toBe("proposed");
        expect(result.current.state.messages).toEqual(expect.arrayContaining([
            expect.objectContaining({
                text: "Artifact review could not reach the server. Nothing was applied.",
                streamError: expect.objectContaining({ code: "ARTIFACT_REVIEW_REQUEST_FAILED" }),
            }),
        ]));
    });

    it("refreshes restored protocol domains without redispatching the applied protocol patch", async () => {
        mockIsProtocolLiveSyncV1Enabled.mockReturnValue(true);
        mockGetChangedDomainsForAcceptedArtifact.mockReturnValue(["protocol", "memory"]);
        mockGetProtocolPatchForAcceptedArtifact.mockReturnValue({
            field: "researchQuestion",
            value: "Applied RQ",
        });
        mockUndoArtifactAction.mockResolvedValue({
            success: true,
            artifact: {
                ...buildArtifact("rejected"),
                type: "protocol_suggestion",
                payload: {
                    field: "researchQuestion",
                    value: "Applied RQ",
                    rationale: "test",
                },
            },
        });

        const { result } = renderHook(() => useHarness());

        await act(async () => {
            await result.current.handleUndoArtifact("artifact-1");
        });

        expect(mockDispatchProjectDataChanged).toHaveBeenCalledWith({
            projectId: "project-1",
            domains: ["protocol", "memory"],
            reason: "server_mutation",
            source: "artifact_undo",
        });
        expect(mockGetProtocolPatchForAcceptedArtifact).not.toHaveBeenCalled();
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

    it("waits for a prior stop to be confirmed before executing a plan", async () => {
        const cancellation = createDeferred<"cancelled">();
        mockRequestAgentRunCancellation.mockReturnValueOnce(cancellation.promise);
        const { result } = renderHook(() => useHarness());

        act(() => {
            result.current.setCurrentRunId("run-active-plan");
        });
        act(() => {
            result.current.cancelStream();
        });

        let planPromise!: Promise<void>;
        act(() => {
            planPromise = result.current.executePlanAction("artifact-1", [0]);
        });

        expect(vi.mocked(fetch)).not.toHaveBeenCalled();
        expect(result.current.artifacts.get("artifact-1")?.status).toBe("proposed");

        await act(async () => {
            cancellation.resolve("cancelled");
            await planPromise;
        });

        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
        const [, init] = vi.mocked(fetch).mock.calls[0] as [RequestInfo | URL, RequestInit];
        expect(JSON.parse(String(init.body)).options.replaceRunId).toBe("run-active-plan");
    });

    it("keeps a plan proposed when prior cancellation cannot be confirmed", async () => {
        const cancellation = createDeferred<"conflict">();
        mockRequestAgentRunCancellation.mockReturnValueOnce(cancellation.promise);
        const { result } = renderHook(() => useHarness());

        act(() => {
            result.current.setCurrentRunId("run-conflicted-plan");
        });
        act(() => {
            result.current.cancelStream();
        });

        let planPromise!: Promise<void>;
        act(() => {
            planPromise = result.current.executePlanAction("artifact-1", [0]);
        });
        await act(async () => {
            cancellation.resolve("conflict");
            await planPromise;
        });

        expect(vi.mocked(fetch)).not.toHaveBeenCalled();
        expect(result.current.artifacts.get("artifact-1")?.status).toBe("proposed");
        expect(result.current.state.messages).toEqual(expect.arrayContaining([
            expect.objectContaining({
                streamError: expect.objectContaining({ code: "RUN_CANCELLATION_UNCONFIRMED" }),
            }),
        ]));
    });

    it("waits for a paused stream to unwind before resuming clarification without cancelling its source run", async () => {
        const releasePausedStream = createDeferred<void>();
        mockProcessAIStream
            .mockImplementationOnce(async ({ onChunk }: { onChunk: (chunk: unknown) => Promise<void> | void }) => {
                await onChunk({ type: "run_start", runId: "run-ask", conversationId: "conv-1" });
                await onChunk({
                    type: "user_input_required",
                    userInputRequest: {
                        sourceRunId: "run-ask",
                        callId: "ask-1",
                        question: "Continue?",
                        questionType: "yes_no",
                    },
                });
                await releasePausedStream.promise;
                return {
                    runStatus: "paused",
                    stopReason: "paused_for_input",
                    errorMessage: null,
                    actualModel: null,
                    actualModelSource: "unknown",
                    terminalReason: "paused_for_input",
                };
            })
            .mockResolvedValueOnce({
                runStatus: "completed",
                stopReason: null,
                errorMessage: null,
                actualModel: null,
                actualModelSource: "unknown",
                terminalReason: "completed",
            });

        const { result } = renderHook(() => useHarness());
        let initialSend!: Promise<void>;
        act(() => {
            initialSend = result.current.sendMessage("Start", "overview");
        });

        await waitFor(() => expect(mockProcessAIStream).toHaveBeenCalledTimes(1));

        let resumeSend!: Promise<void>;
        act(() => {
            resumeSend = result.current.sendMessage(
                "",
                "overview",
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {
                    replaceRunId: "run-ask",
                    continueFromRunId: "run-ask",
                    suppressUserMessageAppend: true,
                    userInputResolution: {
                        sourceRunId: "run-ask",
                        callId: "ask-1",
                        resolution: "answered",
                        answerText: "Yes",
                        answeredAt: "2026-07-12T10:00:00.000Z",
                    },
                },
            );
        });

        expect(mockRequestAgentRunCancellation).not.toHaveBeenCalled();
        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

        await act(async () => {
            releasePausedStream.resolve();
            await initialSend;
            await resumeSend;
        });

        expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
        expect(mockRequestAgentRunCancellation).not.toHaveBeenCalled();
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
            await result.current.sendMessage("Please summarize this", "overview", undefined, "gpt-5.6-luna");
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
            model: "gpt-5.6-luna",
            reasoningEffort: "medium",
            deliveryMode: "standard",
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

    it("keeps image bytes out of the prompt while forwarding attachment metadata for server hydration", async () => {
        const { result } = renderHook(() => useHarness());

        act(() => {
            result.current.setPendingAttachment({
                fileAssetId: "image-1",
                filename: "figure.webp",
                size: 4096,
                mimeType: "image/webp",
                isExisting: false,
                extraction: {
                    status: "ready",
                    text: "",
                    mediaKind: "image",
                },
            });
        });

        await act(async () => {
            await result.current.sendMessage("Interpret this forest plot", "overview", undefined, "qwen3.7-plus");
        });

        const fetchMock = vi.mocked(fetch);
        const [, requestInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
        const body = JSON.parse(String(requestInit.body));

        expect(body.userMessage).toBe("Interpret this forest plot");
        expect(body.userMessage).not.toContain("<attached_document");
        expect(body.options).toMatchObject({
            model: "qwen3.7-plus",
            reasoningEffort: "high",
            deliveryMode: "standard",
            userMessageAttachments: [{
                fileAssetId: "image-1",
                filename: "figure.webp",
                size: 4096,
                mimeType: "image/webp",
                isExisting: false,
            }],
        });
    });

    it("rejects an image on a non-vision model before side effects and keeps it attached", async () => {
        const { result } = renderHook(() => useHarness());

        act(() => {
            result.current.setPendingAttachment({
                fileAssetId: "image-unsupported",
                filename: "figure.png",
                size: 4096,
                mimeType: "image/png",
                isExisting: false,
                extraction: {
                    status: "ready",
                    text: "",
                    mediaKind: "image",
                },
            });
        });

        await act(async () => {
            await result.current.sendMessage(
                "Interpret this figure",
                "overview",
                undefined,
                "deepseek-v4-flash",
            );
        });

        expect(fetch).not.toHaveBeenCalled();
        expect(result.current.pendingAttachment?.fileAssetId).toBe("image-unsupported");
        expect(result.current.state.messages).toHaveLength(1);
        expect(mockBeginDeliveryRequest).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            "Blocking send because deepseek-v4-flash does not support image input.",
        );
    });

    it("retains an attachment when the server rejects the request before admission", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({
            ok: false,
            statusText: "Conflict",
        })));
        const { result } = renderHook(() => useHarness());

        act(() => {
            result.current.setPendingAttachment({
                fileAssetId: "file-rejected",
                filename: "paper.pdf",
                size: 2048,
                mimeType: "application/pdf",
                isExisting: false,
                extraction: {
                    status: "ready",
                    text: "Extracted text",
                },
            });
        });

        await act(async () => {
            await result.current.sendMessage("Summarize", "overview");
        });

        expect(result.current.pendingAttachment?.fileAssetId).toBe("file-rejected");
    });

    it("keeps one-shot priority active through the terminal receipt, then resets the next request", async () => {
        mockProcessAIStream.mockImplementationOnce(async ({ onChunk }: {
            onChunk: (chunk: unknown) => void | Promise<void>;
        }) => {
            await onChunk({
                type: "run_end",
                runStatus: "completed",
                stopReason: "done",
                actualDeliveryMode: "priority",
            });
            return {
                runStatus: "completed",
                stopReason: "done",
                errorMessage: null,
                actualModel: "gpt-5.6-luna",
                actualModelSource: "provider" as const,
                terminalReason: "completed" as const,
            };
        });
        const { result } = renderHook(() => useHarness());

        await act(async () => {
            await result.current.sendMessage(
                "Run this quickly",
                "overview",
                undefined,
                "gpt-5.6-luna",
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                {
                    model: "gpt-5.6-luna",
                    reasoningEffort: "high",
                    deliveryMode: "priority",
                },
            );
        });

        const fetchMock = vi.mocked(fetch);
        const [, requestInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
        expect(JSON.parse(String(requestInit.body)).options).toMatchObject({
            model: "gpt-5.6-luna",
            reasoningEffort: "high",
            deliveryMode: "priority",
        });
        expect(result.current.beginDeliveryRequest).toHaveBeenCalledWith("priority");
        expect(result.current.setActualDeliveryMode).toHaveBeenCalledWith("priority");
        expect(result.current.completeDeliveryRequest).toHaveBeenCalledTimes(1);
    });

    it("consumes a failed run_end after a provider error without recovery or a generic duplicate", async () => {
        mockProcessAIStream.mockImplementationOnce(async ({ onChunk }: {
            onChunk: (chunk: unknown) => void | Promise<void>;
        }) => {
            await onChunk({
                type: "error",
                error: "Provider rejected this request.",
                errorMeta: {
                    kind: "provider_request",
                    code: "PROVIDER_REQUEST_FAILED",
                    message: "Provider rejected this request.",
                    retryable: false,
                    source: "provider_request",
                },
            });
            await onChunk({
                type: "run_end",
                runStatus: "failed",
                stopReason: "provider_error",
            });
            return {
                runStatus: "failed",
                stopReason: "provider_error",
                errorMessage: "Provider rejected this request.",
                actualModel: "gpt-5.6-luna",
                actualModelSource: "provider" as const,
                terminalReason: "failed_server" as const,
            };
        });
        const { result } = renderHook(() => useHarness({ deliveryMode: "priority" }));

        let streamResult!: Awaited<ReturnType<typeof result.current.runStream>>;
        await act(async () => {
            streamResult = await result.current.runStream({
                body: { options: { deliveryMode: "priority" } },
                page: "overview",
                convId: "conv-1",
            });
        });

        expect(streamResult.success).toBe(false);
        expect(streamResult.runStatus).toBe("failed");
        expect(mockPollRunRecovery).not.toHaveBeenCalled();
        const renderedErrors = result.current.state.messages.filter((message) => message.streamError);
        expect(renderedErrors).toHaveLength(1);
        expect(renderedErrors[0]?.text).toBe("Provider rejected this request.");
        expect(result.current.state.messages.some((message) => (
            message.text === "The stream ended unexpectedly. Retry to continue."
            || message.text.includes("Reconnecting to the active run")
        ))).toBe(false);
    });

    it("propagates the selected generation settings into plan execution", async () => {
        const { result } = renderHook(() => useHarness({
            selectedModel: "gpt-5.6-terra",
            reasoningEffort: "high",
            deliveryMode: "priority",
        }));

        await act(async () => {
            await result.current.executePlan("artifact-1", [0]);
        });

        const fetchMock = vi.mocked(fetch);
        const [, requestInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
        const body = JSON.parse(String(requestInit.body));
        expect(body).toMatchObject({
            planId: "artifact-1",
            selectedSteps: [0],
            options: {
                model: "gpt-5.6-terra",
                reasoningEffort: "high",
                deliveryMode: "priority",
                reasoningMode: "off",
            },
        });
        expect(result.current.beginDeliveryRequest).toHaveBeenCalledWith("priority");
        expect(result.current.completeDeliveryRequest).toHaveBeenCalledTimes(1);
    });
});
