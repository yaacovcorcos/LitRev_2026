import type { Study, StudyProcessingPhase, StudyProcessingPhaseSnapshot, StudyProcessingSnapshot } from "@/types/ledger";

export type StudyProcessingTone = "neutral" | "info" | "success" | "warning" | "danger";

export type StudyProcessingStatusView = {
  label: string;
  description: string;
  tone: StudyProcessingTone;
  currentPhase?: StudyProcessingPhase;
  currentPhaseSnapshot: StudyProcessingPhaseSnapshot;
  isActive: boolean;
  canRetry: boolean;
};

function getFailedMessage(snapshot: StudyProcessingPhaseSnapshot): string {
  if (snapshot.lastErrorCode === "EXTRACTION_IN_PROGRESS") {
    return "Extraction is already running for this study.";
  }

  if (
    snapshot.lastErrorCode === "PDF_PARSE_FAILED" &&
    typeof snapshot.lastErrorMessage === "string" &&
    /insufficient text|scanned|image/i.test(snapshot.lastErrorMessage)
  ) {
    return "This PDF appears scanned or image-only and could not be read automatically.";
  }

  if (snapshot.lastErrorCode === "FILE_NOT_FOUND" || snapshot.lastErrorCode === "STORAGE_ERROR") {
    return "The uploaded file could not be loaded from storage. Retry.";
  }

  if (snapshot.lastErrorCode === "AI_FAILED") {
    return snapshot.phase === "deep_analysis"
      ? "The PDF was read, but AI analysis failed. Retry."
      : "The PDF was read, but AI extraction failed. Retry.";
  }

  if (snapshot.lastErrorCode === "PDF_TOO_LARGE") {
    return "This PDF is too large to process automatically.";
  }

  return snapshot.lastErrorMessage || "Processing failed. Retry.";
}

export function getStudyProcessingStatusView(study: Study): StudyProcessingStatusView {
  const processing = study.processing ?? {
    byPhase: {
      quickExtract: { phase: "quick_extract", state: study.status === "pending" ? "idle" : "succeeded", attemptCount: 0 },
      deepAnalysis: {
        phase: "deep_analysis",
        state: study.details?.deepAnalysisComplete ? "succeeded" : "idle",
        attemptCount: 0,
      },
    },
    currentState: "idle",
    nextAction: study.status === "pending" ? "extract" : study.details?.deepAnalysisComplete ? "none" : "analyze",
    prerequisitesSatisfied: { deepAnalysis: study.status !== "pending" },
  } satisfies StudyProcessingSnapshot;

  const quickExtract = processing.byPhase.quickExtract;
  const deepAnalysis = processing.byPhase.deepAnalysis;
  const currentPhase = processing.currentPhase;
  const currentSnapshot = currentPhase === "deep_analysis" ? deepAnalysis : quickExtract;

  if (quickExtract.state === "queued") {
    return {
      label: "Queued",
      description: "Waiting to start extraction on the server.",
      tone: "info",
      currentPhase: "quick_extract",
      currentPhaseSnapshot: quickExtract,
      isActive: true,
      canRetry: false,
    };
  }

  if (quickExtract.state === "running") {
    return {
      label: "Extracting",
      description: "Reading the PDF on the server.",
      tone: "info",
      currentPhase: "quick_extract",
      currentPhaseSnapshot: quickExtract,
      isActive: true,
      canRetry: false,
    };
  }

  if (quickExtract.state === "failed") {
    return {
      label: "Needs retry",
      description: getFailedMessage(quickExtract),
      tone: "danger",
      currentPhase: "quick_extract",
      currentPhaseSnapshot: quickExtract,
      isActive: false,
      canRetry: true,
    };
  }

  if (deepAnalysis.state === "queued") {
    return {
      label: "Queued",
      description: "Waiting to start deep analysis on the server.",
      tone: "info",
      currentPhase: "deep_analysis",
      currentPhaseSnapshot: deepAnalysis,
      isActive: true,
      canRetry: false,
    };
  }

  if (deepAnalysis.state === "running") {
    return {
      label: "Analyzing",
      description: "Generating summary, keywords, and quality signals.",
      tone: "info",
      currentPhase: "deep_analysis",
      currentPhaseSnapshot: deepAnalysis,
      isActive: true,
      canRetry: false,
    };
  }

  if (deepAnalysis.state === "failed") {
    return {
      label: "Needs retry",
      description: getFailedMessage(deepAnalysis),
      tone: "danger",
      currentPhase: "deep_analysis",
      currentPhaseSnapshot: deepAnalysis,
      isActive: false,
      canRetry: true,
    };
  }

  if (quickExtract.state === "succeeded" && deepAnalysis.state === "idle") {
    return {
      label: "Ready for analysis",
      description: "Extraction is complete. Deep analysis is available.",
      tone: "success",
      currentPhase: currentPhase,
      currentPhaseSnapshot: currentSnapshot,
      isActive: false,
      canRetry: false,
    };
  }

  if (quickExtract.state === "succeeded" && deepAnalysis.state === "succeeded") {
    return {
      label: "Done",
      description: "Extraction and deep analysis are complete.",
      tone: "success",
      currentPhase: currentPhase,
      currentPhaseSnapshot: currentSnapshot,
      isActive: false,
      canRetry: false,
    };
  }

  return {
    label: "PDF uploaded",
    description: "Ready to start extraction.",
    tone: "neutral",
    currentPhase: currentPhase,
    currentPhaseSnapshot: currentSnapshot,
    isActive: false,
    canRetry: false,
  };
}

export function isStudyProcessingActive(study: Study) {
  const processing = study.processing;
  if (!processing) return false;
  return (
    processing.byPhase.quickExtract.state === "queued" ||
    processing.byPhase.quickExtract.state === "running" ||
    processing.byPhase.deepAnalysis.state === "queued" ||
    processing.byPhase.deepAnalysis.state === "running"
  );
}
