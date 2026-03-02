// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
    decideCopilotWheelContainment,
    findScrollableAncestorWithinBoundary,
    isElementVerticallyScrollable,
} from "../scrollContainment";

function setScrollMetrics(element: HTMLElement, { clientHeight, scrollHeight }: { clientHeight: number; scrollHeight: number }) {
    Object.defineProperty(element, "clientHeight", {
        configurable: true,
        get: () => clientHeight,
    });
    Object.defineProperty(element, "scrollHeight", {
        configurable: true,
        get: () => scrollHeight,
    });
}

describe("scrollContainment", () => {
    it("detects vertical scrollability from overflow + geometry", () => {
        const el = document.createElement("div");
        el.style.overflowY = "auto";
        setScrollMetrics(el, { clientHeight: 100, scrollHeight: 240 });
        expect(isElementVerticallyScrollable(el)).toBe(true);
    });

    it("treats hidden overflow as non-scrollable", () => {
        const el = document.createElement("div");
        el.style.overflowY = "hidden";
        setScrollMetrics(el, { clientHeight: 100, scrollHeight: 240 });
        expect(isElementVerticallyScrollable(el)).toBe(false);
    });

    it("finds the nearest scrollable ancestor within boundary", () => {
        const panel = document.createElement("section");
        const scroller = document.createElement("div");
        const child = document.createElement("button");
        scroller.style.overflowY = "auto";
        setScrollMetrics(scroller, { clientHeight: 100, scrollHeight: 200 });
        panel.appendChild(scroller);
        scroller.appendChild(child);

        expect(findScrollableAncestorWithinBoundary(child, panel)).toBe(scroller);
    });

    it("redirects wheel from non-scrollable copilot regions to timeline", () => {
        const panel = document.createElement("section");
        const header = document.createElement("div");
        const timeline = document.createElement("div");
        timeline.style.overflowY = "auto";
        setScrollMetrics(timeline, { clientHeight: 300, scrollHeight: 600 });
        panel.appendChild(header);
        panel.appendChild(timeline);

        const decision = decideCopilotWheelContainment({
            target: header,
            panelElement: panel,
            timelineElement: timeline,
        });

        expect(decision.shouldPreventDefault).toBe(true);
        expect(decision.shouldRedirectToTimeline).toBe(true);
    });

    it("allows native scrolling when wheel is already in timeline", () => {
        const panel = document.createElement("section");
        const timeline = document.createElement("div");
        timeline.style.overflowY = "auto";
        setScrollMetrics(timeline, { clientHeight: 300, scrollHeight: 600 });
        panel.appendChild(timeline);

        const decision = decideCopilotWheelContainment({
            target: timeline,
            panelElement: panel,
            timelineElement: timeline,
        });

        expect(decision.shouldPreventDefault).toBe(false);
        expect(decision.shouldRedirectToTimeline).toBe(false);
    });

    it("does not hijack wheel for nested scrollables like textarea", () => {
        const panel = document.createElement("section");
        const inputWrap = document.createElement("div");
        const textarea = document.createElement("textarea");
        const timeline = document.createElement("div");
        textarea.style.overflowY = "auto";
        setScrollMetrics(textarea, { clientHeight: 60, scrollHeight: 180 });
        timeline.style.overflowY = "auto";
        setScrollMetrics(timeline, { clientHeight: 300, scrollHeight: 600 });

        panel.appendChild(inputWrap);
        inputWrap.appendChild(textarea);
        panel.appendChild(timeline);

        const decision = decideCopilotWheelContainment({
            target: textarea,
            panelElement: panel,
            timelineElement: timeline,
        });

        expect(decision.shouldPreventDefault).toBe(false);
        expect(decision.shouldRedirectToTimeline).toBe(false);
    });

    it("does not hard-block wheel when timeline itself cannot scroll", () => {
        const panel = document.createElement("section");
        const header = document.createElement("div");
        const timeline = document.createElement("div");
        timeline.style.overflowY = "auto";
        setScrollMetrics(timeline, { clientHeight: 300, scrollHeight: 300 });
        panel.appendChild(header);
        panel.appendChild(timeline);

        const decision = decideCopilotWheelContainment({
            target: header,
            panelElement: panel,
            timelineElement: timeline,
        });

        expect(decision.shouldPreventDefault).toBe(false);
        expect(decision.shouldRedirectToTimeline).toBe(false);
    });

    it("does not intercept ctrl+wheel zoom gestures", () => {
        const panel = document.createElement("section");
        const header = document.createElement("div");
        const timeline = document.createElement("div");
        timeline.style.overflowY = "auto";
        setScrollMetrics(timeline, { clientHeight: 300, scrollHeight: 900 });
        panel.appendChild(header);
        panel.appendChild(timeline);

        const decision = decideCopilotWheelContainment({
            target: header,
            panelElement: panel,
            timelineElement: timeline,
            ctrlKey: true,
        });

        expect(decision.shouldPreventDefault).toBe(false);
        expect(decision.shouldRedirectToTimeline).toBe(false);
    });
});
