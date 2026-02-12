"use client";

import { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Accessible title for screen readers (required by Radix) */
  title?: string;
  /** ID for aria-labelledby — should match the heading's id */
  ariaLabelledBy?: string;
  children: ReactNode;
};

export function Modal({ isOpen, onClose, title = "Dialog", ariaLabelledBy, children }: ModalProps) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal-glass"
          aria-labelledby={ariaLabelledBy}
        >
          <VisuallyHidden>
            <Dialog.Title>{title}</Dialog.Title>
          </VisuallyHidden>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
