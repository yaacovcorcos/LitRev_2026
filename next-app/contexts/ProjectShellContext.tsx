"use client";

import { createContext, useContext, type ReactNode } from "react";

export type FocusMode = "conversation" | "view";
export type ViewTab = "overview" | "protocol" | "ledger" | "draft" | "notes";

type ProjectShellContextValue = {
    isEmbeddedInProjectShell: boolean;
    focusMode: FocusMode;
    activeTab: ViewTab | null;
    setActiveTab: (tab: ViewTab) => void;
    returnToConversation: () => void;
};

const defaultValue: ProjectShellContextValue = {
    isEmbeddedInProjectShell: false,
    focusMode: "conversation",
    activeTab: null,
    setActiveTab: () => {},
    returnToConversation: () => {},
};

const ProjectShellContext = createContext<ProjectShellContextValue>(defaultValue);

export function ProjectShellProvider({
    value,
    children,
}: {
    value: ProjectShellContextValue;
    children: ReactNode;
}) {
    return (
        <ProjectShellContext.Provider value={value}>
            {children}
        </ProjectShellContext.Provider>
    );
}

export function useProjectShell() {
    return useContext(ProjectShellContext);
}
