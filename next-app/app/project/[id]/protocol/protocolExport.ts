import type { ProtocolData, ProtocolSection } from "@/types/protocol";

/** Minimal project shape needed for export. */
export type ExportProject = { id: string; name: string };

/** Completeness check result shape. */
export type CompletenessResult = {
    percentage: number;
    incomplete: { name: string }[];
};

/**
 * Build a Markdown string representing the full protocol.
 * Pure function — no side effects.
 */
export function buildProtocolMarkdown(
    project: ExportProject,
    protocol: ProtocolData,
    completeness: CompletenessResult,
): string {
    const lines: string[] = [];
    lines.push(`# Study Protocol: ${project.name}`);
    lines.push("");
    lines.push(
        `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    );
    lines.push("");

    // Research Question
    lines.push("## Research Question");
    lines.push("");
    lines.push(protocol.researchQuestion?.trim() || "_Not defined_");
    lines.push("");

    // PICO Framework
    lines.push("## PICO Framework");
    lines.push("");
    lines.push(`**Population:** ${protocol.pico.population || "_Not defined_"}`);
    lines.push("");
    lines.push(`**Intervention:** ${protocol.pico.intervention || "_Not defined_"}`);
    lines.push("");
    lines.push(`**Comparison:** ${protocol.pico.comparison || "_Not defined_"}`);
    lines.push("");
    lines.push(`**Outcome:** ${protocol.pico.outcome || "_Not defined_"}`);
    lines.push("");

    // Eligibility Criteria
    lines.push("## Eligibility Criteria");
    lines.push("");
    lines.push("### Inclusion Criteria");
    if (protocol.eligibility.inclusion.length > 0) {
        protocol.eligibility.inclusion.forEach((item) => {
            lines.push(`- ${item}`);
        });
    } else {
        lines.push("_No inclusion criteria defined_");
    }
    lines.push("");
    lines.push("### Exclusion Criteria");
    if (protocol.eligibility.exclusion.length > 0) {
        protocol.eligibility.exclusion.forEach((item) => {
            lines.push(`- ${item}`);
        });
    } else {
        lines.push("_No exclusion criteria defined_");
    }
    lines.push("");

    // Search Strategy
    lines.push("## Search Strategy");
    lines.push("");
    lines.push("### Search Query");
    lines.push("```");
    lines.push(protocol.searchStrategy.query || "_No search query defined_");
    lines.push("```");
    lines.push("");
    lines.push("### Databases");
    if (protocol.searchStrategy.databases.length > 0) {
        lines.push(protocol.searchStrategy.databases.join(", "));
    } else {
        lines.push("_No databases specified_");
    }
    lines.push("");

    // Methodology
    lines.push("## Methodology");
    lines.push("");
    lines.push("### Study Designs");
    if (protocol.methodology.studyDesigns.length > 0) {
        protocol.methodology.studyDesigns.forEach((design) => {
            lines.push(`- ${design}`);
        });
    } else {
        lines.push("_No study designs specified_");
    }
    lines.push("");
    lines.push("### Time Frame");
    if (protocol.methodology.timeFrameStart || protocol.methodology.timeFrameEnd) {
        const start = protocol.methodology.timeFrameStart || "N/A";
        const end = protocol.methodology.timeFrameEnd || "Present";
        lines.push(`${start} – ${end}`);
    } else {
        lines.push("_No time frame specified_");
    }
    lines.push("");
    lines.push("### Quality Assessment");
    lines.push(`**Tool:** ${protocol.methodology.qualityAssessmentTool || "_Not specified_"}`);
    if (protocol.methodology.qualityAssessmentNotes) {
        lines.push("");
        lines.push(`**Notes:** ${protocol.methodology.qualityAssessmentNotes}`);
    }
    lines.push("");

    // Completeness
    lines.push("---");
    lines.push("");
    lines.push(`**Protocol Completeness:** ${completeness.percentage}%`);
    if (completeness.incomplete.length > 0) {
        lines.push("");
        lines.push("**Missing sections:**");
        completeness.incomplete.forEach((item) => {
            lines.push(`- ${item.name}`);
        });
    }

    return lines.join("\n");
}

/** Suggestion chip shape used by the copilot empty state. */
export type ProtocolSuggestion = { label: string; prompt: string };

/**
 * Return context-aware suggestion chips based on the active protocol section.
 * Pure function — no side effects.
 */
export function getProtocolSuggestions(activeSection: ProtocolSection): ProtocolSuggestion[] {
    if (activeSection === "research-question") {
        return [
            { label: "Refine question", prompt: "Help me refine my research question to be more specific and answerable" },
            { label: "Derive PICO", prompt: "Based on my research question, suggest PICO components" },
            { label: "Check scope", prompt: "Is my research question too broad or too narrow for a systematic review?" },
        ];
    }
    if (activeSection?.startsWith("pico-")) {
        const field = activeSection.replace("pico-", "");
        return [
            { label: `Refine ${field}`, prompt: `Help me refine my ${field} definition` },
            { label: "Broaden scope", prompt: `Suggest ways to broaden my ${field} criteria` },
            { label: "Narrow scope", prompt: `Suggest ways to make my ${field} more specific` },
        ];
    }
    if (activeSection?.startsWith("eligibility-")) {
        const type = activeSection.includes("inclusion") ? "inclusion" : "exclusion";
        return [
            { label: `Review ${type}`, prompt: `Review my ${type} criteria for gaps` },
            { label: "Add criteria", prompt: `Suggest additional ${type} criteria` },
            { label: "PRISMA check", prompt: "Check if my criteria align with PRISMA guidelines" },
        ];
    }
    if (activeSection === "search-query") {
        return [
            { label: "Optimize query", prompt: "Help optimize my search query for better recall" },
            { label: "Add MeSH terms", prompt: "Suggest relevant MeSH terms to add" },
            { label: "Boolean review", prompt: "Review my Boolean operators for correctness" },
        ];
    }
    if (activeSection === "search-databases") {
        return [
            { label: "Suggest databases", prompt: "What other databases should I search for this topic?" },
            { label: "Grey literature", prompt: "Suggest grey literature sources for my review" },
        ];
    }
    // Default suggestions
    return [
        { label: "PICO Help", prompt: "Help me refine my PICO criteria" },
        { label: "Search Terms", prompt: "Suggest additional search terms for my topic" },
        { label: "Criteria Review", prompt: "Review my eligibility criteria for gaps" },
    ];
}
