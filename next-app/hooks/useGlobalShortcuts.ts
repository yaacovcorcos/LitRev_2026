"use client";

import { useEffect } from "react";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";

/**
 * Global keyboard shortcuts.
 * Call once from CommandPaletteProvider's tree (e.g., CommandPalette component).
 *
 * Cmd/Ctrl+K  → toggle command palette
 * Cmd/Ctrl+/  → toggle copilot panel
 * Cmd/Ctrl+B  → toggle sidebar
 */
export function useGlobalShortcuts() {
    const { toggle, copilotToggle, sidebarToggle } = useCommandPalette();

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;

            // Don't fire in inputs unless it's one of our specific shortcuts
            const target = e.target as HTMLElement;
            const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

            if (e.key === "k") {
                e.preventDefault();
                toggle();
                return;
            }

            if (e.key === "/" && !isInput) {
                e.preventDefault();
                copilotToggle?.();
                return;
            }

            if (e.key === "b" && !isInput) {
                e.preventDefault();
                sidebarToggle?.();
                return;
            }
        };

        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [toggle, copilotToggle, sidebarToggle]);
}
