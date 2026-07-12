import { describe, expect, it } from "vitest";
import {
  DEFAULT_PDF_DEEP_ANALYSIS_MODEL,
  DEFAULT_PDF_QUICK_EXTRACT_MODEL,
  getPdfExtractionModelConfig,
} from "../pdf-extraction-config";
import { DEFAULT_SELECTABLE_MODEL_ID } from "@/lib/ai/config";

describe("PDF extraction model config", () => {
  it("keeps Luna as the safe fallback before a gateway key is installed", () => {
    expect(getPdfExtractionModelConfig({})).toEqual({
      quickExtractModel: DEFAULT_SELECTABLE_MODEL_ID,
      deepAnalysisModel: DEFAULT_SELECTABLE_MODEL_ID,
    });
  });

  it("keeps Luna when Vercel OIDC exists but the rollout gate is off", () => {
    expect(getPdfExtractionModelConfig({
      AI_MODEL_GATEWAY_ENABLED: "0",
      VERCEL_OIDC_TOKEN: "vercel-oidc-token",
    })).toEqual({
      quickExtractModel: DEFAULT_SELECTABLE_MODEL_ID,
      deepAnalysisModel: DEFAULT_SELECTABLE_MODEL_ID,
    });
  });

  it("uses Flash for quick extraction and Pro for deep analysis once the gateway is configured", () => {
    expect(getPdfExtractionModelConfig({
      AI_MODEL_GATEWAY_ENABLED: "1",
      AI_MODEL_GATEWAY_API_KEY: "configured",
    })).toEqual({
      quickExtractModel: DEFAULT_PDF_QUICK_EXTRACT_MODEL,
      deepAnalysisModel: DEFAULT_PDF_DEEP_ANALYSIS_MODEL,
    });
  });

  it("does not treat Vercel OIDC as valid for a custom gateway base URL", () => {
    expect(getPdfExtractionModelConfig({
      AI_MODEL_GATEWAY_ENABLED: "1",
      AI_MODEL_GATEWAY_BASE_URL: "https://third-party.example/v1",
      VERCEL_OIDC_TOKEN: "vercel-oidc-token",
    })).toEqual({
      quickExtractModel: DEFAULT_SELECTABLE_MODEL_ID,
      deepAnalysisModel: DEFAULT_SELECTABLE_MODEL_ID,
    });
  });

  it("enables only explicitly mapped PDF stages on a custom gateway", () => {
    expect(getPdfExtractionModelConfig({
      AI_MODEL_GATEWAY_ENABLED: "1",
      AI_MODEL_GATEWAY_API_KEY: "custom-key",
      AI_MODEL_GATEWAY_BASE_URL: "https://api.deepseek.com",
      AI_GATEWAY_DEEPSEEK_V4_FLASH_MODEL: "deepseek-v4-flash",
    })).toEqual({
      quickExtractModel: DEFAULT_PDF_QUICK_EXTRACT_MODEL,
      deepAnalysisModel: DEFAULT_SELECTABLE_MODEL_ID,
    });
  });

  it("allows one shared override for both PDF extraction stages", () => {
    expect(getPdfExtractionModelConfig({
      AI_PDF_EXTRACTION_MODEL: "gpt-5.6-terra",
    })).toEqual({
      quickExtractModel: "gpt-5.6-terra",
      deepAnalysisModel: "gpt-5.6-terra",
    });
  });

  it("lets stage-specific overrides take precedence over the shared override", () => {
    expect(getPdfExtractionModelConfig({
      AI_PDF_EXTRACTION_MODEL: "gpt-5.6-terra",
      AI_PDF_QUICK_EXTRACT_MODEL: "qwen3.7-plus",
      AI_PDF_DEEP_ANALYSIS_MODEL: "gpt-5.6-sol",
    })).toEqual({
      quickExtractModel: "qwen3.7-plus",
      deepAnalysisModel: "gpt-5.6-sol",
    });
  });

  it("rejects upstream slugs and retired IDs instead of blessing an unroutable override", () => {
    expect(() => getPdfExtractionModelConfig({
      AI_PDF_EXTRACTION_MODEL: "deepseek/deepseek-v4-pro",
    })).toThrow(/stable Papilab model ID/);
    expect(() => getPdfExtractionModelConfig({
      AI_PDF_QUICK_EXTRACT_MODEL: "grok-4-1-fast",
    })).toThrow(/stable Papilab model ID/);
  });
});
