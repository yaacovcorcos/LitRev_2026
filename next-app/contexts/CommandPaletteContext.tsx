"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type CommandPaletteContextValue = {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
    sidebarToggle: (() => void) | null;
    registerSidebarToggle: (fn: (() => void) | null) => void;
    copilotToggle: (() => void) | null;
    registerCopilotToggle: (fn: (() => void) | null) => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const sidebarToggleRef = useRef<(() => void) | null>(null);
    const copilotToggleRef = useRef<(() => void) | null>(null);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const toggle = useCallback(() => setIsOpen((p) => !p), []);

    const registerSidebarToggle = useCallback((fn: (() => void) | null) => {
        sidebarToggleRef.current = fn;
    }, []);

    const registerCopilotToggle = useCallback((fn: (() => void) | null) => {
        copilotToggleRef.current = fn;
    }, []);

    const value: CommandPaletteContextValue = {
        isOpen,
        open,
        close,
        toggle,
        get sidebarToggle() { return sidebarToggleRef.current; },
        registerSidebarToggle,
        get copilotToggle() { return copilotToggleRef.current; },
        registerCopilotToggle,
    };

    return (
        <CommandPaletteContext.Provider value={value}>
            {children}
        </CommandPaletteContext.Provider>
    );
}

export function useCommandPalette() {
    const ctx = useContext(CommandPaletteContext);
    if (!ctx) {
        throw new Error("useCommandPalette must be used within CommandPaletteProvider");
    }
    return ctx;
}
