"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useProjects } from "@/contexts/ProjectsContext";
import { useLedger } from "@/contexts/LedgerContext";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import Link from "next/link";
import { BaseBackButton } from "@/components/BaseBackButton";
import styles from "./protocol.module.css";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { ProjectPageLayout } from "@/components/project/ProjectPageLayout";
import { ProtocolProvider, useProtocol } from "@/contexts/ProtocolContext";
import { EditableText } from "@/components/EditableText";
import { EditableTextArea } from "@/components/EditableTextArea";
import { EditableList } from "@/components/EditableList";
import { EditableChips } from "@/components/EditableChips";
import { ProtocolSection } from "@/types/protocol";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { calculatePRISMACounts } from "@/lib/criteriaMatching";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import { buildProtocolMarkdown, getProtocolSuggestions } from "./protocolExport";


/** Inner component that uses the ProtocolContext */
function ProtocolPageContent() {
    const { id } = useParams<{ id: string }>();
    const { getProjectById } = useProjects();
    const { isEmbeddedInProjectShell } = useProjectShell();
    const { sendMessage, setCollapsed } = useProjectCopilot();
    const { openPopupChat } = usePopupChat();
    const {
        protocol,
        activeSection,
        activeSectionLabel,
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

    const project = id ? getProjectById(id) : undefined;

    // Get studies from ledger for PRISMA counts
    const { getStudiesByProject } = useLedger();
    const studies = useMemo(() => (id ? getStudiesByProject(id) : []), [id, getStudiesByProject]);

    // Calculate PRISMA flow counts
    const prismaCounts = useMemo(
        () => calculatePRISMACounts(studies, protocol),
        [studies, protocol]
    );

    // Handle inserting Copilot suggestions into the active field
    const handleInsert = useCallback((text: string) => {
        if (!activeSection) return;

        // Extract insertable content from the AI response
        // Look for content in quotes or after "Example:" or "Suggested:"
        let insertText = text;

        // Try to find quoted suggestions
        const quotedMatch = text.match(/"([^"]+)"/);
        if (quotedMatch) {
            insertText = quotedMatch[1];
        } else {
            // Try to find content after "Example:" or "Suggested:"
            const exampleMatch = text.match(/(?:Example|Suggested)[^:]*:\s*\n?"?([^"\n]+)"?/i);
            if (exampleMatch) {
                insertText = exampleMatch[1].trim();
            }
        }

        // Insert based on active section
        if (activeSection === "research-question") {
            updateResearchQuestion(insertText);
            return;
        }
        if (activeSection.startsWith("pico-")) {
            const field = activeSection.replace("pico-", "") as keyof typeof protocol.pico;
            if (field in protocol.pico) {
                updatePICO(field, insertText);
            }
        } else if (activeSection === "eligibility-inclusion") {
            addInclusion(insertText);
        } else if (activeSection === "eligibility-exclusion") {
            addExclusion(insertText);
        } else if (activeSection === "search-query") {
            // For search query, append or replace depending on content
            if (protocol.searchStrategy.query) {
                updateSearchQuery(protocol.searchStrategy.query + "\n" + insertText);
            } else {
                updateSearchQuery(insertText);
            }
        } else if (activeSection === "search-databases") {
            addDatabase(insertText);
        }
    }, [activeSection, protocol, updatePICO, addInclusion, addExclusion, updateSearchQuery, addDatabase, updateResearchQuestion]);

    // Handle quick action button clicks - opens copilot and sends a prompt
    const handleQuickAction = useCallback((prompt: string, section: ProtocolSection) => {
        setActiveSection(section);
        setCollapsed(false);
        sendMessage(prompt, "protocol", section ?? undefined);
    }, [setActiveSection, setCollapsed, sendMessage]);

    // Calculate protocol completeness
    const completeness = useMemo(() => {
        const checks = [
            // Research question
            { name: "Research question", complete: !!protocol.researchQuestion?.trim(), section: "research-question" },
            // PICO fields
            { name: "Population", complete: !!protocol.pico.population.trim(), section: "pico" },
            { name: "Intervention", complete: !!protocol.pico.intervention.trim(), section: "pico" },
            { name: "Comparison", complete: !!protocol.pico.comparison.trim(), section: "pico" },
            { name: "Outcome", complete: !!protocol.pico.outcome.trim(), section: "pico" },
            // Eligibility
            { name: "Inclusion criteria", complete: protocol.eligibility.inclusion.length > 0, section: "eligibility" },
            { name: "Exclusion criteria", complete: protocol.eligibility.exclusion.length > 0, section: "eligibility" },
            // Search strategy
            { name: "Search query", complete: !!protocol.searchStrategy.query.trim(), section: "search" },
            { name: "Databases", complete: protocol.searchStrategy.databases.length > 0, section: "search" },
            // Methodology
            { name: "Study designs", complete: protocol.methodology.studyDesigns.length > 0, section: "methodology" },
            { name: "Time frame", complete: !!protocol.methodology.timeFrameStart.trim() || !!protocol.methodology.timeFrameEnd.trim(), section: "methodology" },
            { name: "Quality assessment", complete: !!protocol.methodology.qualityAssessmentTool.trim(), section: "methodology" },
        ];

        const completedCount = checks.filter(c => c.complete).length;
        const totalCount = checks.length;
        const percentage = Math.round((completedCount / totalCount) * 100);
        const incomplete = checks.filter(c => !c.complete);

        return {
            checks,
            completedCount,
            totalCount,
            percentage,
            incomplete,
            isComplete: percentage === 100,
        };
    }, [protocol]);

    // Export protocol as formatted text
    const handleExport = useCallback(() => {
        if (!project) return;

        const content = buildProtocolMarkdown(project, protocol, completeness);
        const blob = new Blob([content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `protocol-${project.id}-${new Date().toISOString().split("T")[0]}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [project, protocol, completeness]);

    // Helper to create focus/blur handlers for sections
    const createSectionHandlers = (section: ProtocolSection) => ({
        onFocus: () => setActiveSection(section),
        onBlur: () => {
            // Only clear if this section is still the active one
            // This prevents flickering when tabbing between fields in the same section
            setTimeout(() => {
                // Small delay to allow focus to move to another field
            }, 100);
        },
    });

    // Generate context display based on active section
    const getContextDisplay = () => {
        if (activeSection) {
            return activeSectionLabel;
        }
        return "PICO · Criteria · Search";
    };

    // Generate suggestions based on active section
    const getSuggestions = () => getProtocolSuggestions(activeSection);

    if (!project) {
        return (
            <ProjectPageLayout mainClassName={styles.appMainOverride}>
                <div className={styles.notFound}>
                    <h1>Project not found</h1>
                    <Link href="/" className="btn-minimal">
                        Back to Dashboard
                    </Link>
                </div>
            </ProjectPageLayout>
        );
    }

    const mainContent = (
                    <div className={styles.mainContent}>
                        <div className={styles.layout}>
                            <header className={styles.header}>
                                <div className={styles.headerText}>
                                    {!isEmbeddedInProjectShell && (
                                    <div style={{ display: "flex", alignItems: "center" }}>
                                        <BaseBackButton href={`/project/${project.id}`} label="Back to project" />
                                        <span className={styles.eyebrow}>Study Protocol</span>
                                    </div>
                                    )}
                                    <h1>{project.name}</h1>
                                </div>
                                <div className={styles.headerActions}>
                                    <button
                                        type="button"
                                        className={styles.exportBtn}
                                        onClick={handleExport}
                                        title="Export protocol as Markdown"
                                    >
                                        <span className="material-icons-round">download</span>
                                        Export
                                    </button>
                                </div>
                            </header>

                            {/* Status Bar */}
                            <div className={styles.statusBar}>
                                <div className={styles.completenessSection}>
                                    <div className={styles.completenessHeader}>
                                        <span className={styles.completenessLabel}>
                                            Protocol Completeness
                                        </span>
                                        <span className={styles.completenessValue}>
                                            {completeness.completedCount}/{completeness.totalCount} sections
                                        </span>
                                    </div>
                                    <div className={styles.progressBar}>
                                        <div
                                            className={`${styles.progressFill} ${completeness.isComplete ? styles.progressComplete : ""}`}
                                            style={{ width: `${completeness.percentage}%` }}
                                        />
                                    </div>
                                    {completeness.incomplete.length > 0 && (
                                        <div className={styles.incompleteTags}>
                                            <span className={styles.incompleteLabel}>Missing:</span>
                                            {completeness.incomplete.slice(0, 3).map((item) => (
                                                <span key={item.name} className={styles.incompleteTag}>
                                                    {item.name}
                                                </span>
                                            ))}
                                            {completeness.incomplete.length > 3 && (
                                                <span className={styles.incompleteMore}>
                                                    +{completeness.incomplete.length - 3} more
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* PRISMA Flow Summary */}
                            {studies.length > 0 && (
                                <div className={styles.prismaPanel}>
                                    <div className={styles.prismaHeader}>
                                        <h3 className={styles.prismaTitle}>
                                            <span className="material-icons-round">account_tree</span>
                                            PRISMA Flow Summary
                                        </h3>
                                        <Link href={`/project/${id}/ledger`} className={styles.prismaLink}>
                                            View Ledger
                                        </Link>
                                    </div>
                                    <div className={styles.prismaFlow}>
                                        <div className={styles.prismaStage}>
                                            <span className={styles.prismaStageLabel}>Identified</span>
                                            <span className={styles.prismaStageCount}>{prismaCounts.recordsIdentified}</span>
                                        </div>
                                        <span className={styles.prismaArrow}>→</span>
                                        <div className={styles.prismaStage}>
                                            <span className={styles.prismaStageLabel}>Screened</span>
                                            <span className={styles.prismaStageCount}>{prismaCounts.recordsScreened}</span>
                                        </div>
                                        <span className={styles.prismaArrow}>→</span>
                                        <div className={`${styles.prismaStage} ${styles.prismaStageExcluded}`}>
                                            <span className={styles.prismaStageLabel}>Excluded</span>
                                            <span className={styles.prismaStageCount}>{prismaCounts.recordsExcludedScreening}</span>
                                        </div>
                                        <span className={styles.prismaArrow}>→</span>
                                        <div className={`${styles.prismaStage} ${styles.prismaStageIncluded}`}>
                                            <span className={styles.prismaStageLabel}>Included</span>
                                            <span className={styles.prismaStageCount}>{prismaCounts.includedQualitative}</span>
                                        </div>
                                    </div>
                                    <div className={styles.prismaCriteria}>
                                        <div className={styles.prismaCriteriaItem}>
                                            <span className={`${styles.prismaDot} ${styles.prismaDotMeets}`} />
                                            <span>Meets criteria: {prismaCounts.meetsCriteria}</span>
                                        </div>
                                        <div className={styles.prismaCriteriaItem}>
                                            <span className={`${styles.prismaDot} ${styles.prismaDotFails}`} />
                                            <span>Fails criteria: {prismaCounts.failsCriteria}</span>
                                        </div>
                                        {prismaCounts.needsReview > 0 && (
                                            <div className={styles.prismaCriteriaItem}>
                                                <span className={`${styles.prismaDot} ${styles.prismaDotMaybe}`} />
                                                <span>Needs review: {prismaCounts.needsReview}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            <DemoGuideCard
                                projectId={project.id}
                                guideId="protocol-overview"
                                text="This protocol defines the rules your review follows. The copilot uses these criteria to screen studies and flag inconsistencies."
                            />

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
                                            projectId={project.id}
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
                        </div>
                    </div>
    );

    return (
        <ProjectPageLayout
            mainClassName={styles.appMainOverride}
            copilot={{
                page: "protocol",
                section: activeSectionLabel ?? undefined,
                contextDisplay: getContextDisplay(),
                emptyState: {
                    icon: "assignment",
                    title: "Refine your protocol",
                    description: "Get help defining PICO criteria, search strategies, and eligibility rules.",
                    suggestions: getSuggestions(),
                },
                inputPlaceholder: "Ask about your protocol\u2026",
                panelId: "protocol-copilot-panel",
                onInsert: activeSection ? handleInsert : undefined,
            }}
        >
            <div className={styles.page}>{mainContent}</div>
        </ProjectPageLayout>
    );
}

/** Protocol page wrapper with ProtocolProvider */
export default function ProtocolPage() {
    const { id } = useParams<{ id: string }>();

    return (
        <ProtocolProvider projectId={id ?? ""}>
            <ProtocolPageContent />
        </ProtocolProvider>
    );
}
