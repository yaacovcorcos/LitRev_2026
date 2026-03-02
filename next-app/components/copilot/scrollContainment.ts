export function isElementVerticallyScrollable(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY === "visible" ? style.overflow : style.overflowY;
    const allowsScroll = /(auto|scroll|overlay)/.test(overflowY);
    if (!allowsScroll) return false;
    return element.scrollHeight > element.clientHeight + 1;
}

export function findScrollableAncestorWithinBoundary(
    start: HTMLElement | null,
    boundary: HTMLElement | null,
): HTMLElement | null {
    if (!start) return null;
    let cursor: HTMLElement | null = start;
    while (cursor) {
        if (isElementVerticallyScrollable(cursor)) return cursor;
        if (cursor === boundary) break;
        cursor = cursor.parentElement;
    }
    return null;
}

type WheelContainmentDecision = {
    shouldPreventDefault: boolean;
    shouldRedirectToTimeline: boolean;
};

export function decideCopilotWheelContainment({
    target,
    panelElement,
    timelineElement,
    ctrlKey = false,
}: {
    target: EventTarget | null;
    panelElement: HTMLElement | null;
    timelineElement: HTMLElement | null;
    ctrlKey?: boolean;
}): WheelContainmentDecision {
    if (ctrlKey) {
        return { shouldPreventDefault: false, shouldRedirectToTimeline: false };
    }
    if (!(target instanceof HTMLElement) || !panelElement || !timelineElement) {
        return { shouldPreventDefault: false, shouldRedirectToTimeline: false };
    }

    const scrollOwner = findScrollableAncestorWithinBoundary(target, panelElement);
    if (scrollOwner && scrollOwner !== panelElement && scrollOwner !== timelineElement) {
        return { shouldPreventDefault: false, shouldRedirectToTimeline: false };
    }
    if (scrollOwner === timelineElement) {
        return { shouldPreventDefault: false, shouldRedirectToTimeline: false };
    }

    if (!isElementVerticallyScrollable(timelineElement)) {
        // Never hard-lock wheel input when the timeline can't scroll.
        return { shouldPreventDefault: false, shouldRedirectToTimeline: false };
    }

    return { shouldPreventDefault: true, shouldRedirectToTimeline: true };
}
