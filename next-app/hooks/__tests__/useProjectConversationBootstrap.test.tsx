// @vitest-environment jsdom
import type { Dispatch, SetStateAction } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useProjectConversationBootstrap } from "../useProjectConversationBootstrap";
import { syncConversationSelection } from "../useProjectConversationManager";

const { mockListConversations, mockDecideConversationRestore, mockReadProjectEntryState } = vi.hoisted(() => ({
    mockListConversations: vi.fn(),
    mockDecideConversationRestore: vi.fn(),
    mockReadProjectEntryState: vi.fn(),
}));

vi.mock("@/app/actions/conversations", () => ({
    listConversations: mockListConversations,
}));

vi.mock("@/lib/project-entry-restore", () => ({
    decideConversationRestore: mockDecideConversationRestore,
    markConversationActive: vi.fn(),
    readProjectEntryState: mockReadProjectEntryState,
}));

describe("project conversation bootstrap", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockReadProjectEntryState.mockReturnValue(null);
        mockDecideConversationRestore.mockReturnValue({
            shouldRestore: false,
            reason: "no_state",
            conversationId: null,
        });
    });

    it("updates the live conversation ref before delegating state updates", () => {
        const currentConversationIdRef = { current: null as string | null };
        const observedRefValues: Array<string | null> = [];
        const setCurrentConversationIdMock = vi.fn((nextConversationId: string | null) => {
            observedRefValues.push(currentConversationIdRef.current);
            return nextConversationId;
        });
        const setCurrentConversationId = setCurrentConversationIdMock as unknown as Dispatch<SetStateAction<string | null>>;

        syncConversationSelection(
            currentConversationIdRef,
            setCurrentConversationId,
            "conv-first-send",
        );

        expect(currentConversationIdRef.current).toBe("conv-first-send");
        expect(setCurrentConversationIdMock).toHaveBeenCalledWith("conv-first-send");
        expect(observedRefValues).toEqual(["conv-first-send"]);
    });

    it("does not auto-select when the first send has already claimed a conversation id before bootstrap resolves", async () => {
        let resolveList:
            | ((value: {
                success: true;
                data: Array<{
                    id: string;
                    title: string;
                    messageCount: number;
                    updatedAt: string;
                }>;
            }) => void)
            | null = null;

        mockListConversations.mockReturnValue(new Promise((resolve) => {
            resolveList = resolve;
        }));

        const currentConversationIdRef = { current: null as string | null };
        const selectConversation = vi.fn(async () => true);
        const setConversations = vi.fn();
        const setCurrentConversationId = vi.fn((nextConversationId: string | null) => {
            currentConversationIdRef.current = nextConversationId;
        });
        const setState = vi.fn();
        const setIsLoadingConversations = vi.fn();

        renderHook(() => useProjectConversationBootstrap({
            projectId: "project-1",
            routeConversationId: null,
            projectEntryRestoreEnabled: false,
            currentConversationIdRef,
            studyFilterRef: { current: undefined },
            selectConversationRef: { current: selectConversation },
            setConversations,
            setCurrentConversationId,
            setState,
            setIsLoadingConversations,
        }));

        currentConversationIdRef.current = "conv-first-send";

        expect(resolveList).toBeTypeOf("function");
        resolveList!({
            success: true,
            data: [{
                id: "conv-first-send",
                title: "New conversation",
                messageCount: 0,
                updatedAt: "2026-03-28T00:00:00.000Z",
            }],
        });

        await waitFor(() => {
            expect(setConversations).toHaveBeenCalledWith([{
                id: "conv-first-send",
                title: "New conversation",
                messageCount: 0,
                updatedAt: "2026-03-28T00:00:00.000Z",
            }]);
        });

        expect(selectConversation).not.toHaveBeenCalled();
    });

    it("still auto-selects the first conversation when no active conversation exists", async () => {
        mockListConversations.mockResolvedValue({
            success: true,
            data: [{
                id: "conv-existing",
                title: "Existing conversation",
                messageCount: 1,
                updatedAt: "2026-03-28T00:00:00.000Z",
            }],
        });

        const currentConversationIdRef = { current: null as string | null };
        const selectConversation = vi.fn(async () => true);

        renderHook(() => useProjectConversationBootstrap({
            projectId: "project-1",
            routeConversationId: null,
            projectEntryRestoreEnabled: false,
            currentConversationIdRef,
            studyFilterRef: { current: undefined },
            selectConversationRef: { current: selectConversation },
            setConversations: vi.fn(),
            setCurrentConversationId: vi.fn(),
            setState: vi.fn(),
            setIsLoadingConversations: vi.fn(),
        }));

        await waitFor(() => {
            expect(selectConversation).toHaveBeenCalledWith("conv-existing");
        });
    });
});
