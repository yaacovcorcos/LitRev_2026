"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getProtocolAction, saveProtocolAction } from "@/app/actions/protocols";
import {
  buildWorkflowOrientationAction,
  decomposePicoAction,
  deriveOnboardingProfileAction,
  finalClarificationAction,
  generateCriteriaAction,
  markProjectOnboardingCompletedAction,
  previewStrategyAction,
  saveProjectOnboardingProgressAction,
  suggestQuestionsAction,
  validateSetupAction,
} from "@/app/actions/onboarding";
import { useProjects } from "@/contexts/ProjectsContext";
import { EmptyState, EmptyStateSkeleton } from "@/components/ui/EmptyState";
import { createDefaultProtocolData, type ProtocolData } from "@/types/protocol";
import { mirrorGuidedSetupCompleted } from "@/lib/demo/onboarding";
import type {
  ClarificationQuestion,
  CriteriaResult,
  OnboardingDerivedProfile,
  StrategyPreviewResult,
  SuggestQuestionsResult,
  ValidateSetupResult,
  WorkflowOrientationResult,
} from "@/lib/server/onboarding-ai";
import styles from "./onboarding.module.css";

type StepId = "topicQuestion" | "pico" | "criteria" | "strategy" | "workflow" | "launch";
type StepStatus = "pending" | "completed" | "skipped";

const STEPS: Array<{ id: StepId; label: string; short: string }> = [
  { id: "topicQuestion", label: "Topic & Question", short: "Question" },
  { id: "pico", label: "PICO Builder", short: "PICO" },
  { id: "criteria", label: "Criteria", short: "Criteria" },
  { id: "strategy", label: "Strategy Preview", short: "Strategy" },
  { id: "workflow", label: "Workflow Orientation", short: "Workflow" },
  { id: "launch", label: "Launch Gate", short: "Launch" },
];

const DEFAULT_STEP_STATUSES: Record<StepId, StepStatus> = {
  topicQuestion: "pending",
  pico: "pending",
  criteria: "pending",
  strategy: "pending",
  workflow: "pending",
  launch: "pending",
};

const EXPLAINERS: Record<StepId, { title: string; body: string }> = {
  topicQuestion: {
    title: "Question quality",
    body: "A draft question is enough. Start broad if needed; you will refine after the first evidence pass.",
  },
  pico: {
    title: "PICO / PICo / SPIDER",
    body: "Use PICO cards as scaffolding. Missing fields are allowed now and can be tightened later.",
  },
  criteria: {
    title: "Criteria logic",
    body: "Criteria control screening quality. Keep inclusion and exclusion explicit and non-overlapping.",
  },
  strategy: {
    title: "Search tradeoffs",
    body: "Precision reduces noise; recall finds more studies. Balanced is usually the best first pass.",
  },
  workflow: {
    title: "Workflow map",
    body: "LitRev flow is Protocol → Search → Screen → Draft → QA. Setup should make that first transition easy.",
  },
  launch: {
    title: "Final checks",
    body: "Launch gate validates essentials only. You do not need a perfect final protocol to start working.",
  },
};

function sanitizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function asPercent(current: number, total: number): number {
  if (total <= 1) return 100;
  return Math.round((current / (total - 1)) * 100);
}

type ActionResultLike<T> = { success: boolean; data?: T; error?: string };

export default function ProjectOnboardingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getProjectById, isInitialized, isLoadingProjects, projectsError } = useProjects();
  const project = id ? getProjectById(id) : undefined;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunningAI, setIsRunningAI] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<Record<StepId, StepStatus>>(DEFAULT_STEP_STATUSES);
  const [protocol, setProtocol] = useState<ProtocolData>(createDefaultProtocolData);
  const [topicText, setTopicText] = useState("");
  const [domainText, setDomainText] = useState("");
  const [questionSuggestions, setQuestionSuggestions] = useState<SuggestQuestionsResult | null>(null);
  const [criteriaSuggestions, setCriteriaSuggestions] = useState<CriteriaResult | null>(null);
  const [strategyPreview, setStrategyPreview] = useState<StrategyPreviewResult | null>(null);
  const [workflowOrientation, setWorkflowOrientation] = useState<WorkflowOrientationResult | null>(null);
  const [validation, setValidation] = useState<ValidateSetupResult | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationQuestion[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [derivedProfile, setDerivedProfile] = useState<OnboardingDerivedProfile | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentStep = STEPS[stepIndex];
  const progressPercent = asPercent(stepIndex, STEPS.length);

  useEffect(() => {
    let isActive = true;
    if (!id) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const result = await getProtocolAction(id);
        if (!isActive) return;
        if (result.success && result.data) {
          setProtocol(result.data);
          setTopicText(result.data.researchQuestion);
        } else {
          const defaults = createDefaultProtocolData();
          setProtocol(defaults);
          setTopicText(defaults.researchQuestion);
        }
      } catch (err) {
        console.error("Failed to load protocol for onboarding", err);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void load();
    return () => {
      isActive = false;
    };
  }, [id]);

  const hydratedProtocol = useMemo(() => protocol, [protocol]);

  const updateStepStatus = useCallback((stepId: StepId, status: StepStatus) => {
    setStepStatuses((prev) => ({ ...prev, [stepId]: status }));
  }, []);

  const persistProgress = useCallback(async (): Promise<boolean> => {
    if (!id) return false;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const saveProtocolResult = await saveProtocolAction(id, hydratedProtocol);
      if (!saveProtocolResult.success) throw new Error(saveProtocolResult.error);

      const profileResult = await deriveOnboardingProfileAction(hydratedProtocol);
      const nextProfile = profileResult.success ? profileResult.data : derivedProfile;
      if (profileResult.success) setDerivedProfile(profileResult.data);

      const onboardingResult = await saveProjectOnboardingProgressAction(id, {
        stepStatuses,
        derivedProfile: nextProfile ?? null,
      });
      if (!onboardingResult.success) throw new Error(onboardingResult.error);
      return true;
    } catch (error) {
      console.error("Failed to persist onboarding progress", error);
      setErrorMessage("Could not save setup progress. You can continue editing and retry.");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [id, hydratedProtocol, stepStatuses, derivedProfile]);

  const runAI = useCallback(async <T,>(task: string, fn: () => Promise<ActionResultLike<T>>) => {
    setIsRunningAI(true);
    setStatusMessage(task);
    setErrorMessage(null);
    try {
      const result = await fn();
      if (!result.success || result.data === undefined) {
        throw new Error(result.error || "AI action failed.");
      }
      return result.data;
    } catch (error) {
      console.error(task, error);
      setErrorMessage("AI assist is unavailable right now. You can continue manually.");
      return null;
    } finally {
      setIsRunningAI(false);
      setStatusMessage(null);
    }
  }, []);

  const handleQuickSetup = useCallback(async () => {
    const questionResult = await runAI("Generating question options…", () =>
      suggestQuestionsAction(topicText || protocol.researchQuestion),
    );
    if (questionResult?.candidates?.[1]?.question) {
      setQuestionSuggestions(questionResult);
      setProtocol((prev) => ({ ...prev, researchQuestion: questionResult.candidates[1].question }));
      updateStepStatus("topicQuestion", "completed");
    }

    const questionValue = questionResult?.candidates?.[1]?.question || protocol.researchQuestion || topicText;

    const picoResult = await runAI("Decomposing PICO…", () => decomposePicoAction(questionValue, domainText));
    if (picoResult?.pico) {
      setProtocol((prev) => ({ ...prev, pico: picoResult.pico }));
      updateStepStatus("pico", "completed");
    }

    const picoValue = picoResult?.pico || protocol.pico;

    const criteriaResult = await runAI("Generating criteria…", () =>
      generateCriteriaAction(questionValue, picoValue),
    );
    if (criteriaResult) {
      setCriteriaSuggestions(criteriaResult);
      setProtocol((prev) => ({
        ...prev,
        eligibility: {
          inclusion: sanitizeList(criteriaResult.inclusion.map((item) => item.text)),
          exclusion: sanitizeList(criteriaResult.exclusion.map((item) => item.text)),
        },
      }));
      updateStepStatus("criteria", "completed");
    }

    const criteriaValue = criteriaResult
      ? {
          inclusion: sanitizeList(criteriaResult.inclusion.map((item) => item.text)),
          exclusion: sanitizeList(criteriaResult.exclusion.map((item) => item.text)),
        }
      : protocol.eligibility;

    const strategyResult = await runAI("Building strategy preview…", () =>
      previewStrategyAction(questionValue, picoValue, criteriaValue),
    );
    if (strategyResult) {
      setStrategyPreview(strategyResult);
      const balanced = strategyResult.variants.find((variant) => variant.mode === "balanced") || strategyResult.variants[0];
      if (balanced) {
        setProtocol((prev) => ({
          ...prev,
          searchStrategy: {
            query: balanced.query,
            databases: balanced.databases,
          },
        }));
      }
      updateStepStatus("strategy", "completed");
    }

    const workflowResult = await runAI("Preparing workflow orientation…", () =>
      buildWorkflowOrientationAction(
        questionValue,
        picoValue,
        criteriaValue,
        strategyResult || { variants: [], expectedVolume: "", provenance: "" },
      ),
    );
    if (workflowResult) {
      setWorkflowOrientation(workflowResult);
      updateStepStatus("workflow", "completed");
    }

    setStepIndex(STEPS.length - 1);
  }, [
    runAI,
    topicText,
    protocol.researchQuestion,
    protocol.pico,
    protocol.eligibility,
    domainText,
    updateStepStatus,
  ]);

  const persistAndContinue = useCallback(
    async (nextRoute: string) => {
      if (!id) return;
      const saved = await persistProgress();
      if (!saved) return;

      setIsSaving(true);
      try {
        const markResult = await markProjectOnboardingCompletedAction(id, { skipped: false });
        if (!markResult.success) throw new Error(markResult.error);
        mirrorGuidedSetupCompleted(id);
        router.push(nextRoute);
      } catch (err) {
        console.error("Failed to complete onboarding", err);
      } finally {
        setIsSaving(false);
      }
    },
    [id, persistProgress, router],
  );

  if (!isInitialized || isLoadingProjects) {
    return <EmptyStateSkeleton className={styles.notFound} />;
  }

  if (projectsError) {
    return (
      <EmptyState
        variant="error"
        icon="cloud_off"
        title="Unable to load project"
        description={projectsError}
        primaryAction={{ label: "Retry", onClick: () => window.location.reload() }}
        secondaryAction={{ label: "Back to Dashboard", href: "/" }}
        className={styles.notFound}
      />
    );
  }

  if (!project) {
    return (
      <EmptyState
        variant="error"
        icon="folder_off"
        title="Project not found"
        description="This project may have been deleted or you don't have access."
        primaryAction={{ label: "Back to Dashboard", href: "/" }}
        className={styles.notFound}
      />
    );
  }

  const renderStepBody = () => {
    if (currentStep.id === "topicQuestion") {
      return (
        <div className={styles.stepBody}>
          <label className={styles.label} htmlFor="topic-input">Topic / rough intent</label>
          <input
            id="topic-input"
            className={styles.input}
            value={topicText}
            onChange={(event) => setTopicText(event.target.value)}
            placeholder="Example: yoga and anxiety in adults"
          />
          <label className={styles.label} htmlFor="question-input">Draft research question</label>
          <textarea
            id="question-input"
            className={styles.textarea}
            rows={4}
            value={protocol.researchQuestion}
            onChange={(event) => setProtocol((prev) => ({ ...prev, researchQuestion: event.target.value }))}
          />
          <button
            type="button"
            className="btn btn-outline"
            disabled={isRunningAI}
            onClick={async () => {
              const result = await runAI("Generating question suggestions…", () =>
                suggestQuestionsAction(topicText || protocol.researchQuestion),
              );
              if (result) setQuestionSuggestions(result);
            }}
          >
            Suggest with AI
          </button>
          {questionSuggestions?.candidates?.length ? (
            <div className={styles.suggestionGrid}>
              {questionSuggestions.candidates.map((candidate) => (
                <article key={candidate.id} className={styles.suggestionCard}>
                  <p className={styles.suggestionMeta}>{candidate.variant} · {candidate.confidence} confidence</p>
                  <p>{candidate.question}</p>
                  <small>{candidate.rationale}</small>
                  <div className={styles.suggestionActions}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setProtocol((prev) => ({ ...prev, researchQuestion: candidate.question }))}
                    >
                      Use
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (currentStep.id === "pico") {
      return (
        <div className={styles.stepBody}>
          <label className={styles.label} htmlFor="domain-input">Domain context</label>
          <input
            id="domain-input"
            className={styles.input}
            value={domainText}
            onChange={(event) => setDomainText(event.target.value)}
            placeholder="Clinical, public health, education, etc."
          />
          <div className={styles.picoGrid}>
            {([
              ["population", "Population"],
              ["intervention", "Intervention / Exposure"],
              ["comparison", "Comparator"],
              ["outcome", "Outcome"],
            ] as const).map(([key, label]) => (
              <label key={key} className={styles.picoCard}>
                <span>{label}</span>
                <textarea
                  rows={3}
                  className={styles.textarea}
                  value={protocol.pico[key]}
                  onChange={(event) =>
                    setProtocol((prev) => ({
                      ...prev,
                      pico: { ...prev.pico, [key]: event.target.value },
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-outline"
            disabled={isRunningAI}
            onClick={async () => {
              const result = await runAI("Decomposing question into PICO…", () =>
                decomposePicoAction(protocol.researchQuestion, domainText),
              );
              if (result) {
                setProtocol((prev) => ({ ...prev, pico: result.pico }));
                setStatusMessage(result.guidance);
              }
            }}
          >
            Decompose with AI
          </button>
        </div>
      );
    }

    if (currentStep.id === "criteria") {
      return (
        <div className={styles.stepBody}>
          <div className={styles.grid}>
            <div>
              <label className={styles.label}>Inclusion criteria</label>
              <textarea
                className={styles.textarea}
                rows={7}
                value={protocol.eligibility.inclusion.join("\n")}
                onChange={(event) =>
                  setProtocol((prev) => ({
                    ...prev,
                    eligibility: {
                      ...prev.eligibility,
                      inclusion: sanitizeList(event.target.value.split("\n")),
                    },
                  }))
                }
              />
            </div>
            <div>
              <label className={styles.label}>Exclusion criteria</label>
              <textarea
                className={styles.textarea}
                rows={7}
                value={protocol.eligibility.exclusion.join("\n")}
                onChange={(event) =>
                  setProtocol((prev) => ({
                    ...prev,
                    eligibility: {
                      ...prev.eligibility,
                      exclusion: sanitizeList(event.target.value.split("\n")),
                    },
                  }))
                }
              />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            disabled={isRunningAI}
            onClick={async () => {
              const result = await runAI("Generating criteria with rationale…", () =>
                generateCriteriaAction(protocol.researchQuestion, protocol.pico),
              );
              if (result) {
                setCriteriaSuggestions(result);
                setProtocol((prev) => ({
                  ...prev,
                  eligibility: {
                    inclusion: sanitizeList(result.inclusion.map((item) => item.text)),
                    exclusion: sanitizeList(result.exclusion.map((item) => item.text)),
                  },
                }));
              }
            }}
          >
            Generate criteria with AI
          </button>
          {criteriaSuggestions?.ambiguityFlags?.length ? (
            <div className={styles.infoBox}>
              <strong>Ambiguity to review:</strong>
              <ul>
                {criteriaSuggestions.ambiguityFlags.map((flag) => <li key={flag}>{flag}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      );
    }

    if (currentStep.id === "strategy") {
      return (
        <div className={styles.stepBody}>
          <button
            type="button"
            className="btn btn-outline"
            disabled={isRunningAI}
            onClick={async () => {
              const result = await runAI("Previewing strategy variants…", () =>
                previewStrategyAction(protocol.researchQuestion, protocol.pico, protocol.eligibility),
              );
              if (result) setStrategyPreview(result);
            }}
          >
            Generate strategy preview
          </button>
          {strategyPreview?.variants?.length ? (
            <div className={styles.suggestionGrid}>
              {strategyPreview.variants.map((variant) => (
                <article key={variant.id} className={styles.suggestionCard}>
                  <p className={styles.suggestionMeta}>{variant.mode}</p>
                  <p className={styles.query}>{variant.query}</p>
                  <p>{variant.databases.join(", ")}</p>
                  <small>{variant.tradeoff}</small>
                  <div className={styles.suggestionActions}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() =>
                        setProtocol((prev) => ({
                          ...prev,
                          searchStrategy: {
                            query: variant.query,
                            databases: variant.databases,
                          },
                        }))
                      }
                    >
                      Use
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    if (currentStep.id === "workflow") {
      return (
        <div className={styles.stepBody}>
          <button
            type="button"
            className="btn btn-outline"
            disabled={isRunningAI}
            onClick={async () => {
              const result = await runAI("Building workflow orientation…", () =>
                buildWorkflowOrientationAction(
                  protocol.researchQuestion,
                  protocol.pico,
                  protocol.eligibility,
                  strategyPreview || { variants: [], expectedVolume: "", provenance: "" },
                ),
              );
              if (result) setWorkflowOrientation(result);
            }}
          >
            Build orientation
          </button>
          <div className={styles.orientationMap}>
            {("Protocol,Search,Screen,Draft,QA".split(",") as string[]).map((stage) => (
              <span key={stage} className={styles.stageChip}>{stage}</span>
            ))}
          </div>
          {workflowOrientation ? (
            <div className={styles.infoBox}>
              <p><strong>Recommended next action:</strong> {workflowOrientation.personalizedNextAction}</p>
              <p>{workflowOrientation.whyThisOrder}</p>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className={styles.stepBody}>
        <div className={styles.launchActions}>
          <button
            type="button"
            className="btn btn-outline"
            disabled={isRunningAI}
            onClick={async () => {
              const result = await runAI("Running launch validation…", () => validateSetupAction(protocol));
              if (result) setValidation(result);
            }}
          >
            Run launch checks
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={isRunningAI}
            onClick={async () => {
              const result = await runAI("Preparing final clarifications…", () =>
                finalClarificationAction(protocol, derivedProfile),
              );
              if (result) setClarifications(result.questions);
            }}
          >
            Ask final clarifications
          </button>
        </div>

        {validation ? (
          <div className={styles.validationList}>
            {validation.checks.map((check) => (
              <div key={check.id} className={`${styles.validationItem} ${check.passed ? styles.passed : styles.failed}`}>
                <strong>{check.passed ? "Pass" : "Missing"}</strong>
                <span>{check.label}</span>
                <small>{check.detail}</small>
              </div>
            ))}
          </div>
        ) : null}

        {clarifications.length > 0 ? (
          <div className={styles.clarificationList}>
            {clarifications.map((clarification) => (
              <fieldset key={clarification.id} className={styles.clarificationCard}>
                <legend>{clarification.question}</legend>
                <p>{clarification.reason}</p>
                {clarification.options.map((option) => (
                  <label key={option} className={styles.choiceRow}>
                    <input
                      type="radio"
                      name={clarification.id}
                      checked={clarificationAnswers[clarification.id] === option}
                      onChange={() =>
                        setClarificationAnswers((prev) => ({
                          ...prev,
                          [clarification.id]: option,
                        }))
                      }
                    />
                    {option}
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>Guided Setup</p>
          <h1 className={styles.title}>{project.name}</h1>
          <p className={styles.subtitle}>
            AI-guided setup to get you working quickly. Draft answers are expected and editable later.
          </p>
          <div className={styles.progressMeta}>
            <span>Step {stepIndex + 1} of {STEPS.length}</span>
            <span>{progressPercent}% complete</span>
          </div>
          <div className={styles.progressTrack} aria-hidden="true">
            <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`btn btn-primary ${styles.quickSetupBtn}`}
            disabled={isRunningAI || isSaving}
            onClick={handleQuickSetup}
          >
            {isRunningAI ? "Running Quick Setup..." : "Quick setup"}
          </button>
          <button
            type="button"
            className={`btn btn-outline ${styles.skipBtn}`}
            disabled={isSaving}
            onClick={async () => {
              if (!id) return;
              updateStepStatus(currentStep.id, "skipped");
              const saved = await persistProgress();
              if (!saved) return;
              const skipResult = await markProjectOnboardingCompletedAction(id, { skipped: true });
              if (!skipResult.success) {
                setErrorMessage(skipResult.error || "Failed to skip onboarding.");
                return;
              }
              mirrorGuidedSetupCompleted(id);
              router.push(`/project/${id}`);
            }}
          >
            Skip to workspace
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.stepRail} aria-label="Onboarding steps">
          <ol className={styles.stepper}>
            {STEPS.map((step, index) => (
              <li key={step.id}>
                <button
                  type="button"
                  className={`${styles.stepBtn} ${index === stepIndex ? styles.stepActive : ""}`}
                  onClick={() => setStepIndex(index)}
                >
                  <span className={styles.stepIndex}>{index + 1}</span>
                  <span>
                    <span className={styles.stepLabel}>{step.short}</span>
                    <span className={styles.stepStatus}>{stepStatuses[step.id]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        {isLoading ? (
          <div className={styles.loadingCard}>Preparing your onboarding workspace...</div>
        ) : (
          <section className={styles.card}>
            <h2>{currentStep.label}</h2>
            <p className={styles.helpText}>Use AI suggestions or fill manually — both paths are first-class.</p>
            {renderStepBody()}

            {statusMessage ? <p className={styles.statusMessage}>{statusMessage}</p> : null}
            {errorMessage ? <p className={styles.errorMessage} role="alert">{errorMessage}</p> : null}

            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn-outline"
                disabled={stepIndex === 0 || isSaving}
                onClick={async () => {
                  const saved = await persistProgress();
                  if (!saved) return;
                  setStepIndex((prev) => Math.max(0, prev - 1));
                }}
              >
                Back
              </button>

              {stepIndex < STEPS.length - 1 ? (
                <button
                  type="button"
                  className={`btn btn-primary ${styles.primaryActionBtn}`}
                  disabled={isSaving}
                  onClick={async () => {
                    updateStepStatus(currentStep.id, "completed");
                    const saved = await persistProgress();
                    if (!saved) return;
                    setStepIndex((prev) => Math.min(STEPS.length - 1, prev + 1));
                  }}
                >
                  {isSaving ? "Saving..." : "Continue"}
                </button>
              ) : (
                <div className={styles.finalActions}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={isSaving}
                    onClick={() => persistAndContinue(`/project/${id}`)}
                  >
                    {isSaving ? "Saving..." : "Save and open conversation"}
                  </button>
                  <button
                    type="button"
                    className={`btn btn-primary ${styles.primaryActionBtn}`}
                    disabled={isSaving || (validation ? !validation.passed : false)}
                    onClick={() => persistAndContinue(`/project/${id}/protocol`)}
                  >
                    {isSaving ? "Saving..." : "Launch to Protocol"}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        <aside className={styles.contextPanel}>
          <h3>Why this matters</h3>
          <p><strong>{EXPLAINERS[currentStep.id].title}</strong></p>
          <p>{EXPLAINERS[currentStep.id].body}</p>
          <div className={styles.panelSummary}>
            <p><strong>Current draft:</strong></p>
            <ul>
              <li>Question: {protocol.researchQuestion.trim() ? "Set" : "Drafting"}</li>
              <li>PICO cards: {Object.values(protocol.pico).filter((value) => value.trim()).length}/4</li>
              <li>Criteria: {protocol.eligibility.inclusion.length} in / {protocol.eligibility.exclusion.length} ex</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
