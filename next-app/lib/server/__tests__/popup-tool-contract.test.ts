import { describe, expect, it } from "vitest";
import { createPopupToolGuard, getAllowedPopupFields } from "@/lib/server/ai/popup-tool-contract";

describe("popup-tool-contract", () => {
    it("allows protocol fields only within section scope", () => {
        const fields = getAllowedPopupFields({
            type: "protocol_section",
            projectId: "p1",
            section: "PICO Framework",
            sectionKey: "pico-framework",
            currentContent: "",
        });

        expect(fields).toContain("pico.population");
        expect(fields).not.toContain("researchQuestion");
    });

    it("blocks disallowed tools in popup mode", async () => {
        const guard = createPopupToolGuard({
            projectId: "p1",
            popupContext: {
                type: "protocol_section",
                projectId: "p1",
                section: "Research Question",
                sectionKey: "research-question",
                currentContent: "",
            },
        });

        const blocked = await guard.before?.({
            name: "delete_study",
            args: {},
            callId: "call-1",
            context: { projectId: "p1" },
        });

        expect(blocked?.shortCircuitResult?.error).toContain("not allowed");
    });

    it("blocks update_protocol writes outside section field allowlist", async () => {
        const guard = createPopupToolGuard({
            projectId: "p1",
            popupContext: {
                type: "protocol_section",
                projectId: "p1",
                section: "Research Question",
                sectionKey: "research-question",
                currentContent: "",
            },
        });

        const blocked = await guard.before?.({
            name: "update_protocol",
            args: { field: "pico.population", value: "Adults", rationale: "test" },
            callId: "call-2",
            context: { projectId: "p1" },
        });

        expect(blocked?.shortCircuitResult?.error).toContain("outside the current popup section scope");
    });
});
