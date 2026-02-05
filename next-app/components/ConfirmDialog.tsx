"use client";

import { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && cancelRef.current) {
      cancelRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onCancel]);

  const confirmColor = variant === "danger" ? "#dc2626" : "var(--accent-primary)";

  return (
    <div
      className={`modal-overlay ${isOpen ? "active" : ""}`}
      aria-hidden={!isOpen}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="modal-glass" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 18 }}>{title}</h2>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{message}</p>
        <div className="modal-actions">
          <button
            ref={cancelRef}
            className="btn btn-outline"
            onClick={onCancel}
            style={{ flex: 1 }}
          >
            {cancelLabel}
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            style={{ flex: 1, background: confirmColor, borderColor: confirmColor }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Alert-style dialog (no cancel button, just acknowledge) */
export function AlertDialog({
  isOpen,
  title,
  message,
  buttonLabel = "OK",
  onClose,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  buttonLabel?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  return (
    <div
      className={`modal-overlay ${isOpen ? "active" : ""}`}
      aria-hidden={!isOpen}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-glass" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 18 }}>{title}</h2>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{message}</p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose} style={{ flex: 1 }}>
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
