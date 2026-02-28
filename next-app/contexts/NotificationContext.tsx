"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  NOTIFICATION_EVENT,
  type NotificationEventDetail,
} from "@/hooks/useAsyncAction";

// ─── Types ───────────────────────────────────────────────────────────

export type NotificationType = "success" | "error" | "info";

export type Notification = {
  id: string;
  type: NotificationType;
  message: string;
};

type NotificationContextValue = {
  notifications: Notification[];
  /** Manually push a notification (most callers should use useAsyncAction instead). */
  notify: (type: NotificationType, message: string) => void;
  dismiss: (id: string) => void;
};

// ─── Context ─────────────────────────────────────────────────────────

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}

// ─── Constants ───────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 4000;
const ERROR_DISMISS_MS = 8000;
const MAX_VISIBLE = 5;
const DEDUP_WINDOW_MS = 500;

// ─── Provider ────────────────────────────────────────────────────────

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const recentRef = useRef<Map<string, number>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (type: NotificationType, message: string) => {
      // Deduplicate rapid-fire identical messages
      const dedupeKey = `${type}:${message}`;
      const now = Date.now();
      const lastSeen = recentRef.current.get(dedupeKey);
      if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return;
      recentRef.current.set(dedupeKey, now);

      const id = crypto.randomUUID();
      const notification: Notification = { id, type, message };

      setNotifications((prev) => {
        const next = [...prev, notification];
        // Cap visible notifications
        return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
      });

      // Auto-dismiss
      const delay = type === "error" ? ERROR_DISMISS_MS : AUTO_DISMISS_MS;
      const timer = setTimeout(() => dismiss(id), delay);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  // Listen for events dispatched by useAsyncAction
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<NotificationEventDetail>).detail;
      if (detail?.type && detail?.message) {
        notify(detail.type, detail.message);
      }
    }
    window.addEventListener(NOTIFICATION_EVENT, handler);
    return () => window.removeEventListener(NOTIFICATION_EVENT, handler);
  }, [notify]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // Clean up stale dedup entries periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [key, ts] of recentRef.current) {
        if (now - ts > DEDUP_WINDOW_MS * 2) recentRef.current.delete(key);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, notify, dismiss }}>
      {children}
    </NotificationContext.Provider>
  );
}
