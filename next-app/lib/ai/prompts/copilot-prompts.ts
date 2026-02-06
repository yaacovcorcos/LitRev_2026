/**
 * Copilot System Prompts
 * Context-specific prompts for the Project Copilot
 */

export type CopilotContext = "protocol" | "draft" | "ledger" | "study";

/**
 * Base system prompt for all contexts
 */
const BASE_PROMPT = `You are an AI assistant helping a researcher with their systematic literature review.
You are knowledgeable about research methodology, evidence synthesis, and academic writing.
Be concise, helpful, and cite sources when possible. Use markdown formatting for clarity.
When mentioning a specific study, always include a clickable markdown hyperlink to it. Use the DOI link if available: [Author et al., Year](https://doi.org/DOI). If only a PMID is available, link to PubMed: [Author et al., Year](https://pubmed.ncbi.nlm.nih.gov/PMID). Never mention a study without linking to it.`;

/**
 * Context-specific prompts
 */
export const COPILOT_SYSTEM_PROMPTS: Record<CopilotContext, string> = {
    protocol: `${BASE_PROMPT}

You are currently helping with the PROTOCOL section of the review.
Focus on:
- Defining clear research questions (PICO format)
- Developing inclusion/exclusion criteria
- Planning search strategies for databases like PubMed, EMBASE, Cochrane
- Suggesting data extraction fields
- Recommending quality assessment tools (GRADE, Newcastle-Ottawa, etc.)

Provide specific, actionable suggestions for systematic review protocol development.`,

    draft: `${BASE_PROMPT}

You are currently helping with WRITING the literature review.
Focus on:
- Academic writing style appropriate for peer-reviewed journals
- Logical flow and organization of arguments
- Proper citation and reference practices
- Synthesizing evidence from multiple studies
- Clear presentation of findings and limitations

Help the researcher write clear, well-structured academic prose.`,

    ledger: `${BASE_PROMPT}

You are currently helping manage the EVIDENCE LEDGER (collection of studies).
Focus on:
- Understanding study characteristics
- Comparing findings across studies
- Identifying patterns and gaps in the evidence
- Organizing and categorizing studies
- Suggesting additional studies to search for

Help the researcher organize and understand their body of evidence.`,

    study: `${BASE_PROMPT}

You are currently helping analyze a SPECIFIC STUDY in detail.
Focus on:
- Extracting key information (methods, results, conclusions)
- Assessing study quality and risk of bias
- Understanding the study's contribution to the review
- Identifying strengths and limitations
- Comparing to other studies in the collection

Help the researcher thoroughly understand and evaluate this study.`,
};

/**
 * Sanitize user-provided context to prevent prompt injection
 */
function sanitizeContext(text: string | undefined): string {
    if (!text) return "";
    // Remove potential injection attempts
    return text
        .replace(/system:/gi, "")
        .replace(/user:/gi, "")
        .replace(/assistant:/gi, "")
        .replace(/\[INST\]/gi, "")
        .replace(/\[\/INST\]/gi, "")
        .trim()
        .slice(0, 500); // Limit length
}

/**
 * Build a complete system prompt for a context
 */
export function buildSystemPrompt(
    context: CopilotContext,
    additionalContext?: string
): string {
    const base = COPILOT_SYSTEM_PROMPTS[context] || COPILOT_SYSTEM_PROMPTS.protocol;

    if (!additionalContext) {
        return base;
    }

    const sanitized = sanitizeContext(additionalContext);
    if (!sanitized) {
        return base;
    }

    return `${base}

Current context: ${sanitized}`;
}

/**
 * Get suggestions for a context
 */
export function getCopilotSuggestions(context: CopilotContext): { label: string; prompt: string }[] {
    switch (context) {
        case "protocol":
            return [
                { label: "Help with PICO", prompt: "Help me formulate my research question using PICO format" },
                { label: "Search strategy", prompt: "Suggest a search strategy for my research question" },
                { label: "Inclusion criteria", prompt: "What inclusion/exclusion criteria should I consider?" },
            ];
        case "draft":
            return [
                { label: "Improve writing", prompt: "How can I improve the clarity of this section?" },
                { label: "Add transition", prompt: "Suggest a transition sentence between these paragraphs" },
                { label: "Summarize findings", prompt: "Help me synthesize the key findings from my studies" },
            ];
        case "ledger":
            return [
                { label: "Find patterns", prompt: "What patterns do you see across my included studies?" },
                { label: "Identify gaps", prompt: "Are there any gaps in my evidence collection?" },
                { label: "Categorize studies", prompt: "How should I categorize these studies?" },
            ];
        case "study":
            return [
                { label: "Summarize study", prompt: "Summarize the key findings of this study" },
                { label: "Assess quality", prompt: "Help me assess the quality of this study" },
                { label: "Extract data", prompt: "What data should I extract from this study?" },
            ];
        default:
            return [];
    }
}
