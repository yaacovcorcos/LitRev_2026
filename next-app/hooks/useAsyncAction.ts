"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncActionStatus = "idle" | "loading" | "success" | "error" | "cancelled";

type UseAsyncActionOptions = {
  /** Message dispatched to NotificationProvider on success. */
  successMessage?: string;
  /** Fallback error message when the thrown error has no message. */
  errorMessage?: string;
  /** When true, passes an AbortSignal and exposes cancel(). */
  cancellable?: boolean;
  /** Delay (ms) before auto-resetting from "success" to "idle". Default 2000. 0 = no auto-reset. */
  resetDelay?: number;
};

type UseAsyncActionReturn<T> = {
  status: AsyncActionStatus;
  execute: (...args: unknown[]) => Promise<T | undefined>;
  error: string | null;
  cancel: () => void;
  reset: () => void;
};

/**
 * Custom DOM event dispatched by useAsyncAction so the global
 * NotificationProvider can render toasts without tight coupling.
 */
export const NOTIFICATION_EVENT = "litrev:notification";

export type NotificationEventDetail = {
  type: "success" | "error" | "info";
  message: string;
};

function dispatchNotification(detail: NotificationEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail }));
}

/**
 * Wraps any async operation with consistent status management,
 * double-execution guard, and global notification dispatch.
 *
 * @example
 * const { status, execute } = useAsyncAction(
 *   async (signal) => { await saveProtocol(data, { signal }); },
 *   { successMessage: "Protocol saved" }
 * );
 * <button onClick={execute} disabled={status === "loading"}>Save</button>
 */
export function useAsyncAction<T = void>(
  action: (signal: AbortSignal) => Promise<T>,
  options: UseAsyncActionOptions = {},
): UseAsyncActionReturn<T> {
  const {
    successMessage,
    errorMessage = "Something went wrong. Please try again.",
    cancellable = false,
    resetDelay = 2000,
  } = options;

  const [status, setStatus] = useState<AsyncActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearResetTimer();
    busyRef.current = false;
    setStatus("idle");
    setError(null);
  }, [clearResetTimer]);

  const execute = useCallback(async (): Promise<T | undefined> => {
    // Guard against double-execution (ref avoids stale closure)
    if (busyRef.current) return undefined;
    busyRef.current = true;

    clearResetTimer();
    setStatus("loading");
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await action(controller.signal);

      if (controller.signal.aborted) return undefined;

      setStatus("success");
      if (successMessage) {
        dispatchNotification({ type: "success", message: successMessage });
      }

      if (resetDelay > 0) {
        resetTimerRef.current = setTimeout(() => {
          setStatus("idle");
        }, resetDelay);
      }

      return result;
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
        if (resetDelay > 0) {
          resetTimerRef.current = setTimeout(() => {
            setStatus("idle");
          }, resetDelay);
        }
        return undefined;
      }

      const msg =
        err instanceof Error && err.message ? err.message : errorMessage;
      setStatus("error");
      setError(msg);
      dispatchNotification({ type: "error", message: msg });
      return undefined;
    } finally {
      busyRef.current = false;
      abortRef.current = null;
    }
  }, [action, successMessage, errorMessage, resetDelay, clearResetTimer]);

  const cancel = useCallback(() => {
    if (cancellable && abortRef.current) {
      abortRef.current.abort();
    }
  }, [cancellable]);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { status, execute, error, cancel, reset };
}
