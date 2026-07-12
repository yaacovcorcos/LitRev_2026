// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatComposerCore } from "../ChatComposerCore";

vi.mock("@/hooks/useVoiceInput", () => ({
    useVoiceInput: () => ({
        state: "idle",
        error: null,
        elapsedMs: 0,
        visualizerAnalyser: null,
        toggleRecording: vi.fn(),
        stopRecording: vi.fn(),
        clearError: vi.fn(),
    }),
}));

vi.mock("@/app/actions/files", () => ({
    listProjectFilesAction: vi.fn(async () => ({ success: true, data: [] })),
}));

describe("ChatComposerCore context capture UI", () => {
    it("renders attached context chips, removes them, and sends them with the message", () => {
        const sendMessage = vi.fn();
        const removeAttachedContextTarget = vi.fn();
        const clearAttachedContextTargets = vi.fn();
        render(
            <ChatComposerCore
                page="protocol"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={sendMessage}
                cancelStream={vi.fn()}
                showVoice={false}
                attachedContextTargets={[
                    {
                        kind: "protocol_field",
                        projectId: "proj_123",
                        section: "PICO Framework",
                        sectionKey: "pico-framework",
                        fieldPath: "pico.population",
                        fieldLabel: "Population",
                        value: "Adults with hypertension",
                        label: "Population",
                        preview: "Adults with hypertension",
                        icon: "tune",
                    },
                ]}
                removeAttachedContextTarget={removeAttachedContextTarget}
                clearAttachedContextTargets={clearAttachedContextTargets}
            />,
        );

        expect(screen.getByText("Population")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Remove Population" }));
        expect(removeAttachedContextTarget).toHaveBeenCalledWith("protocol_field:pico.population");

        fireEvent.change(screen.getByLabelText("Copilot prompt"), { target: { value: "Refine this." } });
        fireEvent.click(screen.getByRole("button", { name: /send/i }));

        expect(sendMessage).toHaveBeenCalledWith(
            "Refine this.",
            "protocol",
            undefined,
            "gpt-5.6-luna",
            "protocol",
            undefined,
            undefined,
            expect.arrayContaining([
                expect.objectContaining({
                    kind: "protocol_field",
                    fieldPath: "pico.population",
                }),
            ]),
        );
        expect(clearAttachedContextTargets).toHaveBeenCalledTimes(1);
    });

    it("shows recent context history and reattaches selected history items", () => {
        const addAttachedContextTargets = vi.fn();
        render(
            <ChatComposerCore
                page="notes"
                inputPlaceholder="Ask"
                isLoading={false}
                sendMessage={vi.fn()}
                cancelStream={vi.fn()}
                showVoice={false}
                recentContextHistory={[
                    {
                        id: "note:note_1",
                        createdAt: new Date().toISOString(),
                        target: {
                            kind: "note",
                            projectId: "proj_123",
                            noteId: "note_1",
                            title: "Reviewer note",
                            excerpt: "Summarize this note",
                            tags: [],
                            label: "Reviewer note",
                            preview: "Summarize this note",
                            icon: "sticky_note_2",
                        },
                    },
                ]}
                addAttachedContextTargets={addAttachedContextTargets}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /Reviewer note/i }));
        expect(addAttachedContextTargets).toHaveBeenCalledWith([
            expect.objectContaining({
                kind: "note",
                noteId: "note_1",
            }),
        ]);
    });
});
