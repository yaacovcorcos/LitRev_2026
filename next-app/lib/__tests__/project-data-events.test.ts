// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { addProjectDataChangedListener, dispatchProjectDataChanged } from "@/lib/project-data-events";

const PROJECT_DATA_CHANGED_EVENT = "litrev:project-data-changed";
const LEDGER_CHANGED_EVENT = "litrev:ledger-changed";

describe("project-data-events", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("dispatches canonical event with deduped domains", () => {
        const spy = vi.fn();
        window.addEventListener(PROJECT_DATA_CHANGED_EVENT, spy as EventListener);

        dispatchProjectDataChanged({
            projectId: "project_1",
            domains: ["ledger", "ledger", "notes"],
            source: "test",
        });

        expect(spy).toHaveBeenCalledTimes(1);
        const event = spy.mock.calls[0][0] as CustomEvent<{
            projectId: string;
            domains: string[];
            source?: string;
        }>;
        expect(event.detail.projectId).toBe("project_1");
        expect(event.detail.domains).toEqual(["ledger", "notes"]);
        expect(event.detail.source).toBe("test");

        window.removeEventListener(PROJECT_DATA_CHANGED_EVENT, spy as EventListener);
    });

    it("keeps temporary ledger compatibility bridge", () => {
        const legacySpy = vi.fn();
        window.addEventListener(LEDGER_CHANGED_EVENT, legacySpy as EventListener);

        dispatchProjectDataChanged({
            projectId: "project_2",
            domains: ["ledger"],
            source: "test",
        });
        dispatchProjectDataChanged({
            projectId: "project_2",
            domains: ["notes"],
            source: "test",
        });

        expect(legacySpy).toHaveBeenCalledTimes(1);
        const event = legacySpy.mock.calls[0][0] as CustomEvent<{ projectId: string }>;
        expect(event.detail.projectId).toBe("project_2");

        window.removeEventListener(LEDGER_CHANGED_EVENT, legacySpy as EventListener);
    });

    it("addProjectDataChangedListener unsubscribes correctly", () => {
        const listener = vi.fn();
        const unsub = addProjectDataChangedListener(listener);

        dispatchProjectDataChanged({
            projectId: "project_3",
            domains: ["memory"],
            source: "test",
        });
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith({
            projectId: "project_3",
            domains: ["memory"],
            source: "test",
        });

        unsub();
        dispatchProjectDataChanged({
            projectId: "project_3",
            domains: ["memory"],
            source: "test",
        });
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
