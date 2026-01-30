"use client";

/**
 * Protocol Context - Manages protocol state and active section tracking.
 * This context provides:
 * - Protocol data (PICO, eligibility, search strategy, methodology)
 * - Active section tracking for Copilot awareness
 * - Methods to update protocol sections
 * - Auto-save with debounce
 */

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
    ProtocolData,
    ProtocolSection,
    PICOData,
    createDefaultProtocolData,
    getProtocolSectionLabel,
} from "@/types/protocol";
import { getProtocolAction, saveProtocolAction } from "@/app/actions/protocols";

/** Context value shape */
type ProtocolContextValue = {
    /** Current protocol data */
    protocol: ProtocolData;
    /** Whether protocol has been modified from initial state */
    isDirty: boolean;
    /** Currently active/focused section */
    activeSection: ProtocolSection;
    /** Human-readable label for active section */
    activeSectionLabel: string;
    /** Set the active section (for Copilot awareness) */
    setActiveSection: (section: ProtocolSection) => void;
    /** Update a PICO field */
    updatePICO: (field: keyof PICOData, value: string) => void;
    /** Update the entire PICO object */
    setPICO: (pico: PICOData) => void;
    /** Add an inclusion criterion */
    addInclusion: (criterion: string) => void;
    /** Remove an inclusion criterion by index */
    removeInclusion: (index: number) => void;
    /** Update an inclusion criterion */
    updateInclusion: (index: number, value: string) => void;
    /** Add an exclusion criterion */
    addExclusion: (criterion: string) => void;
    /** Remove an exclusion criterion by index */
    removeExclusion: (index: number) => void;
    /** Update an exclusion criterion */
    updateExclusion: (index: number, value: string) => void;
    /** Update the search query */
    updateSearchQuery: (query: string) => void;
    /** Add a database */
    addDatabase: (database: string) => void;
    /** Remove a database by index */
    removeDatabase: (index: number) => void;
    /** Add a study design */
    addStudyDesign: (design: string) => void;
    /** Remove a study design by index */
    removeStudyDesign: (index: number) => void;
    /** Update time frame start */
    updateTimeFrameStart: (value: string) => void;
    /** Update time frame end */
    updateTimeFrameEnd: (value: string) => void;
    /** Update quality assessment tool */
    updateQualityTool: (value: string) => void;
    /** Update quality assessment notes */
    updateQualityNotes: (value: string) => void;
    /** Reset protocol to defaults */
    resetProtocol: () => void;
};

const ProtocolContext = createContext<ProtocolContextValue | undefined>(undefined);

type ProtocolProviderProps = {
    projectId: string;
    /** Optional initial data (e.g., mock data for demo projects) */
    initialData?: ProtocolData;
    children: ReactNode;
};

export function ProtocolProvider({ projectId, initialData, children }: ProtocolProviderProps) {
    // Load initial state from storage or use provided initial data
    const [protocol, setProtocol] = useState<ProtocolData>(createDefaultProtocolData());
    const [isMounted, setIsMounted] = useState(false);
    const [activeSection, setActiveSection] = useState<ProtocolSection>(null);
    const [isDirty, setIsDirty] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load state on mount
    useEffect(() => {
        let isActive = true;
        const load = async () => {
            if (initialData) {
                if (isActive) {
                    setProtocol(initialData);
                    setIsMounted(true);
                }
                return;
            }
            if (!projectId) {
                if (isActive) setIsMounted(true);
                return;
            }
            try {
                const remote = await getProtocolAction(projectId);
                if (isActive && remote) {
                    setProtocol(remote);
                }
            } catch (err) {
                console.error("Failed to load protocol from backend", err);
            } finally {
                if (isActive) setIsMounted(true);
            }
        };
        load();
        return () => {
            isActive = false;
        };
    }, [projectId, initialData]);

    // Save with debounce
    const scheduleSave = useCallback(
        (data: ProtocolData) => {
            if (!projectId) return;
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            saveTimerRef.current = setTimeout(() => {
                saveProtocolAction(projectId, data).catch((err) => {
                    console.error("Failed to save protocol to backend", err);
                });
            }, 500);
        },
        [projectId]
    );

    // Update state and schedule save
    const updateProtocol = useCallback(
        (updater: (prev: ProtocolData) => ProtocolData) => {
            setProtocol((prev) => {
                const next = updater(prev);
                if (next === prev) return prev;
                setIsDirty(true);
                scheduleSave(next);
                return next;
            });
        },
        [scheduleSave]
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
        };
    }, []);

    // PICO updates
    const updatePICO = useCallback(
        (field: keyof PICOData, value: string) => {
            updateProtocol((prev) => ({
                ...prev,
                pico: { ...prev.pico, [field]: value },
            }));
        },
        [updateProtocol]
    );

    const setPICO = useCallback(
        (pico: PICOData) => {
            updateProtocol((prev) => ({ ...prev, pico }));
        },
        [updateProtocol]
    );

    // Inclusion criteria updates
    const addInclusion = useCallback(
        (criterion: string) => {
            const trimmed = criterion.trim();
            if (!trimmed) return;
            updateProtocol((prev) => ({
                ...prev,
                eligibility: {
                    ...prev.eligibility,
                    inclusion: [...prev.eligibility.inclusion, trimmed],
                },
            }));
        },
        [updateProtocol]
    );

    const removeInclusion = useCallback(
        (index: number) => {
            updateProtocol((prev) => ({
                ...prev,
                eligibility: {
                    ...prev.eligibility,
                    inclusion: prev.eligibility.inclusion.filter((_, i) => i !== index),
                },
            }));
        },
        [updateProtocol]
    );

    const updateInclusion = useCallback(
        (index: number, value: string) => {
            updateProtocol((prev) => ({
                ...prev,
                eligibility: {
                    ...prev.eligibility,
                    inclusion: prev.eligibility.inclusion.map((item, i) =>
                        i === index ? value : item
                    ),
                },
            }));
        },
        [updateProtocol]
    );

    // Exclusion criteria updates
    const addExclusion = useCallback(
        (criterion: string) => {
            const trimmed = criterion.trim();
            if (!trimmed) return;
            updateProtocol((prev) => ({
                ...prev,
                eligibility: {
                    ...prev.eligibility,
                    exclusion: [...prev.eligibility.exclusion, trimmed],
                },
            }));
        },
        [updateProtocol]
    );

    const removeExclusion = useCallback(
        (index: number) => {
            updateProtocol((prev) => ({
                ...prev,
                eligibility: {
                    ...prev.eligibility,
                    exclusion: prev.eligibility.exclusion.filter((_, i) => i !== index),
                },
            }));
        },
        [updateProtocol]
    );

    const updateExclusion = useCallback(
        (index: number, value: string) => {
            updateProtocol((prev) => ({
                ...prev,
                eligibility: {
                    ...prev.eligibility,
                    exclusion: prev.eligibility.exclusion.map((item, i) =>
                        i === index ? value : item
                    ),
                },
            }));
        },
        [updateProtocol]
    );

    // Search strategy updates
    const updateSearchQuery = useCallback(
        (query: string) => {
            updateProtocol((prev) => ({
                ...prev,
                searchStrategy: { ...prev.searchStrategy, query },
            }));
        },
        [updateProtocol]
    );

    const addDatabase = useCallback(
        (database: string) => {
            const trimmed = database.trim();
            if (!trimmed) return;
            updateProtocol((prev) => {
                // Avoid duplicates
                if (prev.searchStrategy.databases.includes(trimmed)) return prev;
                return {
                    ...prev,
                    searchStrategy: {
                        ...prev.searchStrategy,
                        databases: [...prev.searchStrategy.databases, trimmed],
                    },
                };
            });
        },
        [updateProtocol]
    );

    const removeDatabase = useCallback(
        (index: number) => {
            updateProtocol((prev) => ({
                ...prev,
                searchStrategy: {
                    ...prev.searchStrategy,
                    databases: prev.searchStrategy.databases.filter((_, i) => i !== index),
                },
            }));
        },
        [updateProtocol]
    );

    // Methodology updates
    const addStudyDesign = useCallback(
        (design: string) => {
            const trimmed = design.trim();
            if (!trimmed) return;
            updateProtocol((prev) => {
                if (prev.methodology.studyDesigns.includes(trimmed)) return prev;
                return {
                    ...prev,
                    methodology: {
                        ...prev.methodology,
                        studyDesigns: [...prev.methodology.studyDesigns, trimmed],
                    },
                };
            });
        },
        [updateProtocol]
    );

    const removeStudyDesign = useCallback(
        (index: number) => {
            updateProtocol((prev) => ({
                ...prev,
                methodology: {
                    ...prev.methodology,
                    studyDesigns: prev.methodology.studyDesigns.filter((_, i) => i !== index),
                },
            }));
        },
        [updateProtocol]
    );

    const updateTimeFrameStart = useCallback(
        (value: string) => {
            updateProtocol((prev) => ({
                ...prev,
                methodology: { ...prev.methodology, timeFrameStart: value },
            }));
        },
        [updateProtocol]
    );

    const updateTimeFrameEnd = useCallback(
        (value: string) => {
            updateProtocol((prev) => ({
                ...prev,
                methodology: { ...prev.methodology, timeFrameEnd: value },
            }));
        },
        [updateProtocol]
    );

    const updateQualityTool = useCallback(
        (value: string) => {
            updateProtocol((prev) => ({
                ...prev,
                methodology: { ...prev.methodology, qualityAssessmentTool: value },
            }));
        },
        [updateProtocol]
    );

    const updateQualityNotes = useCallback(
        (value: string) => {
            updateProtocol((prev) => ({
                ...prev,
                methodology: { ...prev.methodology, qualityAssessmentNotes: value },
            }));
        },
        [updateProtocol]
    );

    // Reset
    const resetProtocol = useCallback(() => {
        const defaults = createDefaultProtocolData();
        setProtocol(defaults);
        setIsDirty(false);
        if (projectId) {
            saveProtocolAction(projectId, defaults).catch((err) => {
                console.error("Failed to reset protocol in backend", err);
            });
        }
    }, [projectId]);

    // Active section label
    const activeSectionLabel = useMemo(
        () => getProtocolSectionLabel(activeSection),
        [activeSection]
    );

    const value = useMemo(
        () => ({
            protocol,
            isDirty,
            activeSection,
            activeSectionLabel,
            setActiveSection,
            updatePICO,
            setPICO,
            addInclusion,
            removeInclusion,
            updateInclusion,
            addExclusion,
            removeExclusion,
            updateExclusion,
            updateSearchQuery,
            addDatabase,
            removeDatabase,
            addStudyDesign,
            removeStudyDesign,
            updateTimeFrameStart,
            updateTimeFrameEnd,
            updateQualityTool,
            updateQualityNotes,
            resetProtocol,
        }),
        [
            protocol,
            isDirty,
            activeSection,
            activeSectionLabel,
            updatePICO,
            setPICO,
            addInclusion,
            removeInclusion,
            updateInclusion,
            addExclusion,
            removeExclusion,
            updateExclusion,
            updateSearchQuery,
            addDatabase,
            removeDatabase,
            addStudyDesign,
            removeStudyDesign,
            updateTimeFrameStart,
            updateTimeFrameEnd,
            updateQualityTool,
            updateQualityNotes,
            resetProtocol,
        ]
    );

    if (!isMounted) {
        return null;
    }

    return (
        <ProtocolContext.Provider value={value}>
            {children}
        </ProtocolContext.Provider>
    );
}

/** Hook to access protocol context */
export function useProtocol() {
    const ctx = useContext(ProtocolContext);
    if (!ctx) {
        throw new Error("useProtocol must be used within ProtocolProvider");
    }
    return ctx;
}
