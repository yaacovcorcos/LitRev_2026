import "server-only";

export const DEFAULT_PDF_EXTRACTION_MODEL = "grok-4-1-fast";

export type PdfExtractionModelConfig = {
    quickExtractModel: string;
    deepAnalysisModel: string;
};

type Environment = Record<string, string | undefined>;

function readModelId(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

export function getPdfExtractionModelConfig(env: Environment = process.env): PdfExtractionModelConfig {
    const sharedModel = readModelId(env.AI_PDF_EXTRACTION_MODEL);

    return {
        quickExtractModel: readModelId(env.AI_PDF_QUICK_EXTRACT_MODEL) ?? sharedModel ?? DEFAULT_PDF_EXTRACTION_MODEL,
        deepAnalysisModel: readModelId(env.AI_PDF_DEEP_ANALYSIS_MODEL) ?? sharedModel ?? DEFAULT_PDF_EXTRACTION_MODEL,
    };
}
