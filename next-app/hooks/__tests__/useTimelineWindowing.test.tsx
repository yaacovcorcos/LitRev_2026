// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import { useTimelineWindowing } from "@/hooks/useTimelineWindowing";

type TimelineItem = { id: string };

function makeItems(...ids: string[]): TimelineItem[] {
  return ids.map((id) => ({ id }));
}

function makeFirstItemRef(): MutableRefObject<HTMLDivElement | null> {
  return { current: document.createElement("div") };
}

describe("useTimelineWindowing", () => {
  it("restores the prepend anchor when older items load ahead of the current first visible item", async () => {
    const capturePrependAnchor = vi.fn();
    const restorePrependAnchor = vi.fn();
    const firstItemRef = makeFirstItemRef();
    let resolveLoadOlder: (() => void) | null = null;
    const onLoadOlder = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLoadOlder = resolve;
        }),
    );

    const { result, rerender } = renderHook(
      ({ items }) =>
        useTimelineWindowing({
          items,
          onLoadOlder,
          capturePrependAnchor,
          restorePrependAnchor,
          firstItemRef,
          getItemId: (item) => item?.id ?? null,
        }),
      { initialProps: { items: makeItems("item-3", "item-4", "item-5") } },
    );

    let loadOlderPromise: Promise<void> | undefined;
    act(() => {
      loadOlderPromise = result.current.handleLoadOlder();
    });

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    expect(capturePrependAnchor).toHaveBeenCalledWith(firstItemRef.current);

    rerender({ items: makeItems("item-2", "item-3", "item-4", "item-5") });

    await waitFor(() => {
      expect(restorePrependAnchor).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveLoadOlder?.();
      await loadOlderPromise;
    });
  });

  it("captures and restores the anchor when revealing earlier hidden items", async () => {
    const capturePrependAnchor = vi.fn();
    const restorePrependAnchor = vi.fn();
    const firstItemRef = makeFirstItemRef();

    const { result } = renderHook(() =>
      useTimelineWindowing({
        items: makeItems("item-1", "item-2", "item-3", "item-4"),
        initialVisibleCount: 2,
        visibleStep: 2,
        capturePrependAnchor,
        restorePrependAnchor,
        firstItemRef,
        getItemId: (item) => item?.id ?? null,
      }),
    );

    expect(result.current.visibleItems.map((item) => item.id)).toEqual(["item-3", "item-4"]);

    act(() => {
      result.current.handleRevealEarlier();
    });

    expect(capturePrependAnchor).toHaveBeenCalledWith(firstItemRef.current);

    await waitFor(() => {
      expect(result.current.visibleItems.map((item) => item.id)).toEqual([
        "item-1",
        "item-2",
        "item-3",
        "item-4",
      ]);
    });

    expect(restorePrependAnchor).toHaveBeenCalledTimes(1);
  });

  it("hydrates an initially empty timeline without inventing hidden messages", () => {
    const capturePrependAnchor = vi.fn();
    const restorePrependAnchor = vi.fn();
    const firstItemRef = makeFirstItemRef();

    const { result, rerender } = renderHook(
      ({ items }) =>
        useTimelineWindowing({
          items,
          initialVisibleCount: 80,
          visibleStep: 80,
          capturePrependAnchor,
          restorePrependAnchor,
          firstItemRef,
          getItemId: (item) => item?.id ?? null,
        }),
      { initialProps: { items: makeItems() } },
    );

    expect(result.current.hiddenItemCount).toBe(0);
    expect(result.current.visibleItems).toEqual([]);

    rerender({ items: makeItems("user-1", "assistant-1") });

    expect(result.current.hiddenItemCount).toBe(0);
    expect(result.current.visibleItems.map((item) => item.id)).toEqual([
      "user-1",
      "assistant-1",
    ]);
  });
});
