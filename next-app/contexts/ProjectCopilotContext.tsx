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
import { getProjectCopilotAction, saveProjectCopilotAction } from "@/app/actions/projectCopilot";

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
    const [state, setState] = useState<ProjectCopilotState>(createDefaultProjectCopilotState());
    const [isMounted, setIsMounted] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load state on mount
    useEffect(() => {
        let isActive = true;
        if (projectId) {
            const local = loadProjectCopilotState(projectId);
            setState(local);
            getProjectCopilotAction(projectId)
                .then((remote) => {
                    if (remote && isActive) {
                        setState(remote);
                    }
                })
                .catch((err) => {
                    console.error("Failed to load project copilot from backend", err);
                })
                .finally(() => {
                    if (isActive) setIsMounted(true);
                });
        } else {
            setIsMounted(true);
        }
        return () => {
            isActive = false;
        };
    }, [projectId]);

    // Save state with debounce
    const scheduleSave = useCallback(
        (next: ProjectCopilotState) => {
            if (!projectId) return;
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            saveTimerRef.current = setTimeout(() => {
                saveProjectCopilotState(projectId, next);
                saveProjectCopilotAction(projectId, next).catch((err) => {
                    console.error("Failed to save project copilot to backend", err);
                });
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

    if (!isMounted) {
        // Return a consistent skeleton or null to avoid hydration mismatch
        return null;
    }

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
        // Section-specific responses for Protocol page
        if (section === "pico-population") {
            if (lowerText.includes("refine") || lowerText.includes("help")) {
                return `Here are suggestions to refine your population definition:\n\n**Consider specifying:**\n• Age range (e.g., "adults aged 18-65")\n• Clinical setting (e.g., "hospitalized patients")\n• Disease stage (e.g., "newly diagnosed")\n• Geographic scope if relevant\n\n**Example refinement:**\n"Adults aged 18 years or older with histologically confirmed early-stage (I-II) solid tumors, diagnosed within the past 12 months"\n\nWould you like me to suggest a specific refinement based on your topic?`;
            }
            if (lowerText.includes("broaden")) {
                return `To broaden your population criteria, consider:\n\n• Expanding age range to include adolescents (≥12 years)\n• Including all tumor stages, not just early-stage\n• Adding "suspected" cases alongside confirmed diagnoses\n• Removing geographic restrictions\n\n**Suggested broader definition:**\n"Patients of any age with suspected or confirmed tumors undergoing diagnostic imaging"`;
            }
            if (lowerText.includes("narrow") || lowerText.includes("specific")) {
                return `To narrow your population criteria for higher precision:\n\n• Specify exact tumor types (e.g., "non-small cell lung cancer")\n• Add comorbidity exclusions\n• Limit to specific clinical settings\n• Define staging criteria precisely\n\n**Suggested narrower definition:**\n"Treatment-naïve adults (18-70 years) with histologically confirmed stage I-IIA non-small cell lung cancer, ECOG performance status 0-1"`;
            }
        }

        if (section === "pico-intervention") {
            if (lowerText.includes("suggest") || lowerText.includes("help")) {
                return `For your intervention definition, consider:\n\n**Key elements to specify:**\n• Technology/method name and version\n• Implementation setting\n• Operator requirements\n• Timing relative to standard care\n\n**Example:**\n"AI-assisted imaging analysis using FDA-cleared deep learning algorithms, performed as an adjunct to radiologist interpretation within 24 hours of image acquisition"`;
            }
        }

        if (section === "pico-comparison") {
            if (lowerText.includes("suggest") || lowerText.includes("help")) {
                return `For your comparison group, consider these options:\n\n**Common comparators:**\n• Standard of care / usual practice\n• No intervention (observation only)\n• Alternative technology\n• Historical controls\n\n**Example:**\n"Standard radiologist interpretation without AI assistance, using the same imaging protocols and reporting standards"`;
            }
        }

        if (section === "pico-outcome") {
            if (lowerText.includes("suggest") || lowerText.includes("help")) {
                return `Consider these outcome categories:\n\n**Primary outcomes:**\n• Diagnostic accuracy (sensitivity, specificity, AUC)\n• Time to diagnosis\n• Detection rate\n\n**Secondary outcomes:**\n• False positive/negative rates\n• Reader confidence scores\n• Workflow efficiency metrics\n• Cost-effectiveness\n\n**Example:**\n"Primary: Sensitivity and specificity for tumor detection. Secondary: Time from imaging to diagnosis, radiologist reading time, false positive rate"`;
            }
        }

        if (section === "eligibility-inclusion") {
            if (lowerText.includes("suggest") || lowerText.includes("add") || lowerText.includes("criteria")) {
                return `Consider adding these inclusion criteria:\n\n**Study design:**\n• Randomized controlled trials\n• Prospective cohort studies\n• Diagnostic accuracy studies\n\n**Reporting:**\n• Studies reporting sensitivity/specificity\n• Full-text available\n• Sufficient methodological detail\n\n**Suggested additions:**\n• "Studies with ≥50 participants"\n• "Studies using validated reference standards"\n• "Studies with independent outcome assessment"`;
            }
            if (lowerText.includes("prisma") || lowerText.includes("guideline")) {
                return `According to PRISMA-DTA guidelines for diagnostic accuracy reviews:\n\n**Required criteria:**\n✓ Clear definition of index test and reference standard\n✓ Consecutive or random patient sampling\n✓ Blinded interpretation of results\n✓ Reporting of 2x2 diagnostic accuracy data\n\nYour current criteria look good. Consider adding:\n• "Studies using STARD-compliant reporting"`;
            }
        }

        if (section === "eligibility-exclusion") {
            if (lowerText.includes("suggest") || lowerText.includes("add")) {
                return `Consider these exclusion criteria:\n\n**Study quality:**\n• Case reports or case series <10 patients\n• Studies with >20% missing outcome data\n• Studies without clearly defined reference standard\n\n**Design limitations:**\n• Retrospective chart reviews without validation\n• Studies with obvious selection bias\n• Duplicate publications\n\n**Suggested additions:**\n• "Studies with partial verification bias"\n• "Studies without adequate follow-up"`;
            }
        }

        if (section === "search-query") {
            if (lowerText.includes("optimize") || lowerText.includes("improve")) {
                return `Here are optimizations for your search query:\n\n**Add MeSH terms:**\n• "Artificial Intelligence"[MeSH]\n• "Deep Learning"[MeSH]\n• "Diagnostic Imaging"[MeSH]\n\n**Expand synonyms:**\n• Add: "neural network*" OR "CNN" OR "convolutional"\n• Add: "radiograph*" OR "X-ray" OR "computed tomograph*"\n\n**Suggested optimized query:**\n\`\`\`\n("artificial intelligence"[MeSH] OR "deep learning"[MeSH] OR "machine learning" OR "neural network*") \nAND \n("diagnostic imaging"[MeSH] OR "radiology" OR "CT" OR "MRI" OR "radiograph*")\nAND \n("neoplasms"[MeSH] OR "tumor*" OR "cancer" OR "malignancy")\n\`\`\``;
            }
            if (lowerText.includes("mesh") || lowerText.includes("term")) {
                return `Relevant MeSH terms for your topic:\n\n**AI/Technology:**\n• Artificial Intelligence [MeSH]\n• Machine Learning [MeSH]\n• Deep Learning [MeSH]\n• Neural Networks, Computer [MeSH]\n\n**Imaging:**\n• Diagnostic Imaging [MeSH]\n• Tomography, X-Ray Computed [MeSH]\n• Magnetic Resonance Imaging [MeSH]\n\n**Oncology:**\n• Neoplasms [MeSH]\n• Early Detection of Cancer [MeSH]\n\nWould you like me to construct a complete PubMed-ready query with these terms?`;
            }
            if (lowerText.includes("boolean") || lowerText.includes("operator")) {
                return `Boolean operator review for your query:\n\n**Current structure looks good!** Tips:\n\n✓ Use AND between concept groups\n✓ Use OR within concept groups for synonyms\n✓ Use quotation marks for exact phrases\n✓ Use asterisk (*) for truncation\n\n**Suggestions:**\n• Add proximity operators if database supports (e.g., NEAR/3)\n• Consider field tags (e.g., [tiab] for title/abstract)\n• Test sensitivity vs. specificity tradeoff`;
            }
        }

        if (section === "search-databases") {
            if (lowerText.includes("suggest") || lowerText.includes("database") || lowerText.includes("source")) {
                return `Recommended databases for your systematic review:\n\n**Essential:**\n• PubMed/MEDLINE\n• Embase\n• Cochrane CENTRAL\n\n**For comprehensive coverage:**\n• Web of Science\n• Scopus\n• IEEE Xplore (for AI/technical studies)\n\n**Grey literature:**\n• ClinicalTrials.gov\n• WHO ICTRP\n• Conference proceedings (RSNA, MICCAI)\n• Preprint servers (medRxiv, arXiv)\n\nPRISMA recommends searching at least 2-3 databases.`;
            }
            if (lowerText.includes("grey") || lowerText.includes("gray")) {
                return `Grey literature sources to consider:\n\n**Trial registries:**\n• ClinicalTrials.gov\n• WHO ICTRP\n• EU Clinical Trials Register\n\n**Preprints:**\n• medRxiv\n• arXiv (cs.CV, eess.IV)\n\n**Regulatory:**\n• FDA 510(k) database\n• CE marking databases\n\n**Conference proceedings:**\n• RSNA\n• MICCAI\n• SPIE Medical Imaging`;
            }
        }

        // Default protocol response
        return `I can help you refine your study protocol. Based on your current section (${section || "Protocol"}), I can:\n\n• Suggest refinements or additions\n• Check alignment with PRISMA guidelines\n• Provide examples from similar reviews\n• Help optimize your search strategy\n\nWhat would you like help with?`;
    }

    return `I'm here to help with your systematic review. What would you like to know?`;
}
