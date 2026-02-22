"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getProtocolAction, saveProtocolAction } from "@/app/actions/protocols";
import {
  getGuidedSetupDefaultAction,
  markProjectOnboardingCompletedAction,
  setGuidedSetupDefaultAction,
} from "@/app/actions/onboarding";
import { useProjects } from "@/contexts/ProjectsContext";
import { createDefaultProtocolData, type ProtocolData } from "@/types/protocol";
import { mirrorGuidedSetupCompleted } from "@/lib/demo/onboarding";
import styles from "./onboarding.module.css";

const STEPS = ["Question", "Criteria", "Next"] as const;

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToLines(values: string[]): string {
  return values.join("\n");
}

export default function ProjectOnboardingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getProjectById, isInitialized } = useProjects();
  const project = id ? getProjectById(id) : undefined;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [protocol, setProtocol] = useState<ProtocolData>(createDefaultProtocolData);
  const [inclusionText, setInclusionText] = useState("");
  const [exclusionText, setExclusionText] = useState("");
  const [guidedDefaultEnabled, setGuidedDefaultEnabled] = useState(true);
  const [isUpdatingDefault, setIsUpdatingDefault] = useState(false);

  useEffect(() => {
    let isActive = true;
    if (!id) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const existing = await getProtocolAction(id);
        if (!isActive) return;
        if (existing) {
          setProtocol(existing);
          setInclusionText(listToLines(existing.eligibility.inclusion));
          setExclusionText(listToLines(existing.eligibility.exclusion));
        } else {
          const defaults = createDefaultProtocolData();
          setProtocol(defaults);
          setInclusionText(listToLines(defaults.eligibility.inclusion));
          setExclusionText(listToLines(defaults.eligibility.exclusion));
        }
      } catch (err) {
        console.error("Failed to load protocol for onboarding", err);
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    load();
    return () => {
      isActive = false;
    };
  }, [id]);

  useEffect(() => {
    let isActive = true;
    getGuidedSetupDefaultAction()
      .then((enabled) => {
        if (isActive) setGuidedDefaultEnabled(enabled);
      })
      .catch((err) => {
        console.error("Failed to load guided setup default", err);
      });
    return () => {
      isActive = false;
    };
  }, []);

  const hydratedProtocol = useMemo(() => {
    return {
      ...protocol,
      eligibility: {
        inclusion: linesToList(inclusionText),
        exclusion: linesToList(exclusionText),
      },
    } satisfies ProtocolData;
  }, [protocol, inclusionText, exclusionText]);

  const persistAndContinue = useCallback(
    async (nextRoute: string) => {
      if (!id) return;
      setIsSaving(true);
      try {
        await saveProtocolAction(id, hydratedProtocol);
        await markProjectOnboardingCompletedAction(id, { skipped: false });
        mirrorGuidedSetupCompleted(id);
        router.push(nextRoute);
      } catch (err) {
        console.error("Failed to save onboarding protocol", err);
      } finally {
        setIsSaving(false);
      }
    },
    [id, hydratedProtocol, router]
  );

  const persistProgress = useCallback(async (): Promise<boolean> => {
    if (!id) return false;
    setIsSaving(true);
    try {
      await saveProtocolAction(id, hydratedProtocol);
      return true;
    } catch (err) {
      console.error("Failed to save onboarding progress", err);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [id, hydratedProtocol]);

  if (!isInitialized) {
    return <div className={styles.loadingCard}>Loading project...</div>;
  }

  if (!project) {
    return (
      <div className={styles.notFound}>
        <h1>Project not found</h1>
        <Link href="/" className="btn-minimal">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Guided Setup</p>
          <h1 className={styles.title}>{project.name}</h1>
          <p className={styles.subtitle}>
            Quick-start your protocol in a few structured steps.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          disabled={isSaving || isUpdatingDefault}
          onClick={async () => {
            if (!id) return;
            const saved = await persistProgress();
            if (!saved) return;
            try {
              await markProjectOnboardingCompletedAction(id, { skipped: true });
              mirrorGuidedSetupCompleted(id);
              router.push(`/project/${id}`);
            } catch (err) {
              console.error("Failed to mark onboarding as skipped", err);
            }
          }}
        >
          Skip to conversation
        </button>
      </header>

      <div className={styles.defaultToggleRow}>
        <label className={styles.defaultToggleLabel}>
          <input
            type="checkbox"
            checked={guidedDefaultEnabled}
            disabled={isUpdatingDefault || isSaving}
            onChange={async (event) => {
              const nextValue = event.target.checked;
              setGuidedDefaultEnabled(nextValue);
              setIsUpdatingDefault(true);
              try {
                await setGuidedSetupDefaultAction(nextValue);
              } catch (err) {
                console.error("Failed to update guided setup default", err);
                setGuidedDefaultEnabled(!nextValue);
              } finally {
                setIsUpdatingDefault(false);
              }
            }}
          />
          <span>Use guided setup by default for new projects</span>
        </label>
      </div>

      <ol className={styles.stepper} aria-label="Onboarding steps">
        {STEPS.map((step, index) => (
          <li key={step} className={`${styles.step} ${index <= stepIndex ? styles.stepActive : ""}`}>
            {step}
          </li>
        ))}
      </ol>

      {isLoading ? (
        <div className={styles.loadingCard}>Preparing your onboarding workspace...</div>
      ) : (
        <section className={styles.card}>
          {stepIndex === 0 ? (
            <>
              <h2>What research question are you exploring?</h2>
              <p className={styles.helpText}>
                Keep this concise and answerable. You can refine it later in Protocol.
              </p>
              <textarea
                className={styles.textarea}
                rows={4}
                value={protocol.researchQuestion}
                onChange={(event) =>
                  setProtocol((prev) => ({ ...prev, researchQuestion: event.target.value }))
                }
                placeholder="Example: Does yoga reduce anxiety symptoms in adults compared with no treatment or active interventions?"
              />
              <div className={styles.infoBox}>
                This question becomes the anchor for screening, extraction, and drafting.
              </div>
            </>
          ) : null}

          {stepIndex === 1 ? (
            <>
              <h2>Define your first-pass criteria</h2>
              <p className={styles.helpText}>
                Editable starter criteria. One line per criterion.
              </p>
              <div className={styles.grid}>
                <div>
                  <label className={styles.label} htmlFor="inclusion-criteria">
                    Inclusion criteria
                  </label>
                  <textarea
                    id="inclusion-criteria"
                    className={styles.textarea}
                    rows={8}
                    value={inclusionText}
                    onChange={(event) => setInclusionText(event.target.value)}
                    placeholder={"Randomized controlled trial\nAdults (18+)\nValidated anxiety outcome"}
                  />
                </div>
                <div>
                  <label className={styles.label} htmlFor="exclusion-criteria">
                    Exclusion criteria
                  </label>
                  <textarea
                    id="exclusion-criteria"
                    className={styles.textarea}
                    rows={8}
                    value={exclusionText}
                    onChange={(event) => setExclusionText(event.target.value)}
                    placeholder={"Non-randomized designs\nPediatric-only populations\nNo anxiety-specific outcome"}
                  />
                </div>
              </div>
              <div className={styles.infoBox}>
                Tip: specific criteria produce cleaner Keep/Exclude decisions in the Ledger.
              </div>
            </>
          ) : null}

          {stepIndex === 2 ? (
            <>
              <h2>Choose your next move</h2>
              <p className={styles.helpText}>
                You can continue in Protocol for deeper setup or jump to conversation immediately.
              </p>
              <div className={styles.summary}>
                <div>
                  <span className={styles.summaryLabel}>Research question</span>
                  <p>{hydratedProtocol.researchQuestion || "Not set yet"}</p>
                </div>
                <div>
                  <span className={styles.summaryLabel}>Inclusion criteria</span>
                  <p>{hydratedProtocol.eligibility.inclusion.length} criteria</p>
                </div>
                <div>
                  <span className={styles.summaryLabel}>Exclusion criteria</span>
                  <p>{hydratedProtocol.eligibility.exclusion.length} criteria</p>
                </div>
              </div>
            </>
          ) : null}

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

            {stepIndex < 2 ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={isSaving}
                onClick={async () => {
                  const saved = await persistProgress();
                  if (!saved) return;
                  setStepIndex((prev) => Math.min(2, prev + 1));
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
                  className="btn btn-primary"
                  disabled={isSaving}
                  onClick={() => persistAndContinue(`/project/${id}/protocol`)}
                >
                  {isSaving ? "Saving..." : "Save and continue to Protocol"}
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
