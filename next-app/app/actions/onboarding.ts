"use server";

import { z } from "zod";
import {
  getProjectOnboardingState,
  setProjectOnboardingState,
  type ProjectOnboardingState,
} from "@/lib/server/onboarding";
import {
  buildWorkflowOrientation,
  decomposePico,
  deriveOnboardingProfile,
  finalClarification,
  generateCriteria,
  previewStrategy,
  suggestQuestions,
  validateSetup,
  type FinalClarificationResult,
  type OnboardingDerivedProfile,
  type PicoResult,
  type CriteriaResult,
  type StrategyPreviewResult,
  type SuggestQuestionsResult,
  type ValidateSetupResult,
  type WorkflowOrientationResult,
} from "@/lib/server/onboarding-ai";
import type { EligibilityData, PICOData, ProtocolData } from "@/types/protocol";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { projectIdSchema } from "@/lib/schemas/ids";
import {
  onboardingProgressUpdatesSchema,
  onboardingDerivedProfileSchema,
  picoDataSchema,
  eligibilityDataSchema,
  protocolDataSchema,
  strategyPreviewResultSchema,
} from "@/lib/schemas/onboarding";

export async function getProjectOnboardingStateAction(projectId: string): Promise<ActionResult<ProjectOnboardingState>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(({ userId, workspaceId }) =>
      getProjectOnboardingState({ ownerId: userId, workspaceId }, id),
    ),
  );
}

const setOnboardingOverrideInput = z.object({
  projectId: projectIdSchema,
  enabledOverride: z.boolean().nullable(),
});

export async function setProjectOnboardingOverrideAction(
  projectId: string,
  enabledOverride: boolean | null
): Promise<ActionResult<ProjectOnboardingState>> {
  return withValidatedAction(setOnboardingOverrideInput, { projectId, enabledOverride },
    (v) => withAuth(({ userId, workspaceId }) =>
      setProjectOnboardingState({ ownerId: userId, workspaceId }, v.projectId, { enabledOverride: v.enabledOverride }),
    ),
  );
}

const markOnboardingCompletedInput = z.object({
  projectId: projectIdSchema,
  options: z.object({ skipped: z.boolean().optional() }).optional(),
});

export async function markProjectOnboardingCompletedAction(
  projectId: string,
  options?: { skipped?: boolean }
): Promise<ActionResult<ProjectOnboardingState>> {
  return withValidatedAction(markOnboardingCompletedInput, { projectId, options },
    (v) => withAuth(({ userId, workspaceId }) => {
      const now = new Date().toISOString();
      return setProjectOnboardingState({ ownerId: userId, workspaceId }, v.projectId, {
        completedAt: now,
        skippedAt: v.options?.skipped ? now : null,
      });
    }),
  );
}

const saveOnboardingProgressInput = z.object({
  projectId: projectIdSchema,
  updates: onboardingProgressUpdatesSchema,
});

export async function saveProjectOnboardingProgressAction(
  projectId: string,
  updates: Pick<ProjectOnboardingState, "stepStatuses" | "derivedProfile">
): Promise<ActionResult<ProjectOnboardingState>> {
  return withValidatedAction(saveOnboardingProgressInput, { projectId, updates },
    (v) => withAuth(({ userId, workspaceId }) =>
      setProjectOnboardingState({ ownerId: userId, workspaceId }, v.projectId, v.updates as Pick<ProjectOnboardingState, "stepStatuses" | "derivedProfile">),
    ),
  );
}

export async function suggestQuestionsAction(topicText: string): Promise<ActionResult<SuggestQuestionsResult>> {
  return withValidatedAction(z.string().min(1).max(5000), topicText,
    (text) => withAuth(async () => suggestQuestions(text)),
  );
}

const decomposePicoInput = z.object({
  researchQuestion: z.string().min(1).max(5000),
  domain: z.string().max(1000),
});

export async function decomposePicoAction(
  researchQuestion: string,
  domain: string,
): Promise<ActionResult<PicoResult>> {
  return withValidatedAction(decomposePicoInput, { researchQuestion, domain },
    (v) => withAuth(async () => decomposePico(v.researchQuestion, v.domain)),
  );
}

const generateCriteriaInput = z.object({
  researchQuestion: z.string().min(1).max(5000),
  pico: picoDataSchema,
});

export async function generateCriteriaAction(
  researchQuestion: string,
  pico: PICOData,
): Promise<ActionResult<CriteriaResult>> {
  return withValidatedAction(generateCriteriaInput, { researchQuestion, pico },
    (v) => withAuth(async () => generateCriteria(v.researchQuestion, v.pico as PICOData)),
  );
}

const previewStrategyInput = z.object({
  researchQuestion: z.string().min(1).max(5000),
  pico: picoDataSchema,
  criteria: eligibilityDataSchema,
});

export async function previewStrategyAction(
  researchQuestion: string,
  pico: PICOData,
  criteria: EligibilityData,
): Promise<ActionResult<StrategyPreviewResult>> {
  return withValidatedAction(previewStrategyInput, { researchQuestion, pico, criteria },
    (v) => withAuth(async () => previewStrategy(v.researchQuestion, v.pico as PICOData, v.criteria as EligibilityData)),
  );
}

const buildWorkflowOrientationInput = z.object({
  researchQuestion: z.string().min(1).max(5000),
  pico: picoDataSchema,
  criteria: eligibilityDataSchema,
  strategyPreview: strategyPreviewResultSchema,
});

export async function buildWorkflowOrientationAction(
  researchQuestion: string,
  pico: PICOData,
  criteria: EligibilityData,
  strategyPreview: StrategyPreviewResult,
): Promise<ActionResult<WorkflowOrientationResult>> {
  return withValidatedAction(buildWorkflowOrientationInput, { researchQuestion, pico, criteria, strategyPreview },
    (v) => withAuth(async () => buildWorkflowOrientation(v.researchQuestion, v.pico as PICOData, v.criteria as EligibilityData, v.strategyPreview as StrategyPreviewResult)),
  );
}

export async function validateSetupAction(
  fullProtocolSnapshot: ProtocolData,
): Promise<ActionResult<ValidateSetupResult>> {
  return withValidatedAction(protocolDataSchema, fullProtocolSnapshot,
    (v) => withAuth(async () => validateSetup(v as ProtocolData)),
  );
}

const finalClarificationInput = z.object({
  fullProtocolSnapshot: protocolDataSchema,
  derivedProfile: onboardingDerivedProfileSchema.nullable(),
});

export async function finalClarificationAction(
  fullProtocolSnapshot: ProtocolData,
  derivedProfile: OnboardingDerivedProfile | null,
): Promise<ActionResult<FinalClarificationResult>> {
  return withValidatedAction(finalClarificationInput, { fullProtocolSnapshot, derivedProfile },
    (v) => withAuth(async () => finalClarification(v.fullProtocolSnapshot as ProtocolData, v.derivedProfile as OnboardingDerivedProfile | null)),
  );
}

export async function deriveOnboardingProfileAction(
  fullProtocolSnapshot: ProtocolData,
): Promise<ActionResult<OnboardingDerivedProfile>> {
  return withValidatedAction(protocolDataSchema, fullProtocolSnapshot,
    (v) => withAuth(async () => deriveOnboardingProfile(v as ProtocolData)),
  );
}
