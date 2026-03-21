"use client";

import {
  useNotifications,
  type Notification,
} from "@/contexts/NotificationContext";
import styles from "./Toast.module.css";

const ICON_MAP: Record<Notification["type"], string> = {
  success: "check_circle",
  error: "error",
  info: "info",
};

function ToastItem({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className={`${styles.toast} ${styles[notification.type]}`}
      role="status"
    >
      <span className={`material-icons-round ${styles.icon}`} aria-hidden="true">
        {ICON_MAP[notification.type]}
      </span>
      <span className={styles.message}>{notification.message}</span>
      {notification.action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            notification.action?.onClick();
            onDismiss(notification.id);
          }}
        >
          {notification.action.label}
        </button>
      ) : null}
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss(notification.id)}
        aria-label="Dismiss notification"
      >
        <span className="material-icons-round" aria-hidden="true">
          close
        </span>
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { notifications, dismiss } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <>
      {/* Screen-reader live region — announces every notification */}
      <div aria-live="polite" aria-atomic="false" className={styles.srOnly}>
        {notifications.map((n) => (
          <p key={n.id}>{n.message}</p>
        ))}
      </div>

      <div className={styles.container} aria-label="Notifications">
        {notifications.map((n) => (
          <ToastItem key={n.id} notification={n} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}
