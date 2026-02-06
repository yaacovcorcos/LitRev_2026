"use client";

import { useEffect, useRef } from "react";
import css from "./ConfirmDialog.module.css";

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

  const confirmBtnClass =
    variant === "danger"
      ? `btn btn-primary ${css.actionBtn} ${css.confirmDanger}`
      : `btn btn-primary ${css.actionBtn}`;

  return (
    <div
      className={`modal-overlay ${isOpen ? "active" : ""}`}
      aria-hidden={!isOpen}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className={`modal-glass ${css.dialogGlass}`}>
        <div className="modal-header">
          <h2 className={css.dialogTitle}>{title}</h2>
        </div>
        <p className={css.dialogMessage}>{message}</p>
        <div className="modal-actions">
          <button
            ref={cancelRef}
            className={`btn btn-outline ${css.actionBtn}`}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={confirmBtnClass}
            onClick={onConfirm}
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
      <div className={`modal-glass ${css.dialogGlass}`}>
        <div className="modal-header">
          <h2 className={css.dialogTitle}>{title}</h2>
        </div>
        <p className={css.dialogMessage}>{message}</p>
        <div className="modal-actions">
          <button className={`btn btn-primary ${css.actionBtn}`} onClick={onClose}>
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
