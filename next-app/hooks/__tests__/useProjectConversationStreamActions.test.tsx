// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultProjectConversationState, type ProjectConversationState } from "@/lib/project-conversation-storage";
import type { ArtifactData } from "@/types/artifacts";
import type { ChoiceOption, StreamPhase, UserInputRequest } from "@/types/ai";
import type { PendingAttachment } from "@/types/project-conversation-context";

const { mockReviewArtifactAction, mockUndoArtifactAction, mockDispatchProjectDataChanged } = vi.hoisted(() => ({
    mockReviewArtifactAction: vi.fn(),
    mockUndoArtifactAction: vi.fn(),
    mockDispatchProjectDataChanged: vi.fn(),
}));

vi.mock("@/app/actions/agent", () => ({
    reviewArtifactAction: (...args: unknown[]) => mockReviewArtifactAction(...args),
    undoArtifactAction: (...args: unknown[]) => mockUndoArtifactAction(...args),
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
        setPendingAttachment,
    };
}

describe("useProjectConversationStreamActions artifact review path", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockUndoArtifactAction.mockResolvedValue({ success: true, artifact: buildArtifact("rejected") });
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
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
});
