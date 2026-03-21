"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./users.module.css";

type Props = {
  targetUserId: string;
  isPlatformAdmin: boolean;
  isSelf: boolean;
};

export function AdminUserRoleControls({ targetUserId, isPlatformAdmin, isSelf }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const makeAdmin = !isPlatformAdmin;

  const onSubmit = () => {
    const actionLabel = makeAdmin ? "grant" : "revoke";
    const ok = window.confirm(
      `Are you sure you want to ${actionLabel} platform admin for this user?`,
    );
    if (!ok) return;

    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/users/${targetUserId}/platform-admin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            makeAdmin,
            reason: reason.trim() || undefined,
          }),
        });

        let payload: { error?: string } = {};
        try {
          payload = (await response.json()) as { error?: string };
        } catch {
          payload = {};
        }
        if (!response.ok) {
          setError(payload.error ?? "Request failed.");
          return;
        }

        setReason("");
        router.refresh();
      } catch {
        setError("Network error while updating platform admin role.");
      }
    });
  };

  const revokeBlocked = isSelf && isPlatformAdmin;

  return (
    <div className={styles.roleControls}>
      <input
        className={styles.reasonInput}
        type="text"
        placeholder="Reason (optional)"
        value={reason}
        maxLength={500}
        onChange={(event) => setReason(event.target.value)}
        disabled={isPending}
      />
      <button
        type="button"
        className={styles.roleButton}
        onClick={onSubmit}
        disabled={isPending || revokeBlocked}
      >
        {isPending ? "Updating..." : makeAdmin ? "Grant Admin" : "Revoke Admin"}
      </button>
      {revokeBlocked ? <span className={styles.roleHint}>Self-revoke is disabled.</span> : null}
      {error ? <span className={styles.roleError}>{error}</span> : null}
    </div>
  );
}
