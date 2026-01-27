"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    CopilotMessage,
    ProjectCopilotState,
    loadProjectCopilotState,
    saveProjectCopilotState,
    createDefaultProjectCopilotState,
} from "@/lib/projectCopilotStorage";

export type CopilotPage = "draft" | "protocol" | "ledger";

type ProjectCopilotContextValue = {
    /** Current copilot state */
    state: ProjectCopilotState;
    /** All messages in the copilot */
    messages: CopilotMessage[];
    /** Whether the panel is collapsed */
    isCollapsed: boolean;
    /** Current panel width */
    panelWidth: number;
    /** Toggle the panel collapsed state */
    toggleCollapsed: () => void;
    /** Set the panel collapsed state */
    setCollapsed: (collapsed: boolean) => void;
    /** Update the panel width */
    setPanelWidth: (width: number) => void;
    /** Send a message to the copilot */
    sendMessage: (text: string, page: CopilotPage, section?: string) => void;
    /** Clear all messages */
    clearMessages: () => void;
};

const ProjectCopilotContext = createContext<ProjectCopilotContextValue | undefined>(undefined);

type ProjectCopilotProviderProps = {
    projectId: string;
    children: ReactNode;
};

export function ProjectCopilotProvider({ projectId, children }: ProjectCopilotProviderProps) {
    // Use lazy initialization to load state from storage
    // Note: projectId is stable for the lifetime of this component since
    // the layout.tsx creates a new provider instance per project
    const [state, setState] = useState<ProjectCopilotState>(() => {
        if (projectId) {
            return loadProjectCopilotState(projectId);
        }
        return createDefaultProjectCopilotState();
    });
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Save state with debounce
    const scheduleSave = useCallback(
        (next: ProjectCopilotState) => {
            if (!projectId) return;
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            saveTimerRef.current = setTimeout(() => {
                saveProjectCopilotState(projectId, next);
            }, 400);
        },
        [projectId]
    );

    const updateState = useCallback(
        (updater: (prev: ProjectCopilotState) => ProjectCopilotState) => {
            setState((prev) => {
                const next = updater(prev);
                if (next === prev) return prev;
                scheduleSave(next);
                return next;
            });
        },
        [scheduleSave]
    );

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
        };
    }, []);

    const toggleCollapsed = useCallback(() => {
        updateState((prev) => ({
            ...prev,
            panel: { ...prev.panel, collapsed: !prev.panel.collapsed },
        }));
    }, [updateState]);

    const setCollapsed = useCallback(
        (collapsed: boolean) => {
            updateState((prev) => ({
                ...prev,
                panel: { ...prev.panel, collapsed },
            }));
        },
        [updateState]
    );

    const setPanelWidth = useCallback(
        (width: number) => {
            updateState((prev) => ({
                ...prev,
                panel: { ...prev.panel, width, collapsed: false },
            }));
        },
        [updateState]
    );

    const sendMessage = useCallback(
        (text: string, page: CopilotPage, section?: string) => {
            const trimmed = text.trim();
            if (!trimmed) return;

            // Add user message
            const userMessage: CopilotMessage = {
                id: `m-${Date.now()}`,
                sender: "user",
                text: trimmed,
                createdAt: new Date().toISOString(),
                context: { page, section },
            };

            updateState((prev) => ({
                ...prev,
                messages: [...prev.messages, userMessage],
            }));

            // Mock AI response (will be replaced with real API call later)
            setTimeout(() => {
                const aiMessage: CopilotMessage = {
                    id: `m-${Date.now() + 1}`,
                    sender: "ai",
                    text: generateMockResponse(trimmed, page, section),
                    createdAt: new Date().toISOString(),
                    context: { page, section },
                };

                updateState((prev) => ({
                    ...prev,
                    messages: [...prev.messages, aiMessage],
                }));
            }, 800);
        },
        [updateState]
    );

    const clearMessages = useCallback(() => {
        updateState((prev) => ({
            ...prev,
            messages: [],
        }));
    }, [updateState]);

    const value = useMemo(
        () => ({
            state,
            messages: state.messages,
            isCollapsed: state.panel.collapsed,
            panelWidth: state.panel.width,
            toggleCollapsed,
            setCollapsed,
            setPanelWidth,
            sendMessage,
            clearMessages,
        }),
        [state, toggleCollapsed, setCollapsed, setPanelWidth, sendMessage, clearMessages]
    );

    return (
        <ProjectCopilotContext.Provider value={value}>
            {children}
        </ProjectCopilotContext.Provider>
    );
}

export function useProjectCopilot() {
    const ctx = useContext(ProjectCopilotContext);
    if (!ctx) {
        throw new Error("useProjectCopilot must be used within ProjectCopilotProvider");
    }
    return ctx;
}

/** Generate a mock AI response based on context */
function generateMockResponse(userText: string, page: CopilotPage, section?: string): string {
    const lowerText = userText.toLowerCase();

    if (page === "draft") {
        if (lowerText.includes("outline")) {
            return `Here's a suggested outline for ${section || "this section"}:\n\n1. **Introduction** - Set the context and objectives\n2. **Key Findings** - Present the main results\n3. **Analysis** - Interpret the findings\n4. **Implications** - Discuss practical applications\n5. **Conclusion** - Summarize key takeaways\n\nWould you like me to expand on any of these points?`;
        }
        if (lowerText.includes("rewrite")) {
            return `I'd be happy to help rewrite that. Please paste the paragraph you'd like me to improve, and I'll provide a clearer, more academic version.`;
        }
        return `I can help you with the ${section || "draft"} section. Here are some suggestions:\n\n• Consider adding more evidence to support your claims\n• The flow could be improved by adding transition sentences\n• Would you like me to suggest specific improvements?`;
    }

    if (page === "ledger") {
        if (lowerText.includes("summarize")) {
            return `Based on your evidence ledger, here's a summary:\n\n**Key Themes:**\n• Most studies focus on diagnostic accuracy\n• Sample sizes range from 50 to 5,000 participants\n• Predominantly retrospective study designs\n\n**Quality Assessment:**\n• 60% rated as high quality\n• 30% rated as medium quality\n• 10% pending review\n\nWould you like me to elaborate on any specific aspect?`;
        }
        if (lowerText.includes("theme") || lowerText.includes("pattern")) {
            return `I've identified several themes across your studies:\n\n1. **Methodology** - Most use retrospective designs\n2. **Population** - Adult patients in clinical settings\n3. **Outcomes** - Focus on diagnostic accuracy metrics\n4. **Limitations** - Common issues with selection bias\n\nWould you like detailed analysis of any theme?`;
        }
        if (lowerText.includes("conflict")) {
            return `I found some potentially conflicting findings:\n\n• Smith et al. (2022) reports 95% accuracy while Jones et al. (2021) reports 78%\n• Differences may be due to population characteristics or methodology\n\nWould you like me to help analyze these discrepancies?`;
        }
        return `I can help you analyze your evidence ledger. Try asking me to:\n\n• Summarize key findings\n• Find common themes\n• Identify conflicting results\n• Compare study methodologies`;
    }

    if (page === "protocol") {
        return `I can help you refine your study protocol. Would you like suggestions for:\n\n• PICO criteria refinement\n• Search strategy optimization\n• Eligibility criteria\n• Quality assessment methods`;
    }

    return `I'm here to help with your systematic review. What would you like to know?`;
}
