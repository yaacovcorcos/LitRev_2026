import { describe, expect, it } from "vitest";
import {
  DEFAULT_PDF_EXTRACTION_MODEL,
  getPdfExtractionModelConfig,
} from "../pdf-extraction-config";

describe("PDF extraction model config", () => {
  it("uses the default model for both extraction stages", () => {
    expect(getPdfExtractionModelConfig({})).toEqual({
      quickExtractModel: DEFAULT_PDF_EXTRACTION_MODEL,
      deepAnalysisModel: DEFAULT_PDF_EXTRACTION_MODEL,
    });
  });

  it("allows one shared override for both PDF extraction stages", () => {
    expect(getPdfExtractionModelConfig({
      AI_PDF_EXTRACTION_MODEL: "shared-model",
    })).toEqual({
      quickExtractModel: "shared-model",
      deepAnalysisModel: "shared-model",
    });
  });

  it("lets stage-specific overrides take precedence over the shared override", () => {
    expect(getPdfExtractionModelConfig({
      AI_PDF_EXTRACTION_MODEL: "shared-model",
      AI_PDF_QUICK_EXTRACT_MODEL: "quick-model",
      AI_PDF_DEEP_ANALYSIS_MODEL: "deep-model",
    })).toEqual({
      quickExtractModel: "quick-model",
      deepAnalysisModel: "deep-model",
    });
  });
});
