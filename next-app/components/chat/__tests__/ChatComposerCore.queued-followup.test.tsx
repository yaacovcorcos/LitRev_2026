// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatComposerCore } from "../ChatComposerCore";

const mockVoiceState = {
    state: "idle" as "idle" | "requesting_permission" | "recording" | "transcribing",
    error: null as string | null,
    elapsedMs: 0,
    visualizerAnalyser: null as AnalyserNode | null,
    toggleRecording: vi.fn(),
    stopRecording: vi.fn(),
    clearError: vi.fn(),
};

vi.mock("@/hooks/useVoiceInput", () => ({
    useVoiceInput: () => mockVoiceState,
}));

vi.mock("@/app/actions/files", () => ({
    listProjectFilesAction: vi.fn(async () => ({ success: true, data: [] })),
}));

describe("ChatComposerCore queued follow-up", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            })),
        });
    });

    it("shows an explicit queue action while loading with a non-empty draft", () => {
        const onQueueFollowUp = vi.fn();

        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={true}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
                onQueueFollowUp={onQueueFollowUp}
            />,
        );

        fireEvent.change(screen.getByRole("textbox"), { target: { value: "Search PubMed for the next diabetes papers." } });
        fireEvent.click(screen.getByRole("button", { name: "Queue next" }));

        expect(onQueueFollowUp).toHaveBeenCalledWith(
            expect.objectContaining({
                text: "Search PubMed for the next diabetes papers.",
                page: "overview",
                agentMode: "search",
            }),
        );
        expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    });

    it("hides the queue action when a queued follow-up already exists", () => {
        render(
            <ChatComposerCore
                page="overview"
                inputPlaceholder="Ask"
                isLoading={true}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
                hasQueuedFollowUp={true}
                onQueueFollowUp={vi.fn()}
            />,
        );

        fireEvent.change(screen.getByRole("textbox"), { target: { value: "Hidden queue action" } });
        expect(screen.queryByRole("button", { name: "Queue next" })).toBeNull();
    });
});
