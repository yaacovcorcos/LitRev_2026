export function isElementVerticallyScrollable(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY === "visible" ? style.overflow : style.overflowY;
    const allowsScroll = /(auto|scroll|overlay)/.test(overflowY);
    if (!allowsScroll) return false;
    return element.scrollHeight > element.clientHeight + 1;
}

function canScrollInDirection(element: HTMLElement, deltaY: number): boolean {
    if (deltaY === 0) return false;
    const top = element.scrollTop;
    const maxTop = element.scrollHeight - element.clientHeight;
    if (deltaY > 0) return top < maxTop - 1;
    return top > 1;
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
    deltaY,
    ctrlKey = false,
}: {
    target: EventTarget | null;
    panelElement: HTMLElement | null;
    timelineElement: HTMLElement | null;
    deltaY: number;
    ctrlKey?: boolean;
}): WheelContainmentDecision {
    if (ctrlKey) {
        return { shouldPreventDefault: false, shouldRedirectToTimeline: false };
    }
    if (!(target instanceof HTMLElement) || !panelElement || !timelineElement) {
        return { shouldPreventDefault: false, shouldRedirectToTimeline: false };
    }

    const scrollOwner = findScrollableAncestorWithinBoundary(target, panelElement);
    if (scrollOwner === timelineElement) {
        return { shouldPreventDefault: false, shouldRedirectToTimeline: false };
    }

    if (scrollOwner && scrollOwner !== panelElement && scrollOwner !== timelineElement) {
        if (canScrollInDirection(scrollOwner, deltaY)) {
            return { shouldPreventDefault: false, shouldRedirectToTimeline: false };
        }
        if (isElementVerticallyScrollable(timelineElement) && canScrollInDirection(timelineElement, deltaY)) {
            return { shouldPreventDefault: true, shouldRedirectToTimeline: true };
        }
        return { shouldPreventDefault: false, shouldRedirectToTimeline: false };
    }

    if (isElementVerticallyScrollable(timelineElement) && canScrollInDirection(timelineElement, deltaY)) {
        return { shouldPreventDefault: true, shouldRedirectToTimeline: true };
    }
    return { shouldPreventDefault: false, shouldRedirectToTimeline: false };
}
