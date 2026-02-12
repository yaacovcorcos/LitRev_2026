"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { PopupChatContext as PopupChatContextPayload } from "@/types/popup-chat";

type PopupChatContextValue = {
    isOpen: boolean;
    context: PopupChatContextPayload | null;
    openPopupChat: (ctx: PopupChatContextPayload) => void;
    closePopupChat: () => void;
};

const PopupChatCtx = createContext<PopupChatContextValue | undefined>(undefined);

export function PopupChatProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [context, setContext] = useState<PopupChatContextPayload | null>(null);

    const openPopupChat = useCallback((ctx: PopupChatContextPayload) => {
        setContext(ctx);
        setIsOpen(true);
    }, []);

    const closePopupChat = useCallback(() => {
        setIsOpen(false);
        setContext(null);
    }, []);

    return (
        <PopupChatCtx.Provider value={{ isOpen, context, openPopupChat, closePopupChat }}>
            {children}
        </PopupChatCtx.Provider>
    );
}

export function usePopupChat() {
    const ctx = useContext(PopupChatCtx);
    if (!ctx) {
        throw new Error("usePopupChat must be used within PopupChatProvider");
    }
    return ctx;
}
