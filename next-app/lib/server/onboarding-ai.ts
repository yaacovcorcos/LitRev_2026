import "server-only";

import type { ProtocolData, PICOData, EligibilityData } from "@/types/protocol";
import type { AIMessage } from "@/types/ai";
import { getAIService } from "@/lib/server/ai/ai-service";
import { getBackgroundModel } from "@/lib/server/ai/background-model-policy";

const ONBOARDING_MODEL = () => getBackgroundModel("fast");

export type OnboardingDerivedProfile = {
  strictness: "low" | "moderate" | "high";
  timelinePressure: "low" | "medium" | "high";
  recallVsPrecision: "recall" | "balanced" | "precision";
  evidenceDepth: "rapid" | "standard" | "comprehensive";
};

export type QuestionCandidate = {
  id: string;
  variant: "broad" | "balanced" | "narrow";
  question: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
};

export type SuggestQuestionsResult = {
  candidates: QuestionCandidate[];
  provenance: string;
};

export type PicoResult = {
  framework: "PICO" | "PICo" | "SPIDER";
  pico: PICOData;
  guidance: string;
  provenance: string;
};

export type CriteriaItem = {
  text: string;
  rationale: string;
};

export type CriteriaResult = {
  inclusion: CriteriaItem[];
  exclusion: CriteriaItem[];
  ambiguityFlags: string[];
  provenance: string;
};

export type StrategyVariant = {
  id: string;
  mode: "precision" | "balanced" | "recall";
  query: string;
  databases: string[];
  tradeoff: string;
};

export type StrategyPreviewResult = {
  variants: StrategyVariant[];
  expectedVolume: string;
  provenance: string;
};

export type WorkflowOrientationResult = {
  stages: Array<"Protocol" | "Search" | "Screen" | "Draft" | "QA">;
  personalizedNextAction: string;
  whyThisOrder: string;
  provenance: string;
};

export type ValidationCheck = {
  id:
    | "question"
    | "pico_population"
    | "pico_outcome"
    | "inclusion_count"
    | "exclusion_count"
    | "contradictions";
  label: string;
  passed: boolean;
  detail: string;
};

export type ValidateSetupResult = {
  passed: boolean;
  checks: ValidationCheck[];
  missing: string[];
  contradictions: string[];
  provenance: string;
};

export type ClarificationQuestion = {
  id: string;
  question: string;
  topic: string;
  options: string[];
  reason: string;
};

export type FinalClarificationResult = {
  questions: ClarificationQuestion[];
  provenance: string;
};

function nowIso() {
  return new Date().toISOString();
}

function asLines(input: string[]): string[] {
  return input.map((entry) => entry.trim()).filter(Boolean);
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeProfile(profile: Partial<OnboardingDerivedProfile> | null | undefined): OnboardingDerivedProfile {
  const strictness = profile?.strictness;
  const timelinePressure = profile?.timelinePressure;
  const recallVsPrecision = profile?.recallVsPrecision;
  const evidenceDepth = profile?.evidenceDepth;

  return {
    strictness: strictness === "low" || strictness === "high" ? strictness : "moderate",
    timelinePressure:
      timelinePressure === "low" || timelinePressure === "high" ? timelinePressure : "medium",
    recallVsPrecision:
      recallVsPrecision === "recall" || recallVsPrecision === "precision" ? recallVsPrecision : "balanced",
    evidenceDepth:
      evidenceDepth === "rapid" || evidenceDepth === "comprehensive" ? evidenceDepth : "standard",
  };
}

async function runStructuredPrompt<T>(params: {
  system: string;
  userPayload: unknown;
  fallback: () => T;
}): Promise<T> {
  const aiService = getAIService();
  const messages: AIMessage[] = [
    {
      id: crypto.randomUUID(),
      role: "system",
      content: `${params.system}\nReturn strict JSON only. No markdown.`,
      createdAt: nowIso(),
    },
    {
      id: crypto.randomUUID(),
      role: "user",
      content: JSON.stringify(params.userPayload),
      createdAt: nowIso(),
    },
  ];

  try {
    const response = await aiService.chat(messages, {
      model: ONBOARDING_MODEL(),
      reasoningEffort: "fast",
      temperature: 0.2,
      maxTokens: 700,
    });
    const parsed = extractJsonObject(response.content);
    if (!parsed || typeof parsed !== "object") return params.fallback();
    return parsed as T;
  } catch {
    return params.fallback();
  }
}

function inferProfileFromProtocol(data: ProtocolData): OnboardingDerivedProfile {
  const inclusion = data.eligibility.inclusion.length;
  const exclusion = data.eligibility.exclusion.length;
  const queryLen = data.searchStrategy.query.trim().length;

  const strictness: OnboardingDerivedProfile["strictness"] = inclusion + exclusion >= 8 ? "high" : inclusion + exclusion <= 2 ? "low" : "moderate";
  const timelinePressure: OnboardingDerivedProfile["timelinePressure"] = queryLen === 0 && inclusion <= 2 ? "high" : "medium";
  const recallVsPrecision: OnboardingDerivedProfile["recallVsPrecision"] =
    data.searchStrategy.query.includes(" OR ") && data.searchStrategy.query.includes("*")
      ? "recall"
      : data.searchStrategy.query.includes(" AND ")
        ? "balanced"
        : "precision";
  const evidenceDepth: OnboardingDerivedProfile["evidenceDepth"] = strictness === "high" ? "comprehensive" : strictness === "low" ? "rapid" : "standard";

  return { strictness, timelinePressure, recallVsPrecision, evidenceDepth };
}

export async function suggestQuestions(topicText: string): Promise<SuggestQuestionsResult> {
  const base = topicText.trim();
  const fallback: SuggestQuestionsResult = {
    candidates: [
      {
        id: crypto.randomUUID(),
        variant: "broad",
        question: `What is the overall effect of ${base || "the target intervention"} in the target population?`,
        rationale: "Broad framing helps identify the available evidence landscape early.",
        confidence: "medium",
      },
      {
        id: crypto.randomUUID(),
        variant: "balanced",
        question: `Among adults in the target population, how does ${base || "the intervention"} compare with standard care for key outcomes?`,
        rationale: "Balanced framing is usually easiest to operationalize into PICO and criteria.",
        confidence: "high",
      },
      {
        id: crypto.randomUUID(),
        variant: "narrow",
        question: `In adults meeting strict eligibility criteria, does ${base || "the intervention"} improve one primary outcome versus comparator?`,
        rationale: "Narrow framing is useful when you need a fast, precise review.",
        confidence: "medium",
      },
    ],
    provenance: "Derived from your topic text and common evidence-review question templates.",
  };

  const parsed = await runStructuredPrompt<SuggestQuestionsResult>({
    system:
      "You are onboarding a user for a systematic-review workspace. Generate exactly 3 candidate research questions with variants broad, balanced, narrow and confidence labels.",
    userPayload: { topicText: base },
    fallback: () => fallback,
  });

  if (!Array.isArray(parsed.candidates) || parsed.candidates.length === 0) return fallback;
  const candidates: QuestionCandidate[] = parsed.candidates
    .slice(0, 3)
    .map((candidate, index): QuestionCandidate => ({
      id: candidate.id || crypto.randomUUID(),
      variant:
        candidate.variant === "broad" || candidate.variant === "narrow"
          ? candidate.variant
          : index === 0
            ? "broad"
            : index === 2
              ? "narrow"
              : "balanced",
      question: String(candidate.question || "").trim(),
      rationale: String(candidate.rationale || "").trim(),
      confidence:
        candidate.confidence === "low" || candidate.confidence === "high"
          ? candidate.confidence
          : "medium",
    }))
    .filter((item) => item.question.length > 0);

  return {
    candidates,
    provenance: String(parsed.provenance || fallback.provenance),
  };
}

export async function decomposePico(researchQuestion: string, domain: string): Promise<PicoResult> {
  const fallback: PicoResult = {
    framework: "PICO",
    pico: {
      population: "Adults matching the target condition",
      intervention: "Primary intervention in the research question",
      comparison: "Usual care, placebo, or active comparator",
      outcome: "Primary clinically relevant outcome",
    },
    guidance: "Start with a draft PICO and refine after you inspect the first batch of studies.",
    provenance: "Derived from your draft question and default evidence-review decomposition.",
  };

  const parsed = await runStructuredPrompt<PicoResult>({
    system:
      "Decompose a draft research question into an onboarding-ready framework. Return framework (PICO/PICo/SPIDER), pico object and short guidance.",
    userPayload: { researchQuestion, domain },
    fallback: () => fallback,
  });

  return {
    framework: parsed.framework === "PICo" || parsed.framework === "SPIDER" ? parsed.framework : "PICO",
    pico: {
      population: String(parsed.pico?.population || fallback.pico.population),
      intervention: String(parsed.pico?.intervention || fallback.pico.intervention),
      comparison: String(parsed.pico?.comparison || fallback.pico.comparison),
      outcome: String(parsed.pico?.outcome || fallback.pico.outcome),
    },
    guidance: String(parsed.guidance || fallback.guidance),
    provenance: String(parsed.provenance || fallback.provenance),
  };
}

export async function generateCriteria(
  researchQuestion: string,
  pico: PICOData,
): Promise<CriteriaResult> {
  const fallback: CriteriaResult = {
    inclusion: [
      { text: "Population aligns with the target condition and age band", rationale: "Keeps selected studies aligned with your core question." },
      { text: "Reports at least one relevant outcome from the PICO outcome card", rationale: "Ensures extractable outcome evidence." },
    ],
    exclusion: [
      { text: "No comparator or outcome that maps to the review question", rationale: "Prevents weakly relevant studies from entering extraction." },
    ],
    ambiguityFlags: [],
    provenance: "Generated from your draft question and PICO cards.",
  };

  const parsed = await runStructuredPrompt<CriteriaResult>({
    system:
      "Generate inclusion and exclusion criteria for onboarding. Return inclusion[] and exclusion[] items with text and rationale plus ambiguityFlags[].",
    userPayload: { researchQuestion, pico },
    fallback: () => fallback,
  });

  const inclusion = Array.isArray(parsed.inclusion) ? parsed.inclusion : [];
  const exclusion = Array.isArray(parsed.exclusion) ? parsed.exclusion : [];

  return {
    inclusion: inclusion
      .map((item) => ({
        text: String(item.text || "").trim(),
        rationale: String(item.rationale || "").trim(),
      }))
      .filter((item) => item.text.length > 0)
      .slice(0, 8),
    exclusion: exclusion
      .map((item) => ({
        text: String(item.text || "").trim(),
        rationale: String(item.rationale || "").trim(),
      }))
      .filter((item) => item.text.length > 0)
      .slice(0, 8),
    ambiguityFlags: Array.isArray(parsed.ambiguityFlags) ? parsed.ambiguityFlags.map((f) => String(f).trim()).filter(Boolean) : [],
    provenance: String(parsed.provenance || fallback.provenance),
  };
}

export async function previewStrategy(
  researchQuestion: string,
  pico: PICOData,
  criteria: EligibilityData,
): Promise<StrategyPreviewResult> {
  const fallback: StrategyPreviewResult = {
    variants: [
      {
        id: crypto.randomUUID(),
        mode: "precision",
        query: `("${pico.population || "population"}") AND ("${pico.intervention || "intervention"}") AND ("${pico.outcome || "outcome"}")`,
        databases: ["PubMed", "Cochrane"],
        tradeoff: "High precision, lower recall.",
      },
      {
        id: crypto.randomUUID(),
        mode: "balanced",
        query: `(${pico.population || "population"}) AND (${pico.intervention || "intervention"}) AND (${pico.outcome || "outcome"} OR endpoint*)`,
        databases: ["PubMed", "Scopus", "Cochrane"],
        tradeoff: "Balanced recall and precision for first-pass screening.",
      },
      {
        id: crypto.randomUUID(),
        mode: "recall",
        query: `(${pico.population || "population"} OR subgroup*) AND (${pico.intervention || "intervention"} OR synonym*) AND (${pico.outcome || "outcome"} OR endpoint* OR marker*)`,
        databases: ["PubMed", "Scopus", "Web of Science", "Embase"],
        tradeoff: "Broader retrieval; more screening work.",
      },
    ],
    expectedVolume: "Expect low hundreds of records for the balanced strategy.",
    provenance: "Built from your question, PICO draft, and current criteria.",
  };

  const parsed = await runStructuredPrompt<StrategyPreviewResult>({
    system:
      "Generate three search strategy variants (precision, balanced, recall) with query, databases and tradeoff. Keep practical for onboarding.",
    userPayload: {
      researchQuestion,
      pico,
      criteria: {
        inclusion: asLines(criteria.inclusion).slice(0, 5),
        exclusion: asLines(criteria.exclusion).slice(0, 5),
      },
    },
    fallback: () => fallback,
  });

  const variants = Array.isArray(parsed.variants) ? parsed.variants : [];
  const normalized: StrategyVariant[] = variants
    .map((variant, index): StrategyVariant => ({
      id: String(variant.id || crypto.randomUUID()),
      mode:
        variant.mode === "precision" || variant.mode === "recall"
          ? variant.mode
          : index === 0
            ? "precision"
            : index === 2
              ? "recall"
              : "balanced",
      query: String(variant.query || "").trim(),
      databases: Array.isArray(variant.databases)
        ? variant.databases.map((db) => String(db).trim()).filter(Boolean).slice(0, 6)
        : [],
      tradeoff: String(variant.tradeoff || "").trim(),
    }))
    .filter((variant) => variant.query.length > 0);

  return {
    variants: normalized.length > 0 ? normalized : fallback.variants,
    expectedVolume: String(parsed.expectedVolume || fallback.expectedVolume),
    provenance: String(parsed.provenance || fallback.provenance),
  };
}

export async function buildWorkflowOrientation(
  researchQuestion: string,
  pico: PICOData,
  criteria: EligibilityData,
  strategyPreview: StrategyPreviewResult,
): Promise<WorkflowOrientationResult> {
  const fallback: WorkflowOrientationResult = {
    stages: ["Protocol", "Search", "Screen", "Draft", "QA"],
    personalizedNextAction:
      "Open Search next and run the balanced strategy first, then tighten criteria after the first 20 abstracts.",
    whyThisOrder:
      "Protocol locks intent, Search gathers candidates, Screening filters evidence, Draft synthesizes findings, QA verifies claims.",
    provenance: "Generated from your selected setup choices.",
  };

  const parsed = await runStructuredPrompt<WorkflowOrientationResult>({
    system:
      "Return onboarding workflow orientation with stage list, personalizedNextAction and whyThisOrder. Keep concise and actionable.",
    userPayload: {
      researchQuestion,
      pico,
      criteria,
      strategyPreview,
    },
    fallback: () => fallback,
  });

  return {
    stages: ["Protocol", "Search", "Screen", "Draft", "QA"],
    personalizedNextAction: String(parsed.personalizedNextAction || fallback.personalizedNextAction),
    whyThisOrder: String(parsed.whyThisOrder || fallback.whyThisOrder),
    provenance: String(parsed.provenance || fallback.provenance),
  };
}

function detectContradictions(data: ProtocolData): string[] {
  const contradictions: string[] = [];
  const inclusion = asLines(data.eligibility.inclusion).join(" ").toLowerCase();
  const exclusion = asLines(data.eligibility.exclusion).join(" ").toLowerCase();

  if (!inclusion || !exclusion) return contradictions;

  if (inclusion.includes("randomized") && exclusion.includes("randomized")) {
    contradictions.push("Criteria currently both include and exclude randomized studies.");
  }

  if (inclusion.includes("adult") && exclusion.includes("adult")) {
    contradictions.push("Criteria currently both include and exclude adults.");
  }

  return contradictions;
}

export async function validateSetup(fullProtocolSnapshot: ProtocolData): Promise<ValidateSetupResult> {
  const contradictions = detectContradictions(fullProtocolSnapshot);
  const checks: ValidationCheck[] = [
    {
      id: "question",
      label: "Research question is present",
      passed: fullProtocolSnapshot.researchQuestion.trim().length > 0,
      detail:
        fullProtocolSnapshot.researchQuestion.trim().length > 0
          ? "A draft question is present."
          : "Add at least one draft research question.",
    },
    {
      id: "pico_population",
      label: "PICO population is present",
      passed: fullProtocolSnapshot.pico.population.trim().length > 0,
      detail:
        fullProtocolSnapshot.pico.population.trim().length > 0
          ? "Population is set."
          : "Define the target population.",
    },
    {
      id: "pico_outcome",
      label: "PICO outcome is present",
      passed: fullProtocolSnapshot.pico.outcome.trim().length > 0,
      detail:
        fullProtocolSnapshot.pico.outcome.trim().length > 0
          ? "Outcome is set."
          : "Define at least one core outcome.",
    },
    {
      id: "inclusion_count",
      label: "At least 2 inclusion criteria",
      passed: asLines(fullProtocolSnapshot.eligibility.inclusion).length >= 2,
      detail:
        asLines(fullProtocolSnapshot.eligibility.inclusion).length >= 2
          ? "Inclusion criteria threshold met."
          : "Add at least two inclusion criteria.",
    },
    {
      id: "exclusion_count",
      label: "At least 1 exclusion criterion",
      passed: asLines(fullProtocolSnapshot.eligibility.exclusion).length >= 1,
      detail:
        asLines(fullProtocolSnapshot.eligibility.exclusion).length >= 1
          ? "Exclusion criterion threshold met."
          : "Add at least one exclusion criterion.",
    },
    {
      id: "contradictions",
      label: "No direct contradictions",
      passed: contradictions.length === 0,
      detail: contradictions.length === 0 ? "No high-signal contradictions detected." : contradictions[0],
    },
  ];

  const missing = checks.filter((check) => !check.passed).map((check) => check.detail);
  return {
    passed: missing.length === 0,
    checks,
    missing,
    contradictions,
    provenance: "Deterministic launch-gate rules over the full protocol snapshot.",
  };
}

export async function finalClarification(
  fullProtocolSnapshot: ProtocolData,
  derivedProfile: Partial<OnboardingDerivedProfile> | null,
): Promise<FinalClarificationResult> {
  const profile = normalizeProfile(derivedProfile ?? inferProfileFromProtocol(fullProtocolSnapshot));

  const defaultQuestions: ClarificationQuestion[] = [];
  if (profile.recallVsPrecision === "balanced") {
    defaultQuestions.push({
      id: "recall-vs-precision",
      question: "For your first search pass, should we prioritize broader recall or tighter precision?",
      topic: "Search",
      options: ["Prioritize recall", "Keep balanced", "Prioritize precision"],
      reason: "Your current setup is balanced; this choice sets screening workload expectations.",
    });
  }
  if (profile.timelinePressure !== "low") {
    defaultQuestions.push({
      id: "timeline",
      question: "What timeline do you want this first review cycle to target?",
      topic: "Timeline",
      options: ["Fast draft", "Standard pace", "Thorough pass"],
      reason: "Timeline pressure affects strictness and search breadth recommendations.",
    });
  }
  if (profile.strictness === "moderate") {
    defaultQuestions.push({
      id: "strictness",
      question: "How strict should screening be in the first pass?",
      topic: "Screening",
      options: ["Lenient first pass", "Balanced", "Strict from start"],
      reason: "Clarifies whether to include borderline studies for later review.",
    });
  }

  const parsed = await runStructuredPrompt<FinalClarificationResult>({
    system:
      "Produce 2-4 broad onboarding clarification questions with options for unresolved setup decisions. Keep concise.",
    userPayload: {
      fullProtocolSnapshot,
      derivedProfile: profile,
    },
    fallback: () => ({
      questions: defaultQuestions.slice(0, 4),
      provenance: "Derived from deterministic onboarding profile heuristics.",
    }),
  });

  const questions = Array.isArray(parsed.questions)
    ? parsed.questions
      .map((question) => ({
        id: String(question.id || crypto.randomUUID()),
        question: String(question.question || "").trim(),
        topic: String(question.topic || "Setup").trim(),
        options: Array.isArray(question.options)
          ? question.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 4)
          : [],
        reason: String(question.reason || "").trim(),
      }))
      .filter((question) => question.question.length > 0 && question.options.length >= 2)
      .slice(0, 4)
    : [];

  return {
    questions: questions.length > 0 ? questions : defaultQuestions.slice(0, 4),
    provenance: String(parsed.provenance || "Generated from unresolved setup decisions."),
  };
}

export function deriveOnboardingProfile(data: ProtocolData): OnboardingDerivedProfile {
  return inferProfileFromProtocol(data);
}
