"use client";

import * as RadixAlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
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
  const confirmBtnClass =
    variant === "danger"
      ? `btn btn-primary ${css.actionBtn} ${css.confirmDanger}`
      : `btn btn-primary ${css.actionBtn}`;

  return (
    <RadixAlertDialog.Root open={isOpen}>
      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className="modal-overlay" />
        <RadixAlertDialog.Content
          className={`modal-glass ${css.dialogGlass}`}
          onEscapeKeyDown={onCancel}
        >
          <RadixAlertDialog.Title className={css.dialogTitle}>
            {title}
          </RadixAlertDialog.Title>
          <RadixAlertDialog.Description className={css.dialogMessage}>
            {message}
          </RadixAlertDialog.Description>
          <div className="modal-actions">
            <RadixAlertDialog.Cancel asChild>
              <button
                className={`btn btn-outline ${css.actionBtn}`}
                onClick={onCancel}
              >
                {cancelLabel}
              </button>
            </RadixAlertDialog.Cancel>
            <RadixAlertDialog.Action asChild>
              <button className={confirmBtnClass} onClick={onConfirm}>
                {confirmLabel}
              </button>
            </RadixAlertDialog.Action>
          </div>
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
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
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal-glass ${css.dialogGlass}`}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
            ) {
              onClose();
            }
          }}
        >
          <Dialog.Title className={css.dialogTitle}>{title}</Dialog.Title>
          <Dialog.Description className={css.dialogMessage}>
            {message}
          </Dialog.Description>
          <div className="modal-actions">
            <Dialog.Close asChild>
              <button className={`btn btn-primary ${css.actionBtn}`}>
                {buttonLabel}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
