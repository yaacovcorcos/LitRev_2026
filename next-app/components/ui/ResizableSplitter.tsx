"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./ResizableSplitter.module.css";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type DragDirection = "normal" | "reverse";

type ResizableSplitterProps = {
  value: number;
  min: number;
  max: number;
  onChange: (nextValue: number) => void;
  className?: string;
  ariaLabel?: string;
  step?: number;
  disabled?: boolean;
  hidden?: boolean;
  dragDirection?: DragDirection;
};

type DragState = {
  pointerId: number;
  startX: number;
  startValue: number;
  target: HTMLDivElement;
};

export function ResizableSplitter({
  value,
  min,
  max,
  onChange,
  className,
  ariaLabel = "Resize panel",
  step = 20,
  disabled = false,
  hidden = false,
  dragDirection = "normal",
}: ResizableSplitterProps) {
  const dragStateRef = useRef<DragState | null>(null);
  const stopDraggingRef = useRef<() => void>(() => {});
  const savedCursorRef = useRef<string | null>(null);
  const savedUserSelectRef = useRef<string | null>(null);

  const valueNow = clamp(value, min, max);
  const direction = dragDirection === "reverse" ? -1 : 1;

  const restoreBodyStyles = useCallback(() => {
    if (typeof document === "undefined") return;
    if (savedCursorRef.current !== null) document.body.style.cursor = savedCursorRef.current;
    if (savedUserSelectRef.current !== null) document.body.style.userSelect = savedUserSelectRef.current;
    savedCursorRef.current = null;
    savedUserSelectRef.current = null;
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const state = dragStateRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    const delta = (event.clientX - state.startX) * direction;
    onChange(clamp(state.startValue + delta, min, max));
  }, [direction, max, min, onChange]);

  const handlePointerUpOrCancel = useCallback((event: PointerEvent) => {
    const state = dragStateRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    stopDraggingRef.current();
  }, []);

  const stopDragging = useCallback(() => {
    const state = dragStateRef.current;
    if (state?.target.hasPointerCapture?.(state.pointerId)) {
      state.target.releasePointerCapture?.(state.pointerId);
    }
    dragStateRef.current = null;
    restoreBodyStyles();
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUpOrCancel);
    window.removeEventListener("pointercancel", handlePointerUpOrCancel);
  }, [handlePointerMove, handlePointerUpOrCancel, restoreBodyStyles]);

  useEffect(() => {
    stopDraggingRef.current = stopDragging;
  }, [stopDragging]);

  useEffect(() => {
    return () => {
      stopDragging();
    };
  }, [stopDragging]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    const target = event.currentTarget;
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: valueNow,
      target,
    };
    if (typeof document !== "undefined") {
      savedCursorRef.current = document.body.style.cursor;
      savedUserSelectRef.current = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    target.setPointerCapture?.(event.pointerId);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUpOrCancel);
    window.addEventListener("pointercancel", handlePointerUpOrCancel);
    event.preventDefault();
  }, [disabled, handlePointerMove, handlePointerUpOrCancel, valueNow]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next = valueNow;
    if ((event.key === "ArrowLeft" && direction === -1) || (event.key === "ArrowRight" && direction === 1)) {
      next = clamp(valueNow + step, min, max);
    } else if ((event.key === "ArrowRight" && direction === -1) || (event.key === "ArrowLeft" && direction === 1)) {
      next = clamp(valueNow - step, min, max);
    } else if (event.key === "Home") {
      next = min;
    } else if (event.key === "End") {
      next = max;
    } else {
      return;
    }
    event.preventDefault();
    if (next !== valueNow) onChange(next);
  }, [direction, disabled, max, min, onChange, step, valueNow]);

  const combinedClassName = [styles.splitter, className].filter(Boolean).join(" ");

  return (
    <div
      className={combinedClassName}
      role="separator"
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-hidden={hidden}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={valueNow}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    />
  );
}
