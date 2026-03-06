"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { useProjectData } from "@/hooks/useProjectData";
import {
    createDefaultProtocolData,
    getProtocolSectionLabel,
    type PICOData,
    type ProtocolData,
    type ProtocolSection,
} from "@/types/protocol";
import type { ProtocolArtifactPatch, ProtocolSaveState } from "@/lib/protocol-live-sync";

type PendingProtocolPatch = {
    summary: string;
    queuedAtMs: number;
    patch: ProtocolArtifactPatch;
} | null;

type ProtocolContextValue = {
    protocol: ProtocolData;
    isDirty: boolean;
    activeSection: ProtocolSection;
    activeSectionLabel: string;
    saveState: ProtocolSaveState;
    saveError: string | null;
    pendingPatch: PendingProtocolPatch;
    setActiveSection: (section: ProtocolSection) => void;
    focusField: (section: ProtocolSection, fieldPath: string) => void;
    blurField: (fieldPath: string) => void;
    applyPendingPatch: () => void;
    keepLocalEdits: () => void;
    updatePICO: (field: keyof PICOData, value: string) => void;
    setPICO: (pico: PICOData) => void;
    addInclusion: (criterion: string) => void;
    removeInclusion: (index: number) => void;
    updateInclusion: (index: number, value: string) => void;
    addExclusion: (criterion: string) => void;
    removeExclusion: (index: number) => void;
    updateExclusion: (index: number, value: string) => void;
    updateSearchQuery: (query: string) => void;
    addDatabase: (database: string) => void;
    removeDatabase: (index: number) => void;
    addStudyDesign: (design: string) => void;
    removeStudyDesign: (index: number) => void;
    updateTimeFrameStart: (value: string) => void;
    updateTimeFrameEnd: (value: string) => void;
    updateQualityTool: (value: string) => void;
    updateQualityNotes: (value: string) => void;
    updateResearchQuestion: (value: string) => void;
    resetProtocol: () => void;
};

const ProtocolContext = createContext<ProtocolContextValue | undefined>(undefined);

type ProtocolProviderProps = {
    projectId: string;
    initialData?: ProtocolData;
    children: ReactNode;
};

export function ProtocolProvider({ children }: ProtocolProviderProps) {
    const {
        protocol: protocolSlice,
        updateProtocol,
        flushProtocolSave,
        setProtocolFocusedField,
        setProtocolFieldDirty,
        applyPendingProtocolPatch,
        keepLocalProtocolEdits,
    } = useProjectData();
    const [activeSection, setActiveSection] = useState<ProtocolSection>(null);

    const protocol = protocolSlice.data ?? createDefaultProtocolData();

    const focusField = useCallback((section: ProtocolSection, fieldPath: string) => {
        setActiveSection(section);
        setProtocolFocusedField(fieldPath);
        setProtocolFieldDirty(fieldPath, true);
    }, [setProtocolFieldDirty, setProtocolFocusedField]);

    const blurField = useCallback((fieldPath: string) => {
        setProtocolFieldDirty(fieldPath, false);
        setProtocolFocusedField(null);
        void flushProtocolSave();
    }, [flushProtocolSave, setProtocolFieldDirty, setProtocolFocusedField]);

    const updateResearchQuestion = useCallback((value: string) => {
        updateProtocol((prev) => ({ ...prev, researchQuestion: value }), {
            dirtyPaths: ["researchQuestion"],
        });
    }, [updateProtocol]);

    const updatePICO = useCallback((field: keyof PICOData, value: string) => {
        updateProtocol((prev) => ({
            ...prev,
            pico: { ...prev.pico, [field]: value },
        }), {
            dirtyPaths: [`pico.${field}`],
        });
    }, [updateProtocol]);

    const setPICO = useCallback((pico: PICOData) => {
        updateProtocol((prev) => ({ ...prev, pico }), {
            dirtyPaths: [
                "pico.population",
                "pico.intervention",
                "pico.comparison",
                "pico.outcome",
            ],
        });
    }, [updateProtocol]);

    const addInclusion = useCallback((criterion: string) => {
        const trimmed = criterion.trim();
        if (!trimmed) return;
        updateProtocol((prev) => ({
            ...prev,
            eligibility: {
                ...prev.eligibility,
                inclusion: [...prev.eligibility.inclusion, trimmed],
            },
        }), {
            dirtyPaths: ["eligibility.inclusion"],
        });
    }, [updateProtocol]);

    const removeInclusion = useCallback((index: number) => {
        updateProtocol((prev) => ({
            ...prev,
            eligibility: {
                ...prev.eligibility,
                inclusion: prev.eligibility.inclusion.filter((_, itemIndex) => itemIndex !== index),
            },
        }), {
            dirtyPaths: ["eligibility.inclusion"],
        });
    }, [updateProtocol]);

    const updateInclusion = useCallback((index: number, value: string) => {
        updateProtocol((prev) => ({
            ...prev,
            eligibility: {
                ...prev.eligibility,
                inclusion: prev.eligibility.inclusion.map((item, itemIndex) =>
                    itemIndex === index ? value : item
                ),
            },
        }), {
            dirtyPaths: ["eligibility.inclusion"],
        });
    }, [updateProtocol]);

    const addExclusion = useCallback((criterion: string) => {
        const trimmed = criterion.trim();
        if (!trimmed) return;
        updateProtocol((prev) => ({
            ...prev,
            eligibility: {
                ...prev.eligibility,
                exclusion: [...prev.eligibility.exclusion, trimmed],
            },
        }), {
            dirtyPaths: ["eligibility.exclusion"],
        });
    }, [updateProtocol]);

    const removeExclusion = useCallback((index: number) => {
        updateProtocol((prev) => ({
            ...prev,
            eligibility: {
                ...prev.eligibility,
                exclusion: prev.eligibility.exclusion.filter((_, itemIndex) => itemIndex !== index),
            },
        }), {
            dirtyPaths: ["eligibility.exclusion"],
        });
    }, [updateProtocol]);

    const updateExclusion = useCallback((index: number, value: string) => {
        updateProtocol((prev) => ({
            ...prev,
            eligibility: {
                ...prev.eligibility,
                exclusion: prev.eligibility.exclusion.map((item, itemIndex) =>
                    itemIndex === index ? value : item
                ),
            },
        }), {
            dirtyPaths: ["eligibility.exclusion"],
        });
    }, [updateProtocol]);

    const updateSearchQuery = useCallback((query: string) => {
        updateProtocol((prev) => ({
            ...prev,
            searchStrategy: { ...prev.searchStrategy, query },
        }), {
            dirtyPaths: ["searchStrategy.query"],
        });
    }, [updateProtocol]);

    const addDatabase = useCallback((database: string) => {
        const trimmed = database.trim();
        if (!trimmed) return;
        updateProtocol((prev) => ({
            ...prev,
            searchStrategy: {
                ...prev.searchStrategy,
                databases: [...prev.searchStrategy.databases, trimmed],
            },
        }), {
            dirtyPaths: ["searchStrategy.databases"],
        });
    }, [updateProtocol]);

    const removeDatabase = useCallback((index: number) => {
        updateProtocol((prev) => ({
            ...prev,
            searchStrategy: {
                ...prev.searchStrategy,
                databases: prev.searchStrategy.databases.filter((_, itemIndex) => itemIndex !== index),
            },
        }), {
            dirtyPaths: ["searchStrategy.databases"],
        });
    }, [updateProtocol]);

    const addStudyDesign = useCallback((design: string) => {
        const trimmed = design.trim();
        if (!trimmed) return;
        updateProtocol((prev) => ({
            ...prev,
            methodology: {
                ...prev.methodology,
                studyDesigns: [...prev.methodology.studyDesigns, trimmed],
            },
        }), {
            dirtyPaths: ["methodology.studyDesigns"],
        });
    }, [updateProtocol]);

    const removeStudyDesign = useCallback((index: number) => {
        updateProtocol((prev) => ({
            ...prev,
            methodology: {
                ...prev.methodology,
                studyDesigns: prev.methodology.studyDesigns.filter((_, itemIndex) => itemIndex !== index),
            },
        }), {
            dirtyPaths: ["methodology.studyDesigns"],
        });
    }, [updateProtocol]);

    const updateTimeFrameStart = useCallback((value: string) => {
        updateProtocol((prev) => ({
            ...prev,
            methodology: { ...prev.methodology, timeFrameStart: value },
        }), {
            dirtyPaths: ["methodology.timeFrameStart"],
        });
    }, [updateProtocol]);

    const updateTimeFrameEnd = useCallback((value: string) => {
        updateProtocol((prev) => ({
            ...prev,
            methodology: { ...prev.methodology, timeFrameEnd: value },
        }), {
            dirtyPaths: ["methodology.timeFrameEnd"],
        });
    }, [updateProtocol]);

    const updateQualityTool = useCallback((value: string) => {
        updateProtocol((prev) => ({
            ...prev,
            methodology: { ...prev.methodology, qualityAssessmentTool: value },
        }), {
            dirtyPaths: ["methodology.qualityAssessmentTool"],
        });
    }, [updateProtocol]);

    const updateQualityNotes = useCallback((value: string) => {
        updateProtocol((prev) => ({
            ...prev,
            methodology: { ...prev.methodology, qualityAssessmentNotes: value },
        }), {
            dirtyPaths: ["methodology.qualityAssessmentNotes"],
        });
    }, [updateProtocol]);

    const resetProtocol = useCallback(() => {
        updateProtocol(() => createDefaultProtocolData(), {
            dirtyPaths: [
                "researchQuestion",
                "pico.population",
                "pico.intervention",
                "pico.comparison",
                "pico.outcome",
                "eligibility.inclusion",
                "eligibility.exclusion",
                "searchStrategy.query",
                "searchStrategy.databases",
                "methodology.studyDesigns",
                "methodology.timeFrameStart",
                "methodology.timeFrameEnd",
                "methodology.qualityAssessmentTool",
                "methodology.qualityAssessmentNotes",
            ],
            flush: true,
        });
    }, [updateProtocol]);

    const activeSectionLabel = useMemo(
        () => getProtocolSectionLabel(activeSection),
        [activeSection]
    );

    const value = useMemo<ProtocolContextValue>(() => ({
        protocol,
        isDirty: protocolSlice.hasUnsyncedLocalChanges,
        activeSection,
        activeSectionLabel,
        saveState: protocolSlice.saveState,
        saveError: protocolSlice.saveError ?? protocolSlice.error,
        pendingPatch: protocolSlice.pendingPatch,
        setActiveSection,
        focusField,
        blurField,
        applyPendingPatch: applyPendingProtocolPatch,
        keepLocalEdits: keepLocalProtocolEdits,
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
        updateResearchQuestion,
        resetProtocol,
    }), [
        activeSection,
        activeSectionLabel,
        addDatabase,
        addExclusion,
        addInclusion,
        addStudyDesign,
        applyPendingProtocolPatch,
        blurField,
        focusField,
        keepLocalProtocolEdits,
        protocol,
        protocolSlice.error,
        protocolSlice.hasUnsyncedLocalChanges,
        protocolSlice.pendingPatch,
        protocolSlice.saveError,
        protocolSlice.saveState,
        removeDatabase,
        removeExclusion,
        removeInclusion,
        removeStudyDesign,
        resetProtocol,
        setPICO,
        updateExclusion,
        updateInclusion,
        updatePICO,
        updateQualityNotes,
        updateQualityTool,
        updateResearchQuestion,
        updateSearchQuery,
        updateTimeFrameEnd,
        updateTimeFrameStart,
    ]);

    return (
        <ProtocolContext.Provider value={value}>
            {children}
        </ProtocolContext.Provider>
    );
}

export function useProtocol() {
    const ctx = useContext(ProtocolContext);
    if (!ctx) {
        throw new Error("useProtocol must be used within ProtocolProvider");
    }
    return ctx;
}
