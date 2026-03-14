import "server-only";

import { safeParseJson } from "@/lib/server/ai/json-repair";
import { ScopingReportSchema, type ScopingReportPayload } from "@/types/artifacts";

export type ScopingReport = ScopingReportPayload;

type MessageLike = { role: string; content: string };

const COMMENT_RE = /<!--\s*SCOPING_REPORT:\s*([\s\S]*?)\s*-->/i;
const XML_RE = /<scoping_report>\s*([\s\S]*?)\s*<\/scoping_report>/i;
const FENCED_RE = /```(?:scoping_report|json)\s*([\s\S]*?)```/gi;
const FENCED_SCOPING_STRIP_RE = /```scoping_report[\s\S]*?```/gi;

function normalizeText(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
    return normalizeText(value)
        .split(" ")
        .filter((token) => token.length >= 4);
}

function parseReportCandidate(raw: string): ScopingReport | null {
    const parsed = safeParseJson(raw);
    const validated = ScopingReportSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
}

export function extractScopingReportFromText(text: string): ScopingReport | null {
    if (!text) return null;
    const commentMatch = text.match(COMMENT_RE);
    if (commentMatch?.[1]) {
        const report = parseReportCandidate(commentMatch[1]);
        if (report) return report;
    }

    const xmlMatch = text.match(XML_RE);
    if (xmlMatch?.[1]) {
        const report = parseReportCandidate(xmlMatch[1]);
        if (report) return report;
    }

    const fenced = [...text.matchAll(FENCED_RE)].map((m) => m[1]).filter(Boolean);
    for (const candidate of fenced) {
        if (!candidate.includes("recommendedQuestions")) continue;
        const report = parseReportCandidate(candidate);
        if (report) return report;
    }

    return null;
}

export function extractLatestScopingReport(messages: MessageLike[]): ScopingReport | null {
    for (let idx = messages.length - 1; idx >= 0; idx--) {
        const msg = messages[idx];
        if (msg?.role !== "assistant" || !msg.content) continue;
        const report = extractScopingReportFromText(msg.content);
        if (report) return report;
    }
    return null;
}

export function stripScopingReportMarkup(text: string): string {
    return text
        .replace(COMMENT_RE, "")
        .replace(FENCED_SCOPING_STRIP_RE, "")
        .replace(XML_RE, "")
        .trim();
}

export function appendScopingReportComment(text: string, report: ScopingReport): string {
    const clean = stripScopingReportMarkup(text);
    const encoded = JSON.stringify(report);
    return `${clean}\n\n<!-- SCOPING_REPORT: ${encoded} -->`;
}

export function buildFallbackScopingReport(topic: string): ScopingReport {
    return {
        topic: topic.trim() || "Literature scoping",
        searchesRun: [],
        landscape: {
            majorThemes: [],
            evidenceGaps: [],
            methodologicalPatterns: [],
            evidenceDensity: "moderate",
        },
        recommendedQuestions: [],
        nextStep: "Choose a focused question to continue in protocol mode.",
    };
}

function parseOrdinalSelection(message: string): number | null {
    const explicit = message.match(/\b(?:question|option)\s*#?\s*(\d+)\b/i);
    if (explicit) return Math.max(1, Number.parseInt(explicit[1], 10));

    const ordinals: Record<string, number> = {
        first: 1,
        second: 2,
        third: 3,
        fourth: 4,
        fifth: 5,
    };
    for (const [word, index] of Object.entries(ordinals)) {
        if (new RegExp(`\\b${word}\\b`, "i").test(message)) return index;
    }
    return null;
}

function isAffirmative(message: string): boolean {
    return /^(yes|yep|yeah|go ahead|proceed|continue|lets do it|let's do it|sounds good|ok|okay)$/i.test(
        message.trim()
    );
}

function isContinueWithDefault(message: string): boolean {
    return /\b(?:continue|proceed|go ahead|sounds good|use|go with)\b/i.test(message)
        || /\bcontinue with what you have\b/i.test(message)
        || /\bthe .* one\b/i.test(message);
}

function getRecommendedDefaultIndex(report: ScopingReport): number | null {
    const defaultIndex = report.workflow?.recommendedDefaultQuestionIndex;
    if (typeof defaultIndex === "number" && defaultIndex >= 1 && defaultIndex <= report.recommendedQuestions.length) {
        return defaultIndex;
    }
    return report.recommendedQuestions.length > 0 ? 1 : null;
}

function detectThemeOverlapSelection(message: string, report: ScopingReport): { question: string; index: number } | null {
    const normalizedMessage = normalizeText(message);
    if (
        !/\b(?:go with|use|choose|pick|continue with|the .* one|sounds good|continue|proceed)\b/i.test(normalizedMessage)
    ) {
        return null;
    }

    const messageTokens = new Set(tokenize(message));
    let bestIndex = -1;
    let bestScore = 0;
    let secondBestScore = 0;

    for (let i = 0; i < report.recommendedQuestions.length; i++) {
        const candidate = report.recommendedQuestions[i];
        const candidateTokens = [...new Set(tokenize(candidate.question))];
        const overlap = candidateTokens.filter((token) => messageTokens.has(token)).length;
        if (overlap > bestScore) {
            secondBestScore = bestScore;
            bestScore = overlap;
            bestIndex = i;
        } else if (overlap > secondBestScore) {
            secondBestScore = overlap;
        }
    }

    if (bestIndex >= 0 && bestScore >= 1 && bestScore > secondBestScore) {
        return {
            question: report.recommendedQuestions[bestIndex].question,
            index: bestIndex + 1,
        };
    }

    return null;
}

export function detectScopingHandoffSelection(
    message: string,
    report: ScopingReport | null
): { question: string; index: number } | null {
    if (!report?.recommendedQuestions?.length) return null;

    const byIndex = parseOrdinalSelection(message);
    if (byIndex !== null) {
        const selected = report.recommendedQuestions[byIndex - 1];
        if (selected) return { question: selected.question, index: byIndex };
    }

    const normalizedMessage = normalizeText(message);
    for (let i = 0; i < report.recommendedQuestions.length; i++) {
        const candidate = report.recommendedQuestions[i];
        const normalizedQuestion = normalizeText(candidate.question);
        if (normalizedQuestion && normalizedMessage.includes(normalizedQuestion)) {
            return { question: candidate.question, index: i + 1 };
        }
    }

    const themeSelection = detectThemeOverlapSelection(message, report);
    if (themeSelection) {
        return themeSelection;
    }

    const defaultIndex = getRecommendedDefaultIndex(report);
    if (defaultIndex !== null && (isAffirmative(message) || isContinueWithDefault(message))) {
        return {
            question: report.recommendedQuestions[defaultIndex - 1].question,
            index: defaultIndex,
        };
    }

    if (report.workflow?.handoffOffered && defaultIndex !== null) {
        return {
            question: report.recommendedQuestions[defaultIndex - 1].question,
            index: defaultIndex,
        };
    }

    return null;
}
