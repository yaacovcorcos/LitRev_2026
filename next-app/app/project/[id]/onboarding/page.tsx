import ProjectOnboardingClient from "./ProjectOnboardingClient";
import { getProjectOnboardingStateAction } from "@/app/actions/onboarding";
import { getProtocolAction } from "@/app/actions/protocols";
import {
  DEFAULT_ONBOARDING_STEP_STATUSES,
  type OnboardingStepId,
  type OnboardingStepStatus,
} from "@/lib/durable-route-state";
import { createDefaultProtocolData } from "@/types/protocol";
import type { OnboardingDerivedProfile } from "@/lib/server/onboarding-ai";

type OnboardingBootstrap = {
  stepStatuses: Record<OnboardingStepId, OnboardingStepStatus>;
  derivedProfile: OnboardingDerivedProfile | null;
};

function defaultOnboardingBootstrap(): OnboardingBootstrap {
  return {
    stepStatuses: DEFAULT_ONBOARDING_STEP_STATUSES,
    derivedProfile: null,
  };
}

export default async function ProjectOnboardingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let initialProtocol = createDefaultProtocolData();
  let onboardingBootstrap = defaultOnboardingBootstrap();

  if (id) {
    const [protocolResult, onboardingResult] = await Promise.all([
      getProtocolAction(id),
      getProjectOnboardingStateAction(id),
    ]);

    if (protocolResult.success && protocolResult.data) {
      initialProtocol = protocolResult.data;
    }

    if (onboardingResult.success) {
      onboardingBootstrap = {
        stepStatuses: onboardingResult.data.stepStatuses,
        derivedProfile: onboardingResult.data.derivedProfile,
      };
    }
  }

  return (
    <ProjectOnboardingClient
      key={id}
      projectId={id}
      initialProtocol={initialProtocol}
      initialStepStatuses={onboardingBootstrap.stepStatuses}
      initialDerivedProfile={onboardingBootstrap.derivedProfile}
    />
  );
}
