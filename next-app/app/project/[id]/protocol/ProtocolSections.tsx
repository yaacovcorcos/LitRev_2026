"use client";

import { useCallback, useMemo, useState } from "react";
import { useProtocol } from "@/contexts/ProtocolContext";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { EditableText } from "@/components/EditableText";
import { EditableTextArea } from "@/components/EditableTextArea";
import { EditableList } from "@/components/EditableList";
import { EditableChips } from "@/components/EditableChips";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import { AIActionButton } from "@/components/ui/AIActionButton";
import { isAIActionButtonEnabled, isAutofillModeEnabled, isProposeModeEnabled } from "@/lib/ai/popup-feature-flags";
import { decomposePicoAction, generateCriteriaAction, previewStrategyAction, suggestQuestionsAction } from "@/app/actions/onboarding";
import type { ProtocolSection } from "@/types/protocol";
import styles from "./protocol.module.css";

type Props = { projectId: string };

type ProposalItem = {
    id: string;
    label: string;
    field: string;
    value: string | string[];
};

type ProposalState = {
    section: string;
    items: ProposalItem[];
    index: number;
};

export function ProtocolSections({ projectId }: Props) {
    const {
        protocol,
        activeSection,
        setActiveSection,
        updatePICO,
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
        applyFieldUpdate,
    } = useProtocol();

    const { openPopupChat } = usePopupChat();
    const [proposalState, setProposalState] = useState<ProposalState | null>(null);
    const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
    const [undoSnapshot, setUndoSnapshot] = useState<Array<{ field: string; value: string | string[] }> | null>(null);

    const aiActionsEnabled = isAIActionButtonEnabled();
    const proposeEnabled = isProposeModeEnabled();
    const autofillEnabled = isAutofillModeEnabled();

    const openProtocolPopup = useCallback((section: string, sectionKey: string | undefined, currentContent: string) => {
        openPopupChat({
            type: "protocol_section",
            projectId,
            section,
            sectionKey,
            currentContent,
        });
    }, [openPopupChat, projectId]);

    const startProposalFlow = useCallback(async (section: "research" | "pico" | "criteria" | "search") => {
        if (!proposeEnabled) return;
        setIsGeneratingProposal(true);
        try {
            if (section === "research") {
                const result = await suggestQuestionsAction(protocol.researchQuestion || "");
                if (!result.success || !result.data?.candidates?.length) return;
                const candidate = result.data.candidates[1] ?? result.data.candidates[0];
                setProposalState({
                    section,
                    index: 0,
                    items: [{
                        id: crypto.randomUUID(),
                        label: "Research Question",
                        field: "researchQuestion",
                        value: candidate.question,
                    }],
                });
                return;
            }

            if (section === "pico") {
                const result = await decomposePicoAction(protocol.researchQuestion, "");
                if (!result.success || !result.data?.pico) return;
                setProposalState({
                    section,
                    index: 0,
                    items: [
                        { id: crypto.randomUUID(), label: "Population", field: "pico.population", value: result.data.pico.population },
                        { id: crypto.randomUUID(), label: "Intervention", field: "pico.intervention", value: result.data.pico.intervention },
                        { id: crypto.randomUUID(), label: "Comparison", field: "pico.comparison", value: result.data.pico.comparison },
                        { id: crypto.randomUUID(), label: "Outcome", field: "pico.outcome", value: result.data.pico.outcome },
                    ],
                });
                return;
            }

            if (section === "criteria") {
                const result = await generateCriteriaAction(protocol.researchQuestion, protocol.pico);
                if (!result.success || !result.data) return;
                setProposalState({
                    section,
                    index: 0,
                    items: [
                        {
                            id: crypto.randomUUID(),
                            label: "Inclusion Criteria",
                            field: "eligibility.inclusion",
                            value: result.data.inclusion.map((item) => item.text).filter(Boolean),
                        },
                        {
                            id: crypto.randomUUID(),
                            label: "Exclusion Criteria",
                            field: "eligibility.exclusion",
                            value: result.data.exclusion.map((item) => item.text).filter(Boolean),
                        },
                    ],
                });
                return;
            }

            if (section === "search") {
                const result = await previewStrategyAction(protocol.researchQuestion, protocol.pico, protocol.eligibility);
                if (!result.success || !result.data?.variants?.length) return;
                const balanced = result.data.variants.find((variant) => variant.mode === "balanced") ?? result.data.variants[0];
                setProposalState({
                    section,
                    index: 0,
                    items: [
                        { id: crypto.randomUUID(), label: "Search Query", field: "searchStrategy.query", value: balanced.query },
                        { id: crypto.randomUUID(), label: "Databases", field: "searchStrategy.databases", value: balanced.databases },
                    ],
                });
            }
        } finally {
            setIsGeneratingProposal(false);
        }
    }, [proposeEnabled, protocol.eligibility, protocol.pico, protocol.researchQuestion]);

    const applyProposalItem = useCallback((item: ProposalItem) => {
        applyFieldUpdate(item.field, item.value);
    }, [applyFieldUpdate]);

    const runAutofill = useCallback(async (section: "research" | "pico" | "criteria" | "search") => {
        if (!autofillEnabled) return;
        const snapshot: Array<{ field: string; value: string | string[] }> = [];
        if (section === "research") {
            snapshot.push({ field: "researchQuestion", value: protocol.researchQuestion });
        }
        if (section === "pico") {
            snapshot.push(
                { field: "pico.population", value: protocol.pico.population },
                { field: "pico.intervention", value: protocol.pico.intervention },
                { field: "pico.comparison", value: protocol.pico.comparison },
                { field: "pico.outcome", value: protocol.pico.outcome },
            );
        }
        if (section === "criteria") {
            snapshot.push(
                { field: "eligibility.inclusion", value: protocol.eligibility.inclusion },
                { field: "eligibility.exclusion", value: protocol.eligibility.exclusion },
            );
        }
        if (section === "search") {
            snapshot.push(
                { field: "searchStrategy.query", value: protocol.searchStrategy.query },
                { field: "searchStrategy.databases", value: protocol.searchStrategy.databases },
            );
        }

        const hasExistingData = snapshot.some((item) => Array.isArray(item.value)
            ? item.value.length > 0
            : item.value.trim().length > 0);
        if (hasExistingData) {
            const confirmed = window.confirm("Auto-fill will replace existing values in this section. You can undo immediately after applying. Continue?");
            if (!confirmed) return;
        }

        setUndoSnapshot(snapshot);

        if (section === "research") {
            const result = await suggestQuestionsAction(protocol.researchQuestion || "");
            if (result.success && result.data?.candidates?.length) {
                const candidate = result.data.candidates[1] ?? result.data.candidates[0];
                applyFieldUpdate("researchQuestion", candidate.question);
            }
            return;
        }

        if (section === "pico") {
            const result = await decomposePicoAction(protocol.researchQuestion, "");
            if (result.success && result.data?.pico) {
                applyFieldUpdate("pico.population", result.data.pico.population);
                applyFieldUpdate("pico.intervention", result.data.pico.intervention);
                applyFieldUpdate("pico.comparison", result.data.pico.comparison);
                applyFieldUpdate("pico.outcome", result.data.pico.outcome);
            }
            return;
        }

        if (section === "criteria") {
            const result = await generateCriteriaAction(protocol.researchQuestion, protocol.pico);
            if (result.success && result.data) {
                applyFieldUpdate("eligibility.inclusion", result.data.inclusion.map((item) => item.text).filter(Boolean));
                applyFieldUpdate("eligibility.exclusion", result.data.exclusion.map((item) => item.text).filter(Boolean));
            }
            return;
        }

        if (section === "search") {
            const result = await previewStrategyAction(protocol.researchQuestion, protocol.pico, protocol.eligibility);
            if (result.success && result.data?.variants?.length) {
                const balanced = result.data.variants.find((variant) => variant.mode === "balanced") ?? result.data.variants[0];
                applyFieldUpdate("searchStrategy.query", balanced.query);
                applyFieldUpdate("searchStrategy.databases", balanced.databases);
            }
        }
    }, [autofillEnabled, applyFieldUpdate, protocol.eligibility, protocol.pico, protocol.researchQuestion, protocol.searchStrategy.databases, protocol.searchStrategy.query]);

    const currentProposal = useMemo(() => {
        if (!proposalState) return null;
        return proposalState.items[proposalState.index] ?? null;
    }, [proposalState]);

    const createSectionHandlers = useCallback(
        (section: ProtocolSection) => ({
            onFocus: () => setActiveSection(section),
            onBlur: () => {
                setTimeout(() => {
                    // Small delay to allow focus to move to another field
                }, 100);
            },
        }),
        [setActiveSection],
    );

    return (
        <div className={styles.content}>
            {proposalState && currentProposal ? (
                <section className={styles.section} style={{ borderStyle: "dashed" }}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            <span className="material-icons-round">fact_check</span>
                            AI Proposal · {currentProposal.label}
                        </h2>
                    </div>
                    <div>
                        <p style={{ marginTop: 0 }}>
                            Item {proposalState.index + 1} of {proposalState.items.length}
                        </p>
                        <div style={{ border: "1px solid var(--color-border, #d0d7de)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                            {Array.isArray(currentProposal.value)
                                ? currentProposal.value.map((item) => <p key={item}>{item}</p>)
                                : <p>{currentProposal.value}</p>}
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => {
                                    setProposalState((prev) => {
                                        if (!prev) return prev;
                                        if (prev.index >= prev.items.length - 1) return null;
                                        return { ...prev, index: prev.index + 1 };
                                    });
                                }}
                            >
                                Reject / Skip
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => {
                                    const section = proposalState.section as "research" | "pico" | "criteria" | "search";
                                    void startProposalFlow(section);
                                }}
                            >
                                Regenerate
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => {
                                    applyProposalItem(currentProposal);
                                    setProposalState((prev) => {
                                        if (!prev) return prev;
                                        if (prev.index >= prev.items.length - 1) return null;
                                        return { ...prev, index: prev.index + 1 };
                                    });
                                }}
                            >
                                Accept
                            </button>
                        </div>
                    </div>
                </section>
            ) : null}

            {undoSnapshot ? (
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>
                            <span className="material-icons-round">history</span>
                            Auto-fill applied
                        </h2>
                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => {
                                for (const item of undoSnapshot) {
                                    applyFieldUpdate(item.field, item.value);
                                }
                                setUndoSnapshot(null);
                            }}
                        >
                            Undo
                        </button>
                    </div>
                </section>
            ) : null}

            {/* Research Question Section */}
            <section
                className={`${styles.section} ${activeSection === "research-question" ? styles.sectionActive : ""}`}
            >
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <span className="material-icons-round">help_outline</span>
                        Research Question
                    </h2>
                    {aiActionsEnabled ? (
                        <AIActionButton
                            disabled={isGeneratingProposal}
                            onAskAi={() => openProtocolPopup("Research Question", "research-question", protocol.researchQuestion || "")}
                            onPropose={() => void startProposalFlow("research")}
                            onAutofill={() => void runAutofill("research")}
                        />
                    ) : (
                        <button
                            type="button"
                            className={styles.askCopilotBtn}
                            onClick={() => openProtocolPopup("Research Question", "research-question", protocol.researchQuestion || "")}
                        >
                            <span className="material-icons-round">smart_toy</span>
                            Ask AI
                        </button>
                    )}
                </div>
                <EditableTextArea
                    value={protocol.researchQuestion ?? ""}
                    onChange={updateResearchQuestion}
                    placeholder="What is the primary question this systematic review aims to answer?"
                    isActive={activeSection === "research-question"}
                    {...createSectionHandlers("research-question")}
                    ariaLabel="Research question"
                    minHeight={60}
                />
            </section>

            {/* PICO Framework Section */}
            <section
                className={`${styles.section} ${activeSection?.startsWith("pico-") ? styles.sectionActive : ""}`}
            >
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <span className="material-icons-round">target</span>
                        PICO Framework
                    </h2>
                    {aiActionsEnabled ? (
                        <AIActionButton
                            disabled={isGeneratingProposal}
                            onAskAi={() => openProtocolPopup(
                                "PICO Framework",
                                "pico-framework",
                                `Population: ${protocol.pico.population}\nIntervention: ${protocol.pico.intervention}\nComparison: ${protocol.pico.comparison}\nOutcome: ${protocol.pico.outcome}`,
                            )}
                            onPropose={() => void startProposalFlow("pico")}
                            onAutofill={() => void runAutofill("pico")}
                        />
                    ) : (
                        <button
                            type="button"
                            className={styles.askCopilotBtn}
                            onClick={() => openProtocolPopup(
                                "PICO Framework",
                                "pico-framework",
                                `Population: ${protocol.pico.population}\nIntervention: ${protocol.pico.intervention}\nComparison: ${protocol.pico.comparison}\nOutcome: ${protocol.pico.outcome}`,
                            )}
                        >
                            <span className="material-icons-round">smart_toy</span>
                            Ask AI
                        </button>
                    )}
                </div>
                <div className={styles.picoGrid}>
                    <div className={styles.picoCard}>
                        <span className={styles.picoLabel}>Population</span>
                        <EditableText
                            value={protocol.pico.population}
                            onChange={(value) => updatePICO("population", value)}
                            placeholder="Define your target population..."
                            isActive={activeSection === "pico-population"}
                            {...createSectionHandlers("pico-population")}
                            ariaLabel="Population"
                        />
                    </div>
                    <div className={styles.picoCard}>
                        <span className={styles.picoLabel}>Intervention</span>
                        <EditableText
                            value={protocol.pico.intervention}
                            onChange={(value) => updatePICO("intervention", value)}
                            placeholder="Define the intervention..."
                            isActive={activeSection === "pico-intervention"}
                            {...createSectionHandlers("pico-intervention")}
                            ariaLabel="Intervention"
                        />
                    </div>
                    <div className={styles.picoCard}>
                        <span className={styles.picoLabel}>Comparison</span>
                        <EditableText
                            value={protocol.pico.comparison}
                            onChange={(value) => updatePICO("comparison", value)}
                            placeholder="Define the comparison..."
                            isActive={activeSection === "pico-comparison"}
                            {...createSectionHandlers("pico-comparison")}
                            ariaLabel="Comparison"
                        />
                    </div>
                    <div className={styles.picoCard}>
                        <span className={styles.picoLabel}>Outcome</span>
                        <EditableText
                            value={protocol.pico.outcome}
                            onChange={(value) => updatePICO("outcome", value)}
                            placeholder="Define the expected outcomes..."
                            isActive={activeSection === "pico-outcome"}
                            {...createSectionHandlers("pico-outcome")}
                            ariaLabel="Outcome"
                        />
                    </div>
                </div>
            </section>

            {/* Eligibility Criteria Section */}
            <section
                className={`${styles.section} ${activeSection?.startsWith("eligibility-") ? styles.sectionActive : ""}`}
            >
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <span className="material-icons-round">checklist</span>
                        Eligibility Criteria
                    </h2>
                    {aiActionsEnabled ? (
                        <AIActionButton
                            disabled={isGeneratingProposal}
                            onAskAi={() => openProtocolPopup(
                                "Eligibility Criteria",
                                "eligibility-criteria",
                                `Inclusion: ${protocol.eligibility.inclusion.join("; ")}\nExclusion: ${protocol.eligibility.exclusion.join("; ")}`,
                            )}
                            onPropose={() => void startProposalFlow("criteria")}
                            onAutofill={() => void runAutofill("criteria")}
                        />
                    ) : (
                        <button
                            type="button"
                            className={styles.askCopilotBtn}
                            onClick={() => openProtocolPopup(
                                "Eligibility Criteria",
                                "eligibility-criteria",
                                `Inclusion: ${protocol.eligibility.inclusion.join("; ")}\nExclusion: ${protocol.eligibility.exclusion.join("; ")}`,
                            )}
                        >
                            <span className="material-icons-round">smart_toy</span>
                            Ask AI
                        </button>
                    )}
                </div>
                <div className={styles.criteriaLists}>
                    <DemoGuideCard
                        projectId={projectId}
                        guideId="protocol-criteria"
                        text="Inclusion and exclusion criteria are the highest-leverage fields here. Exclusion decisions in the Ledger should map to a specific criterion."
                        className={styles.criteriaGuide}
                    />
                    <div className={styles.criteriaGroup}>
                        <h3 className={styles.criteriaHeading}>Inclusion</h3>
                        <EditableList
                            items={protocol.eligibility.inclusion}
                            onUpdate={updateInclusion}
                            onAdd={addInclusion}
                            onRemove={removeInclusion}
                            placeholder="Enter inclusion criterion..."
                            addLabel="Add inclusion criterion"
                            isActive={activeSection === "eligibility-inclusion"}
                            {...createSectionHandlers("eligibility-inclusion")}
                            ariaLabel="Inclusion criteria"
                        />
                    </div>
                    <div className={styles.criteriaGroup}>
                        <h3 className={styles.criteriaHeading}>Exclusion</h3>
                        <EditableList
                            items={protocol.eligibility.exclusion}
                            onUpdate={updateExclusion}
                            onAdd={addExclusion}
                            onRemove={removeExclusion}
                            placeholder="Enter exclusion criterion..."
                            addLabel="Add exclusion criterion"
                            isActive={activeSection === "eligibility-exclusion"}
                            {...createSectionHandlers("eligibility-exclusion")}
                            ariaLabel="Exclusion criteria"
                        />
                    </div>
                </div>
            </section>

            {/* Search Strategy Section */}
            <section
                className={`${styles.section} ${activeSection?.startsWith("search-") ? styles.sectionActive : ""}`}
            >
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <span className="material-icons-round">search</span>
                        Search Strategy
                    </h2>
                    {aiActionsEnabled ? (
                        <AIActionButton
                            disabled={isGeneratingProposal}
                            onAskAi={() => openProtocolPopup(
                                "Search Strategy",
                                "search-strategy",
                                `Query: ${protocol.searchStrategy.query}\nDatabases: ${protocol.searchStrategy.databases.join(", ")}`,
                            )}
                            onPropose={() => void startProposalFlow("search")}
                            onAutofill={() => void runAutofill("search")}
                        />
                    ) : (
                        <button
                            type="button"
                            className={styles.askCopilotBtn}
                            onClick={() => openProtocolPopup(
                                "Search Strategy",
                                "search-strategy",
                                `Query: ${protocol.searchStrategy.query}\nDatabases: ${protocol.searchStrategy.databases.join(", ")}`,
                            )}
                        >
                            <span className="material-icons-round">smart_toy</span>
                            Ask AI
                        </button>
                    )}
                </div>
                <div className={styles.searchBox}>
                    <EditableTextArea
                        value={protocol.searchStrategy.query}
                        onChange={updateSearchQuery}
                        placeholder="Enter your search query using Boolean operators..."
                        isActive={activeSection === "search-query"}
                        {...createSectionHandlers("search-query")}
                        ariaLabel="Search query"
                        monospace
                        minHeight={80}
                    />
                </div>
                <div className={styles.databaseSection}>
                    <span className={styles.databaseLabel}>Databases</span>
                    <EditableChips
                        items={protocol.searchStrategy.databases}
                        onAdd={addDatabase}
                        onRemove={removeDatabase}
                        addLabel="Add database"
                        placeholder="Database name..."
                        isActive={activeSection === "search-databases"}
                        {...createSectionHandlers("search-databases")}
                        ariaLabel="Search databases"
                    />
                </div>
            </section>

            {/* Methodology Section */}
            <section
                className={`${styles.section} ${activeSection?.startsWith("methodology-") ? styles.sectionActive : ""}`}
            >
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <span className="material-icons-round">science</span>
                        Methodology
                    </h2>
                    <button
                        type="button"
                        className={styles.askCopilotBtn}
                        onClick={() => openProtocolPopup(
                            "Methodology",
                            "methodology",
                            `Study designs: ${protocol.methodology.studyDesigns.join(", ")}\nTime frame: ${protocol.methodology.timeFrameStart} - ${protocol.methodology.timeFrameEnd}\nQuality tool: ${protocol.methodology.qualityAssessmentTool}`,
                        )}
                    >
                        <span className="material-icons-round">smart_toy</span>
                        Ask AI
                    </button>
                </div>

                <div className={styles.methodologyGrid}>
                    {/* Study Designs */}
                    <div className={styles.methodologyCard}>
                        <span className={styles.methodologyLabel}>Study Designs</span>
                        <EditableChips
                            items={protocol.methodology.studyDesigns}
                            onAdd={addStudyDesign}
                            onRemove={removeStudyDesign}
                            addLabel="Add design"
                            placeholder="Study design type..."
                            isActive={activeSection === "methodology-designs"}
                            {...createSectionHandlers("methodology-designs")}
                            ariaLabel="Study design types"
                        />
                    </div>

                    {/* Time Frame */}
                    <div className={styles.methodologyCard}>
                        <span className={styles.methodologyLabel}>Publication Time Frame</span>
                        <div className={styles.timeFrameRow}>
                            <div className={styles.timeFrameField}>
                                <span className={styles.timeFrameLabel}>From</span>
                                <EditableText
                                    value={protocol.methodology.timeFrameStart}
                                    onChange={updateTimeFrameStart}
                                    placeholder="e.g., 2018"
                                    isActive={activeSection === "methodology-timeframe"}
                                    {...createSectionHandlers("methodology-timeframe")}
                                    ariaLabel="Time frame start year"
                                />
                            </div>
                            <span className={styles.timeFrameSeparator}>–</span>
                            <div className={styles.timeFrameField}>
                                <span className={styles.timeFrameLabel}>To</span>
                                <EditableText
                                    value={protocol.methodology.timeFrameEnd}
                                    onChange={updateTimeFrameEnd}
                                    placeholder="e.g., 2024"
                                    isActive={activeSection === "methodology-timeframe"}
                                    {...createSectionHandlers("methodology-timeframe")}
                                    ariaLabel="Time frame end year"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Quality Assessment */}
                    <div className={`${styles.methodologyCard} ${styles.methodologyCardFull}`}>
                        <span className={styles.methodologyLabel}>Quality Assessment Tool</span>
                        <EditableText
                            value={protocol.methodology.qualityAssessmentTool}
                            onChange={updateQualityTool}
                            placeholder="e.g., QUADAS-2, Cochrane RoB2, Newcastle-Ottawa Scale..."
                            isActive={activeSection === "methodology-quality"}
                            {...createSectionHandlers("methodology-quality")}
                            ariaLabel="Quality assessment tool"
                        />
                        <div className={styles.qualityNotes}>
                            <span className={styles.qualityNotesLabel}>Assessment Notes</span>
                            <EditableTextArea
                                value={protocol.methodology.qualityAssessmentNotes}
                                onChange={updateQualityNotes}
                                placeholder="Describe how quality/risk of bias will be assessed..."
                                isActive={activeSection === "methodology-quality"}
                                {...createSectionHandlers("methodology-quality")}
                                ariaLabel="Quality assessment notes"
                                minHeight={60}
                            />
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
