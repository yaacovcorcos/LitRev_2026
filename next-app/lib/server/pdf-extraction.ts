import "server-only";

import { PDFParse } from "pdf-parse";
import { getAIService } from "./ai/ai-service";
import { EXTRACTION_SYSTEM_PROMPT, buildExtractionUserPrompt } from "./pdf-extraction-prompts";
import type { StudyDetails, StudyType } from "@/types/ledger";

// Constants
const MAX_PDF_SIZE_MB = 50;
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;
const MAX_TEXT_CHARS = 40000; // ~10k tokens, approximately 4 pages worth
const AI_TIMEOUT_MS = 30000;

// Environment variables (server-only)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

/**
 * Fetch PDF from Supabase storage using storagePath + service role key
 */
async function fetchPdfFromStorage(storagePath: string): Promise<Buffer> {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new ExtractionError(
            "CONFIG_ERROR",
            "Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)"
        );
    }

    // storagePath format: "{bucket}/projects/{projectId}/studies/{studyId}/{uuid}-{filename}"
    // The storagePath already includes the bucket prefix, so we use it directly
    const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
    const url = `${SUPABASE_URL}/storage/v1/object/${encodedPath}`;

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
    });

    if (!response.ok) {
        if (response.status === 404) {
            throw new ExtractionError("FILE_NOT_FOUND", "PDF file not found in storage");
        }
        throw new ExtractionError(
            "STORAGE_ERROR",
            `Failed to fetch PDF: ${response.status} ${response.statusText}`
        );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Parse PDF buffer and extract text (limited to MAX_TEXT_CHARS)
 */
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    // Check size limit
    if (buffer.length > MAX_PDF_SIZE_BYTES) {
        throw new ExtractionError(
            "PDF_TOO_LARGE",
            `PDF exceeds ${MAX_PDF_SIZE_MB}MB limit`
        );
    }

    let parser: PDFParse | null = null;
    try {
        parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        // Sanitize and limit text
        const sanitizedText = result.text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Strip script tags
            .slice(0, MAX_TEXT_CHARS);
        return sanitizedText;
    } catch (err) {
        throw new ExtractionError(
            "PDF_PARSE_FAILED",
            `Failed to parse PDF: ${err instanceof Error ? err.message : "Unknown error"}`
        );
    } finally {
        // Clean up parser to avoid memory leaks
        if (parser) {
            await parser.destroy().catch(() => {});
        }
    }
}

/**
 * Layer 1: Regex-based extraction for structured fields
 * Fast and cheap - extracts DOI, PMID, year, and attempts title/authors
 */
export function extractWithRegex(text: string): RegexExtractionResult {
    const result: RegexExtractionResult = {};

    // DOI pattern: 10.xxxx/xxxxx
    const doiMatch = text.match(/10\.\d{4,9}\/[^\s\])"']+/);
    if (doiMatch) {
        // Clean trailing punctuation
        result.doi = doiMatch[0].replace(/[.,;:]+$/, "");
    }

    // PMID patterns
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

    // Year extraction - look for publication year patterns
    // Priority: explicit "published 2024", "(2024)", copyright year
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

    // Title extraction - typically first substantial line before "Abstract"
    const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 10);
    const abstractIndex = lines.findIndex((l) => /^abstract/i.test(l));
    if (abstractIndex > 0 && lines[0]) {
        // Take the first line before abstract as potential title
        const potentialTitle = lines[0];
        // Basic validation: not too short, not all caps (likely header), reasonable length
        if (
            potentialTitle.length > 20 &&
            potentialTitle.length < 300 &&
            !/^[A-Z\s]+$/.test(potentialTitle)
        ) {
            result.title = potentialTitle;
        }
    }

    // Authors extraction - look for patterns like "Name1, Name2, and Name3"
    // This is fragile, so we only attempt it if we have a clear pattern
    const authorPatterns = [
        // "by Author1, Author2, Author3"
        /by\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?(?:,\s+[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?)+)/,
        // Names with affiliations marked by superscript numbers: "John Smith1, Jane Doe2"
        /^([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?\d*(?:,\s+[A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?\d*)+)/m,
    ];
    for (const pattern of authorPatterns) {
        const match = text.match(pattern);
        if (match) {
            // Clean up: remove superscript numbers, excessive whitespace
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
 * Layer 2: AI-based extraction for complex fields
 * Uses OpenAI to extract abstract, study type, keywords, and summary
 */
export async function extractWithAI(
    text: string,
    regexResults: RegexExtractionResult,
    projectId: string
): Promise<{
    details: Partial<StudyDetails>;
    confidence: Record<string, ConfidenceLevel>;
}> {
    const aiService = getAIService();

    const userPrompt = buildExtractionUserPrompt(text, regexResults);

    // Create messages for AI
    const messages = [
        {
            id: "system-1",
            role: "system" as const,
            content: EXTRACTION_SYSTEM_PROMPT,
            createdAt: new Date().toISOString(),
        },
        {
            id: "user-1",
            role: "user" as const,
            content: userPrompt,
            createdAt: new Date().toISOString(),
        },
    ];

    // Call AI with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    try {
        const response = await aiService.chat(messages, {
            model: "gpt-4o", // Use a reliable model
            temperature: 0.2, // Low temperature for more deterministic extraction
            maxTokens: 2000,
            projectId,
        });

        clearTimeout(timeoutId);

        // Parse JSON response
        const content = response.content.trim();
        // Remove markdown code fences if present
        const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(jsonStr);
        } catch {
            console.error("Failed to parse AI response as JSON:", content);
            return { details: {}, confidence: {} };
        }

        // Extract confidence scores
        const rawConfidence = (parsed._confidence as Record<string, string>) || {};
        const confidence: Record<string, ConfidenceLevel> = {};
        for (const [key, value] of Object.entries(rawConfidence)) {
            if (value === "high" || value === "medium" || value === "low") {
                confidence[key] = value;
            }
        }

        // Build StudyDetails
        const details: Partial<StudyDetails> = {};

        if (typeof parsed.abstract === "string" && parsed.abstract.length > 20) {
            details.abstract = parsed.abstract;
        }

        if (typeof parsed.journal === "string") {
            details.journal = parsed.journal;
        }

        if (typeof parsed.aiSummary === "string") {
            details.aiSummary = parsed.aiSummary;
        }

        if (Array.isArray(parsed.keywords)) {
            details.keywords = parsed.keywords.filter((k): k is string => typeof k === "string");
        }

        // Map studyType to our enum
        const validStudyTypes: StudyType[] = [
            "RCT",
            "Cohort",
            "Case-Control",
            "Cross-Sectional",
            "Case-Report",
            "Meta-Analysis",
            "Systematic-Review",
            "Other",
        ];
        if (typeof parsed.studyType === "string") {
            const normalized = parsed.studyType.replace(/\s+/g, "-");
            if (validStudyTypes.includes(normalized as StudyType)) {
                details.studyType = normalized as StudyType;
            }
        }

        return { details, confidence };
    } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
            throw new ExtractionError("AI_FAILED", "AI extraction timed out");
        }
        throw new ExtractionError(
            "AI_FAILED",
            `AI extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`
        );
    }
}

/**
 * Main extraction orchestrator
 * Combines regex and AI extraction layers
 */
export async function extractStudyFromPdf(
    storagePath: string,
    projectId: string
): Promise<ExtractionResult> {
    try {
        // Step 1: Fetch PDF from storage
        const pdfBuffer = await fetchPdfFromStorage(storagePath);

        // Step 2: Extract text from PDF
        const text = await extractTextFromPdf(pdfBuffer);

        if (!text || text.length < 100) {
            return {
                success: false,
                details: {},
                confidence: {},
                missingFields: ["abstract", "studyType", "keywords"],
                error: "PDF contains insufficient text (may be scanned/image-based)",
                errorCode: "PDF_PARSE_FAILED",
            };
        }

        // Step 3: Layer 1 - Regex extraction
        const regexResults = extractWithRegex(text);

        // Step 4: Layer 2 - AI extraction
        const { details: aiDetails, confidence } = await extractWithAI(text, regexResults, projectId);

        // Step 5: Merge results (regex takes precedence for structured fields)
        const details: Partial<StudyDetails> = {
            ...aiDetails,
            doi: regexResults.doi || aiDetails.doi,
            pmid: regexResults.pmid || aiDetails.pmid,
            source: "pdf-import",
        };

        // Determine which fields are missing
        const expectedFields = ["abstract", "studyType", "keywords", "doi", "journal"];
        const missingFields = expectedFields.filter((f) => {
            const value = details[f as keyof StudyDetails];
            if (Array.isArray(value)) return value.length === 0;
            return !value;
        });

        return {
            success: true,
            title: regexResults.title,
            authors: regexResults.authors,
            year: regexResults.year,
            details,
            confidence,
            missingFields,
        };
    } catch (err) {
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
 * Custom error class for extraction errors
 */
class ExtractionError extends Error {
    constructor(
        public code: ExtractionErrorCode,
        message: string
    ) {
        super(message);
        this.name = "ExtractionError";
    }
}
