import "server-only";

import { getAIService } from "./ai/ai-service";
import { logServerError, logServerWarn } from "@/lib/server/logging";
import {
    QUICK_EXTRACT_SYSTEM_PROMPT,
    DEEP_ANALYSIS_SYSTEM_PROMPT,
    buildQuickExtractPrompt,
    buildDeepAnalysisPrompt,
} from "./pdf-extraction-prompts";
import { getPdfExtractionModelConfig } from "./pdf-extraction-config";
import type { StudyDetails, StudyType } from "@/types/ledger";
import { extractHeaderWithGrobid, type GrobidHeaderExtraction } from "./grobid";
import { fetchFileAssetBytes, type FileAssetStorageRecord } from "./file-storage";
import {
    createAbortError,
    createDeadlineAbortController,
    isAbortLikeError,
    throwIfAborted,
} from "@/lib/abort";

// Constants
const MAX_PDF_SIZE_MB = 50;
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;
const MAX_TEXT_CHARS = 40000; // ~10k tokens
const AI_TIMEOUT_MS = 30000;

type PdfExtractionRuntimeOptions = {
    signal?: AbortSignal;
};

function awaitWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) {
        return Promise.reject(createAbortError());
    }

    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const cleanup = () => signal.removeEventListener("abort", onAbort);
        const onAbort = () => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(createAbortError());
        };

        signal.addEventListener("abort", onAbort, { once: true });
        operation.then(
            (value) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(value);
            },
            (error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
            },
        );
    });
}

// Types
export type ConfidenceLevel = "high" | "medium" | "low";

export type ExtractionResult = {
    success: boolean;
    title?: string;
    authors?: string;
    year?: number;
    details: Partial<StudyDetails>;
    confidence: Record<string, ConfidenceLevel>;
    missingFields: string[];
    error?: string;
    errorCode?: ExtractionErrorCode;
};

export type DeepAnalysisResult = {
    success: boolean;
    details: Partial<StudyDetails>;
    quality?: "High" | "Medium" | "Low";
    error?: string;
    errorCode?: ExtractionErrorCode;
};

export type ExtractionErrorCode =
    | "FILE_NOT_FOUND"
    | "NOT_PDF"
    | "PDF_TOO_LARGE"
    | "PDF_PARSE_FAILED"
    | "EXTRACTION_IN_PROGRESS"
    | "AI_FAILED"
    | "STORAGE_ERROR"
    | "CONFIG_ERROR";

export type RegexExtractionResult = {
    doi?: string;
    pmid?: string;
    year?: number;
    title?: string;
    authors?: string;
};

function hasGrobidMetadata(result: GrobidHeaderExtraction | null): boolean {
    if (!result) return false;
    return Boolean(
        result.title ||
        result.authors ||
        result.abstract ||
        result.doi ||
        result.journal ||
        result.year
    );
}

export async function fetchPdfFromFileAsset(
    file: FileAssetStorageRecord,
    projectId: string
): Promise<Buffer> {
    try {
        return await fetchFileAssetBytes(file, {
            projectId,
            studyId: file.studyId ?? null,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch PDF";
        if (message === "PDF file not found in storage") {
            throw new ExtractionError("FILE_NOT_FOUND", message);
        }
        if (message.includes("Missing Supabase configuration")) {
            throw new ExtractionError("CONFIG_ERROR", message);
        }
        if (
            message === "Invalid file storage location." ||
            message === "Demo file is missing a readable public URL."
        ) {
            throw new ExtractionError("STORAGE_ERROR", message);
        }
        throw new ExtractionError("STORAGE_ERROR", message);
    }
}

/**
 * Parse PDF buffer and extract text (limited to MAX_TEXT_CHARS)
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    if (buffer.length > MAX_PDF_SIZE_BYTES) {
        throw new ExtractionError(
            "PDF_TOO_LARGE",
            `PDF exceeds ${MAX_PDF_SIZE_MB}MB limit`
        );
    }

    let parser: InstanceType<typeof import("pdf-parse").PDFParse> | null = null;
    try {
        const { PDFParse } = await import("pdf-parse");
        parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        const sanitizedText = result.text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .slice(0, MAX_TEXT_CHARS);
        return sanitizedText;
    } catch (err) {
        throw new ExtractionError(
            "PDF_PARSE_FAILED",
            `Failed to parse PDF: ${err instanceof Error ? err.message : "Unknown error"}`
        );
    } finally {
        if (parser) {
            await parser.destroy().catch(() => {});
        }
    }
}

/**
 * Layer 1: Regex-based extraction for structured fields
 */
export function extractWithRegex(text: string): RegexExtractionResult {
    const result: RegexExtractionResult = {};

    const doiMatch = text.match(/10\.\d{4,9}\/[^\s\])"']+/);
    if (doiMatch) {
        result.doi = doiMatch[0].replace(/[.,;:]+$/, "");
    }

    const pmidPatterns = [
        /PMID[:\s]*(\d{6,9})/i,
        /pubmed\.ncbi\.nlm\.nih\.gov\/(\d{6,9})/i,
        /PubMed\s+ID[:\s]*(\d{6,9})/i,
    ];
    for (const pattern of pmidPatterns) {
        const match = text.match(pattern);
        if (match) {
            result.pmid = match[1];
            break;
        }
    }

    const yearPatterns = [
        /(?:published|received|accepted)[:\s]+\w+\s+(\d{1,2},?\s+)?((?:19|20)\d{2})/i,
        /©\s*((?:19|20)\d{2})/,
        /\(((?:19|20)\d{2})\)/,
        /(?:^|\s)((?:19|20)\d{2})(?:\s|$|;|\.)/,
    ];
    for (const pattern of yearPatterns) {
        const match = text.match(pattern);
        if (match) {
            const yearStr = match[2] || match[1];
            const year = parseInt(yearStr, 10);
            if (year >= 1900 && year <= new Date().getFullYear() + 1) {
                result.year = year;
                break;
            }
        }
    }

    const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 10);
    const abstractIndex = lines.findIndex((l) => /^abstract/i.test(l));
    if (abstractIndex > 0 && lines[0]) {
        const potentialTitle = lines[0];
        if (
            potentialTitle.length > 20 &&
            potentialTitle.length < 300 &&
            !/^[A-Z\s]+$/.test(potentialTitle)
        ) {
            result.title = potentialTitle;
        }
    }

    const authorPatterns = [
        /by\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?(?:,\s+[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?)+)/,
        /^([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?\d*(?:,\s+[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?\d*)+)/m,
    ];
    for (const pattern of authorPatterns) {
        const match = text.match(pattern);
        if (match) {
            result.authors = match[1]
                .replace(/\d+/g, "")
                .replace(/\s+/g, " ")
                .trim();
            break;
        }
    }

    return result;
}

/**
 * Helper: parse JSON from AI response (handles markdown code fences)
 */
function parseAIJson(content: string): Record<string, unknown> | null {
    const trimmed = content.trim();
    const jsonStr = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    try {
        return JSON.parse(jsonStr);
    } catch {
        logServerError("pdf-extraction", "failed to parse AI response as JSON", {
            responseLength: content.length,
            trimmedLength: trimmed.length,
            jsonLength: jsonStr.length,
            wrappedInCodeFence: /^```(?:json)?/i.test(trimmed),
        });
        return null;
    }
}

/**
 * Stage 1 AI: Quick extraction of bibliographic metadata + abstract
 * Uses the configured fast PDF extraction model for speed and cost
 */
export async function quickExtractWithAI(
    text: string,
    regexResults: RegexExtractionResult,
    projectId: string,
    options?: PdfExtractionRuntimeOptions,
): Promise<{
    title?: string;
    authors?: string;
    year?: number;
    details: Partial<StudyDetails>;
    confidence: Record<string, ConfidenceLevel>;
}> {
    const aiService = getAIService();
    const userPrompt = buildQuickExtractPrompt(text, regexResults);
    const { quickExtractModel } = getPdfExtractionModelConfig();

    const messages = [
        {
            id: "system-1",
            role: "system" as const,
            content: QUICK_EXTRACT_SYSTEM_PROMPT,
            createdAt: new Date().toISOString(),
        },
        {
            id: "user-1",
            role: "user" as const,
            content: userPrompt,
            createdAt: new Date().toISOString(),
        },
    ];

    const deadline = createDeadlineAbortController(AI_TIMEOUT_MS, [options?.signal]);

    try {
        throwIfAborted(deadline.signal);
        const response = await awaitWithAbort(
            aiService.chat(messages, {
                model: quickExtractModel,
                reasoningEffort: "fast",
                temperature: 0.2,
                maxTokens: 2000,
                projectId,
                signal: deadline.signal,
            }),
            deadline.signal,
        );

        const parsed = parseAIJson(response.content);
        if (!parsed) return { details: {}, confidence: {} };

        const details: Partial<StudyDetails> = {};

        if (typeof parsed.abstract === "string" && parsed.abstract.length > 20) {
            details.abstract = parsed.abstract;
        }
        if (typeof parsed.journal === "string" && parsed.journal.length > 0) {
            details.journal = parsed.journal;
        }
        if (typeof parsed.volume === "string" && parsed.volume.length > 0) {
            details.volume = parsed.volume;
        }
        if (typeof parsed.issue === "string" && parsed.issue.length > 0) {
            details.issue = parsed.issue;
        }
        if (typeof parsed.pages === "string" && parsed.pages.length > 0) {
            details.pages = parsed.pages;
        }
        if (typeof parsed.doi === "string" && parsed.doi.length > 0) {
            details.doi = parsed.doi;
        }
        if (typeof parsed.pmid === "string" && parsed.pmid.length > 0) {
            details.pmid = parsed.pmid;
        }

        return {
            title: typeof parsed.title === "string" ? parsed.title : undefined,
            authors: typeof parsed.authors === "string" ? parsed.authors : undefined,
            year: typeof parsed.year === "number" && Number.isFinite(parsed.year) ? parsed.year : undefined,
            details,
            confidence: {},
        };
    } catch (err) {
        if (options?.signal?.aborted) {
            throw createAbortError();
        }
        if (deadline.timedOut() && isAbortLikeError(err)) {
            throw new ExtractionError("AI_FAILED", "AI extraction timed out");
        }
        throw new ExtractionError(
            "AI_FAILED",
            `AI extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`
        );
    } finally {
        deadline.dispose();
    }
}

/**
 * Stage 2 AI: Deep analysis — summary, study type, keywords, quality
 * Uses the configured deep PDF extraction model for nuanced analysis
 */
export async function deepAnalyzeWithAI(
    text: string,
    existingDetails: Partial<StudyDetails> & { title?: string; authors?: string },
    projectId: string,
    options?: PdfExtractionRuntimeOptions,
): Promise<DeepAnalysisResult> {
    const aiService = getAIService();
    const userPrompt = buildDeepAnalysisPrompt(text, {
        title: existingDetails.title,
        authors: existingDetails.authors,
        abstract: existingDetails.abstract,
        journal: existingDetails.journal,
    });
    const { deepAnalysisModel } = getPdfExtractionModelConfig();

    const messages = [
        {
            id: "system-1",
            role: "system" as const,
            content: DEEP_ANALYSIS_SYSTEM_PROMPT,
            createdAt: new Date().toISOString(),
        },
        {
            id: "user-1",
            role: "user" as const,
            content: userPrompt,
            createdAt: new Date().toISOString(),
        },
    ];

    const deadline = createDeadlineAbortController(AI_TIMEOUT_MS, [options?.signal]);

    try {
        throwIfAborted(deadline.signal);
        const response = await awaitWithAbort(
            aiService.chat(messages, {
                model: deepAnalysisModel,
                reasoningEffort: "fast",
                temperature: 0.3,
                maxTokens: 2000,
                projectId,
                signal: deadline.signal,
            }),
            deadline.signal,
        );

        const parsed = parseAIJson(response.content);
        if (!parsed) return { success: false, details: {}, error: "Failed to parse AI response" };

        const details: Partial<StudyDetails> = {};

        if (typeof parsed.aiSummary === "string" && parsed.aiSummary.length > 0) {
            details.aiSummary = parsed.aiSummary;
        }

        if (Array.isArray(parsed.keywords)) {
            details.keywords = parsed.keywords.filter((k): k is string => typeof k === "string");
        }

        if (typeof parsed.qualityRationale === "string" && parsed.qualityRationale.length > 0) {
            details.qualityRationale = parsed.qualityRationale;
        }

        if (typeof parsed.sampleSize === "number" && Number.isFinite(parsed.sampleSize)) {
            details.sampleSize = parsed.sampleSize;
        }
        if (typeof parsed.primaryOutcome === "string" && parsed.primaryOutcome.length > 0) {
            details.primaryOutcome = parsed.primaryOutcome;
        }

        const validStudyTypes: StudyType[] = [
            "RCT", "Cohort", "Case-Control", "Cross-Sectional",
            "Case-Report", "Meta-Analysis", "Systematic-Review", "Other",
        ];
        if (typeof parsed.studyType === "string") {
            const normalized = parsed.studyType.replace(/\s+/g, "-");
            if (validStudyTypes.includes(normalized as StudyType)) {
                details.studyType = normalized as StudyType;
            }
        }

        let quality: "High" | "Medium" | "Low" | undefined;
        if (typeof parsed.quality === "string") {
            const q = parsed.quality;
            if (q === "High" || q === "Medium" || q === "Low") {
                quality = q;
            }
        }

        details.deepAnalysisComplete = true;

        return { success: true, details, quality };
    } catch (err) {
        if (options?.signal?.aborted) {
            throw createAbortError();
        }
        if (deadline.timedOut() && isAbortLikeError(err)) {
            return { success: false, details: {}, error: "Deep analysis timed out", errorCode: "AI_FAILED" };
        }
        return {
            success: false,
            details: {},
            error: `Deep analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`,
            errorCode: "AI_FAILED",
        };
    } finally {
        deadline.dispose();
    }
}

/**
 * Stage 1 orchestrator: Quick extraction (regex + fast AI)
 */
export async function extractStudyFromPdf(
    file: FileAssetStorageRecord,
    projectId: string,
    options?: PdfExtractionRuntimeOptions,
): Promise<ExtractionResult> {
    try {
        throwIfAborted(options?.signal);
        const pdfBuffer = await fetchPdfFromFileAsset(file, projectId);
        throwIfAborted(options?.signal);
        const grobidPromise = extractHeaderWithGrobid(pdfBuffer).catch((error) => {
            logServerWarn("pdf-extraction", "grobid header extraction failed", {
                fileAssetId: file.id,
            }, error);
            return null;
        });

        let text = "";
        let textParseError: ExtractionError | null = null;
        try {
            text = await extractTextFromPdf(pdfBuffer);
            throwIfAborted(options?.signal);
        } catch (error) {
            if (options?.signal?.aborted || isAbortLikeError(error)) {
                throw error;
            }
            textParseError = error instanceof ExtractionError
                ? error
                : new ExtractionError(
                    "PDF_PARSE_FAILED",
                    error instanceof Error ? error.message : "Failed to parse PDF"
                );
        }

        const grobidResult = await grobidPromise;
        throwIfAborted(options?.signal);
        const hasGrobidData = hasGrobidMetadata(grobidResult);

        if ((!text || text.length < 100) && !hasGrobidData) {
            return {
                success: false,
                details: {},
                confidence: {},
                missingFields: ["abstract"],
                error: textParseError?.message || "PDF contains insufficient text (may be scanned/image-based)",
                errorCode: textParseError?.code || "PDF_PARSE_FAILED",
            };
        }

        const regexResults = text && text.length >= 100 ? extractWithRegex(text) : {};

        let aiResult: {
            title?: string;
            authors?: string;
            year?: number;
            details: Partial<StudyDetails>;
            confidence: Record<string, ConfidenceLevel>;
        } = {
            details: {},
            confidence: {},
        };
        let aiFailure: ExtractionError | null = null;

        if (text && text.length >= 100) {
            try {
                aiResult = await quickExtractWithAI(text, regexResults, projectId, options);
            } catch (error) {
                if (options?.signal?.aborted || isAbortLikeError(error)) {
                    throw error;
                }
                aiFailure = error instanceof ExtractionError
                    ? error
                    : new ExtractionError(
                        "AI_FAILED",
                        error instanceof Error ? error.message : "Unknown AI extraction error"
                    );
                logServerWarn("pdf-extraction", "ai quick extraction failed", {
                    fileAssetId: file.id,
                    reason: aiFailure.message,
                });
            }
        }

        // Merge: regex takes precedence for DOI/PMID
        const details: Partial<StudyDetails> = {
            ...aiResult.details,
            ...(grobidResult?.abstract && !aiResult.details.abstract ? { abstract: grobidResult.abstract } : {}),
            ...(grobidResult?.journal && !aiResult.details.journal ? { journal: grobidResult.journal } : {}),
            doi: regexResults.doi || grobidResult?.doi || aiResult.details.doi,
            pmid: regexResults.pmid || aiResult.details.pmid,
            source: "pdf-import",
        };

        const title = grobidResult?.title || aiResult.title || regexResults.title;
        const authors = grobidResult?.authors || aiResult.authors || regexResults.authors;
        const year = grobidResult?.year || aiResult.year || regexResults.year;

        const hasAnyExtractedField = Boolean(
            title ||
            authors ||
            year ||
            details.abstract ||
            details.doi ||
            details.pmid ||
            details.journal
        );

        if (!hasAnyExtractedField && aiFailure) {
            return {
                success: false,
                details: {},
                confidence: {},
                missingFields: ["abstract", "doi", "journal"],
                error: aiFailure.message,
                errorCode: aiFailure.code,
            };
        }

        const expectedFields = ["abstract", "doi", "journal"];
        const missingFields = expectedFields.filter((f) => {
            const value = details[f as keyof StudyDetails];
            if (Array.isArray(value)) return value.length === 0;
            return !value;
        });

        return {
            success: true,
            title,
            authors,
            year,
            details,
            confidence: aiResult.confidence,
            missingFields,
        };
    } catch (err) {
        if (options?.signal?.aborted || isAbortLikeError(err)) {
            throw err;
        }
        if (err instanceof ExtractionError) {
            return {
                success: false,
                details: {},
                confidence: {},
                missingFields: [],
                error: err.message,
                errorCode: err.code,
            };
        }
        return {
            success: false,
            details: {},
            confidence: {},
            missingFields: [],
            error: err instanceof Error ? err.message : "Unknown extraction error",
        };
    }
}

/**
 * Stage 2 orchestrator: Deep analysis (fetches PDF, runs deep AI)
 */
export async function deepAnalyzeStudyFromPdf(
    file: FileAssetStorageRecord,
    existingStudy: { title: string; authors: string; details?: Partial<StudyDetails> },
    projectId: string,
    options?: PdfExtractionRuntimeOptions,
): Promise<DeepAnalysisResult> {
    try {
        throwIfAborted(options?.signal);
        const pdfBuffer = await fetchPdfFromFileAsset(file, projectId);
        throwIfAborted(options?.signal);
        const text = await extractTextFromPdf(pdfBuffer);
        throwIfAborted(options?.signal);

        if (!text || text.length < 100) {
            return {
                success: false,
                details: {},
                error: "PDF contains insufficient text for analysis",
                errorCode: "PDF_PARSE_FAILED",
            };
        }

        return deepAnalyzeWithAI(text, {
            title: existingStudy.title,
            authors: existingStudy.authors,
            abstract: existingStudy.details?.abstract,
            journal: existingStudy.details?.journal,
        }, projectId, options);
    } catch (err) {
        if (options?.signal?.aborted || isAbortLikeError(err)) {
            throw err;
        }
        if (err instanceof ExtractionError) {
            return {
                success: false,
                details: {},
                error: err.message,
                errorCode: err.code,
            };
        }
        return {
            success: false,
            details: {},
            error: err instanceof Error ? err.message : "Unknown error during deep analysis",
        };
    }
}

class ExtractionError extends Error {
    constructor(
        public code: ExtractionErrorCode,
        message: string
    ) {
        super(message);
        this.name = "ExtractionError";
    }
}
