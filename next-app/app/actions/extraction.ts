"use server";

import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import { assertProjectAccess } from "@/lib/server/access";
import { getFileAssetById } from "@/lib/server/files";
import { getStudy, updateStudy } from "@/lib/server/ledger";
import {
    extractStudyFromPdf,
    type ExtractionResult,
    type ExtractionErrorCode,
} from "@/lib/server/pdf-extraction";
import type { Study, StudyDetails } from "@/types/ledger";

export type ExtractionActionResult = {
    success: boolean;
    study?: Study;
    extractionResult?: ExtractionResult;
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

        // Prepare updates - merge extracted data with existing
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

        // Only update top-level fields if extracted and not already set
        if (extractionResult.title && existingStudy.title === "Untitled Study") {
            updates.title = extractionResult.title;
        }
        if (extractionResult.authors && existingStudy.authors === "Unknown") {
            updates.authors = extractionResult.authors;
        }
        if (extractionResult.year && existingStudy.year === new Date().getFullYear()) {
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
