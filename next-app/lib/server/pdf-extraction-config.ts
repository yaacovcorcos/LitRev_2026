import "server-only";

import {
    DEFAULT_SELECTABLE_MODEL_ID,
    SELECTABLE_MODEL_IDS,
    isSelectableModelId,
    type SelectableModelId,
} from "@/lib/ai/config";
import { isGatewayModelConfigured } from "@/lib/server/ai/model-availability";

export const DEFAULT_PDF_QUICK_EXTRACT_MODEL = "deepseek-v4-flash";
export const DEFAULT_PDF_DEEP_ANALYSIS_MODEL = "deepseek-v4-pro";

export type PdfExtractionModelConfig = {
    quickExtractModel: SelectableModelId;
    deepAnalysisModel: SelectableModelId;
};

type Environment = Record<string, string | undefined>;

function readModelId(
    envName: string,
    value: string | undefined,
): SelectableModelId | null {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    if (isSelectableModelId(trimmed)) return trimmed;
    throw new Error(
        `${envName} must use a stable Papilab model ID: ${SELECTABLE_MODEL_IDS.join(", ")}.`,
    );
}

export function getPdfExtractionModelConfig(env: Environment = process.env): PdfExtractionModelConfig {
    const sharedModel = readModelId("AI_PDF_EXTRACTION_MODEL", env.AI_PDF_EXTRACTION_MODEL);
    const quickGatewayConfigured = isGatewayModelConfigured(DEFAULT_PDF_QUICK_EXTRACT_MODEL, env);
    const deepGatewayConfigured = isGatewayModelConfigured(DEFAULT_PDF_DEEP_ANALYSIS_MODEL, env);

    return {
        quickExtractModel: readModelId("AI_PDF_QUICK_EXTRACT_MODEL", env.AI_PDF_QUICK_EXTRACT_MODEL)
            ?? sharedModel
            ?? (quickGatewayConfigured ? DEFAULT_PDF_QUICK_EXTRACT_MODEL : DEFAULT_SELECTABLE_MODEL_ID),
        deepAnalysisModel: readModelId("AI_PDF_DEEP_ANALYSIS_MODEL", env.AI_PDF_DEEP_ANALYSIS_MODEL)
            ?? sharedModel
            ?? (deepGatewayConfigured ? DEFAULT_PDF_DEEP_ANALYSIS_MODEL : DEFAULT_SELECTABLE_MODEL_ID),
    };
}
