"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** ID for aria-labelledby — should match the heading's id */
  ariaLabelledBy?: string;
  children: ReactNode;
};

export function Modal({ isOpen, onClose, ariaLabelledBy, children }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  // Resolve portal target on mount (client-only)
  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  // Capture focus on open, restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Focus trap + escape
  useEffect(() => {
    if (!isOpen || !overlayRef.current) return;

    const modalEl = overlayRef.current;

    const getFocusable = () =>
      modalEl.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

    // Auto-focus first focusable element
    const focusable = getFocusable();
    focusable[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const elements = getFocusable();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const overlay = (
    <div
      className={`modal-overlay ${isOpen ? "active" : ""}`}
      aria-hidden={!isOpen}
      ref={overlayRef}
      onClick={handleOverlayClick}
    >
      <div
        className="modal-glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
      >
        {children}
      </div>
    </div>
  );

  // Portal to document.body to escape ancestor backdrop-filter/transform containment
  if (portalTarget) {
    return createPortal(overlay, portalTarget);
  }

  return overlay;
}
