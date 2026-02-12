"use server";

import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import { assertProjectAccess } from "@/lib/server/access";
import { getFileAssetById } from "@/lib/server/files";
import { getStudy, updateStudy } from "@/lib/server/ledger";
import {
    extractStudyFromPdf,
    deepAnalyzeStudyFromPdf,
    type ExtractionResult,
    type DeepAnalysisResult,
    type ExtractionErrorCode,
} from "@/lib/server/pdf-extraction";
import type { Study, StudyDetails } from "@/types/ledger";
import { createMemoriesFromDeepAnalysis } from "@/lib/server/memory/study-memory";

export type ExtractionActionResult = {
    success: boolean;
    study?: Study;
    extractionResult?: ExtractionResult;
    error?: string;
    errorCode?: ExtractionErrorCode | "ACCESS_DENIED" | "STUDY_NOT_FOUND" | "FILE_NOT_FOUND" | "NOT_PDF";
};

export type DeepAnalysisActionResult = {
    success: boolean;
    study?: Study;
    error?: string;
    errorCode?: ExtractionErrorCode | "ACCESS_DENIED" | "STUDY_NOT_FOUND" | "FILE_NOT_FOUND" | "NOT_PDF";
};

// MVP-only: In-memory lock won't work across serverless instances
// TODO: Replace with DB-backed locking for production
const EXTRACTION_LOCKS = new Set<string>();

/**
 * Extract study metadata from an attached PDF file
 * Updates the study's details with extracted information
 */
export async function extractStudyFromPdfAction(
    projectId: string,
    studyId: string,
    fileAssetId: string
): Promise<ExtractionActionResult> {
    const lockKey = `${projectId}:${studyId}`;

    // Check if extraction is already in progress
    if (EXTRACTION_LOCKS.has(lockKey)) {
        return {
            success: false,
            error: "Extraction already in progress for this study",
            errorCode: "EXTRACTION_IN_PROGRESS",
        };
    }

    try {
        // Acquire lock
        EXTRACTION_LOCKS.add(lockKey);

        // Verify project access
        await assertProjectAccess(SINGLE_USER_SCOPE, projectId);

        // Get the file asset
        const file = await getFileAssetById(SINGLE_USER_SCOPE, projectId, fileAssetId);
        if (!file) {
            return {
                success: false,
                error: "File not found",
                errorCode: "FILE_NOT_FOUND",
            };
        }

        // Validate it's a PDF
        if (file.mimeType !== "application/pdf" && file.format !== "pdf") {
            return {
                success: false,
                error: "File is not a PDF",
                errorCode: "NOT_PDF",
            };
        }

        // Get existing study
        const existingStudy = await getStudy(SINGLE_USER_SCOPE, projectId, studyId);
        if (!existingStudy) {
            return {
                success: false,
                error: "Study not found",
                errorCode: "STUDY_NOT_FOUND",
            };
        }

        // Perform extraction
        const extractionResult = await extractStudyFromPdf(file.storagePath, projectId);

        if (!extractionResult.success) {
            return {
                success: false,
                extractionResult,
                error: extractionResult.error || "Extraction failed",
                errorCode: extractionResult.errorCode,
            };
        }

        // Prepare updates - always prefer AI-extracted data over filename defaults
        const updates: {
            title?: string;
            authors?: string;
            year?: number;
            status?: Study["status"];
            details?: Partial<StudyDetails>;
        } = {
            status: "extracted",
            details: {
                ...extractionResult.details,
                source: "pdf-import",
            },
        };

        if (extractionResult.title) {
            updates.title = extractionResult.title;
        }
        if (extractionResult.authors) {
            updates.authors = extractionResult.authors;
        }
        if (extractionResult.year) {
            updates.year = extractionResult.year;
        }

        // Update the study (updateStudy merges details automatically)
        const updatedStudy = await updateStudy(
            SINGLE_USER_SCOPE,
            projectId,
            studyId,
            updates
        );

        return {
            success: true,
            study: updatedStudy,
            extractionResult,
        };
    } catch (err) {
        console.error("Extraction action error:", err);
        return {
            success: false,
            error: err instanceof Error ? err.message : "Unknown error during extraction",
        };
    } finally {
        // Always release lock
        EXTRACTION_LOCKS.delete(lockKey);
    }
}

/**
 * Stage 2: Deep analysis of an already-extracted study PDF.
 * Populates aiSummary, studyType, keywords, quality, qualityRationale.
 */
export async function deepAnalyzeStudyAction(
    projectId: string,
    studyId: string,
    fileAssetId: string
): Promise<DeepAnalysisActionResult> {
    const lockKey = `deep:${projectId}:${studyId}`;

    if (EXTRACTION_LOCKS.has(lockKey)) {
        return {
            success: false,
            error: "Deep analysis already in progress for this study",
            errorCode: "EXTRACTION_IN_PROGRESS",
        };
    }

    try {
        EXTRACTION_LOCKS.add(lockKey);

        await assertProjectAccess(SINGLE_USER_SCOPE, projectId);

        const file = await getFileAssetById(SINGLE_USER_SCOPE, projectId, fileAssetId);
        if (!file) {
            return { success: false, error: "File not found", errorCode: "FILE_NOT_FOUND" };
        }

        if (file.mimeType !== "application/pdf" && file.format !== "pdf") {
            return { success: false, error: "File is not a PDF", errorCode: "NOT_PDF" };
        }

        const existingStudy = await getStudy(SINGLE_USER_SCOPE, projectId, studyId);
        if (!existingStudy) {
            return { success: false, error: "Study not found", errorCode: "STUDY_NOT_FOUND" };
        }

        const result = await deepAnalyzeStudyFromPdf(
            file.storagePath,
            {
                title: existingStudy.title,
                authors: existingStudy.authors,
                details: existingStudy.details,
            },
            projectId
        );

        if (!result.success) {
            return {
                success: false,
                error: result.error || "Deep analysis failed",
                errorCode: result.errorCode,
            };
        }

        // Build updates from deep analysis result
        const updates: { quality?: Study["quality"]; details?: Partial<StudyDetails> } = {
            details: {
                ...result.details,
                deepAnalysisComplete: true,
            },
        };

        if (result.quality) {
            updates.quality = result.quality;
        }

        const updatedStudy = await updateStudy(SINGLE_USER_SCOPE, projectId, studyId, updates);

        // Create StudyMemory records from deep analysis
        await createMemoriesFromDeepAnalysis(
            studyId,
            projectId,
            { ...result.details, deepAnalysisComplete: true } as Record<string, unknown>,
            result.quality
        ).catch((err) => {
            console.error("Failed to create study memories from deep analysis:", err);
        });

        return { success: true, study: updatedStudy };
    } catch (err) {
        console.error("Deep analysis action error:", err);
        return {
            success: false,
            error: err instanceof Error ? err.message : "Unknown error during deep analysis",
        };
    } finally {
        EXTRACTION_LOCKS.delete(lockKey);
    }
}
