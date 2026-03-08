"use client";

import { useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { useProjects } from "@/contexts/ProjectsContext";
import { useLedger } from "@/contexts/LedgerContext";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import { EmptyState, EmptyStateSkeleton } from "@/components/ui/EmptyState";
import Link from "next/link";
import { BaseBackButton } from "@/components/BaseBackButton";
import styles from "./protocol.module.css";
import { ProjectPageLayout } from "@/components/project/ProjectPageLayout";
import { ProtocolProvider, useProtocol } from "@/contexts/ProtocolContext";
import { calculatePRISMACounts } from "@/lib/criteriaMatching";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import { buildProtocolMarkdown, getProtocolSuggestions } from "./protocolExport";
import { ProtocolSections } from "./ProtocolSections";


/** Inner component that uses the ProtocolContext */
function ProtocolPageContent() {
    const { id } = useParams<{ id: string }>();
    const { getProjectById, isLoadingProjects, projectsError } = useProjects();
    const { isEmbeddedInProjectShell } = useProjectShell();
    const {
        protocol,
        activeSection,
        activeSectionLabel,
        saveState,
        saveError,
        pendingPatch,
        applyPendingPatch,
        keepLocalEdits,
        updatePICO,
        addInclusion,
        addExclusion,
        updateSearchQuery,
        addDatabase,
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

    // Generate context display based on active section
    const getContextDisplay = () => {
        if (activeSection) {
            return activeSectionLabel;
        }
        return "PICO · Criteria · Search";
    };

    // Generate suggestions based on active section
    const getSuggestions = () => getProtocolSuggestions(activeSection);

    const saveStatus = useMemo(() => {
        if (pendingPatch) {
            return {
                label: "Incoming update ready",
                detail: "Resolve the incoming copilot update before continuing.",
                tone: styles.statusBadgeAttention,
            };
        }

        if (saveState === "saving") {
            return {
                label: "Saving...",
                detail: "Protocol changes are syncing in the background.",
                tone: styles.statusBadgeSaving,
            };
        }

        if (saveState === "local-only") {
            return {
                label: "Saved locally",
                detail: "Your latest protocol edits are preserved locally and will sync next.",
                tone: styles.statusBadgeLocal,
            };
        }

        if (saveState === "error") {
            return {
                label: "Save failed",
                detail: saveError ?? "Local backup preserved. Retry by editing or blurring a field again.",
                tone: styles.statusBadgeError,
            };
        }

        return {
            label: "All changes saved",
            detail: "Protocol changes are in sync across the project.",
            tone: styles.statusBadgeSaved,
        };
    }, [pendingPatch, saveError, saveState]);

    if (isLoadingProjects) {
        return (
            <ProjectPageLayout noMainPadding mainClassName={styles.appMainOverride}>
                <div className={`${styles.page} surface-root`} data-surface-height="shell">
                    <EmptyStateSkeleton className={styles.notFound} />
                </div>
            </ProjectPageLayout>
        );
    }

    if (projectsError) {
        return (
            <ProjectPageLayout noMainPadding mainClassName={styles.appMainOverride}>
                <div className={`${styles.page} surface-root`} data-surface-height="shell">
                    <EmptyState
                        variant="error"
                        icon="cloud_off"
                        title="Unable to load project"
                        description={projectsError}
                        primaryAction={{ label: "Retry", onClick: () => window.location.reload() }}
                        secondaryAction={{ label: "Back to Dashboard", href: "/" }}
                        className={styles.notFound}
                    />
                </div>
            </ProjectPageLayout>
        );
    }

    if (!project) {
        return (
            <ProjectPageLayout noMainPadding mainClassName={styles.appMainOverride}>
                <div className={`${styles.page} surface-root`} data-surface-height="shell">
                    <EmptyState
                        variant="error"
                        icon="folder_off"
                        title="Project not found"
                        description="This project may have been deleted or you don't have access."
                        primaryAction={{ label: "Back to Dashboard", href: "/" }}
                        className={styles.notFound}
                    />
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
                                {pendingPatch ? (
                                    <div className={styles.pendingPatchBanner}>
                                        <div className={styles.pendingPatchCopy}>
                                            <span className="material-icons-round">sync_alt</span>
                                            <div>
                                                <strong>{pendingPatch.summary}</strong>
                                                <p>
                                                    This protocol update was accepted in copilot. Apply it now or keep your current local edits.
                                                </p>
                                            </div>
                                        </div>
                                        <div className={styles.pendingPatchActions}>
                                            <button
                                                type="button"
                                                className={styles.pendingPatchPrimary}
                                                onClick={applyPendingPatch}
                                            >
                                                Apply incoming
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.pendingPatchSecondary}
                                                onClick={keepLocalEdits}
                                            >
                                                Keep mine
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                                <div className={styles.completenessSection}>
                                    <div className={styles.completenessHeader}>
                                        <div className={styles.statusHeaderCopy}>
                                            <span className={styles.completenessLabel}>
                                                Protocol Completeness
                                            </span>
                                            <span className={styles.completenessValue}>
                                                {completeness.completedCount}/{completeness.totalCount} sections
                                            </span>
                                        </div>
                                        <div className={styles.statusMeta}>
                                            <span className={`${styles.statusBadge} ${saveStatus.tone}`}>
                                                {saveStatus.label}
                                            </span>
                                            <span className={styles.statusDetail}>{saveStatus.detail}</span>
                                        </div>
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

                            <ProtocolSections projectId={project.id} />
                        </div>
                    </div>
    );

    return (
        <ProjectPageLayout
            noMainPadding
            mainClassName={styles.appMainOverride}
            contentScrollMode="child"
            copilotCollapseMode="phone-only"
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
            <div className={`${styles.page} surface-root`} data-surface-height="shell">
                {mainContent}
            </div>
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
