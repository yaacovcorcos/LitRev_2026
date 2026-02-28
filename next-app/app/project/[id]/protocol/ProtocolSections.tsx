"use client";

import { useCallback } from "react";
import { useProtocol } from "@/contexts/ProtocolContext";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { EditableText } from "@/components/EditableText";
import { EditableTextArea } from "@/components/EditableTextArea";
import { EditableList } from "@/components/EditableList";
import { EditableChips } from "@/components/EditableChips";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import type { ProtocolSection } from "@/types/protocol";
import styles from "./protocol.module.css";

type Props = { projectId: string };

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
    } = useProtocol();

    const { openPopupChat } = usePopupChat();

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
            {/* Research Question Section */}
            <section
                className={`${styles.section} ${activeSection === "research-question" ? styles.sectionActive : ""}`}
            >
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>
                        <span className="material-icons-round">help_outline</span>
                        Research Question
                    </h2>
                    <button
                        type="button"
                        className={styles.askCopilotBtn}
                        onClick={() => openPopupChat({
                            type: "protocol_section",
                            section: "Research Question",
                            currentContent: protocol.researchQuestion || "",
                        })}
                    >
                        <span className="material-icons-round">smart_toy</span>
                        Ask AI
                    </button>
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
                    <button
                        type="button"
                        className={styles.askCopilotBtn}
                        onClick={() => openPopupChat({
                            type: "protocol_section",
                            section: "PICO Framework",
                            currentContent: `Population: ${protocol.pico.population}\nIntervention: ${protocol.pico.intervention}\nComparison: ${protocol.pico.comparison}\nOutcome: ${protocol.pico.outcome}`,
                        })}
                    >
                        <span className="material-icons-round">smart_toy</span>
                        Ask AI
                    </button>
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
                    <button
                        type="button"
                        className={styles.askCopilotBtn}
                        onClick={() => openPopupChat({
                            type: "protocol_section",
                            section: "Eligibility Criteria",
                            currentContent: `Inclusion: ${protocol.eligibility.inclusion.join("; ")}\nExclusion: ${protocol.eligibility.exclusion.join("; ")}`,
                        })}
                    >
                        <span className="material-icons-round">smart_toy</span>
                        Ask AI
                    </button>
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
                    <button
                        type="button"
                        className={styles.askCopilotBtn}
                        onClick={() => openPopupChat({
                            type: "protocol_section",
                            section: "Search Strategy",
                            currentContent: `Query: ${protocol.searchStrategy.query}\nDatabases: ${protocol.searchStrategy.databases.join(", ")}`,
                        })}
                    >
                        <span className="material-icons-round">smart_toy</span>
                        Ask AI
                    </button>
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
                        onClick={() => openPopupChat({
                            type: "protocol_section",
                            section: "Methodology",
                            currentContent: `Study designs: ${protocol.methodology.studyDesigns.join(", ")}\nTime frame: ${protocol.methodology.timeFrameStart} - ${protocol.methodology.timeFrameEnd}\nQuality tool: ${protocol.methodology.qualityAssessmentTool}`,
                        })}
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
