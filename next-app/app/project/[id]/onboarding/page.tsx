import { ProjectOnboardingClient } from "./ProjectOnboardingClient";
import { getProjectOnboardingStateAction } from "@/app/actions/onboarding";
import { getProtocolAction } from "@/app/actions/protocols";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DEFAULT_ONBOARDING_STEP_STATUSES,
  type OnboardingStepId,
  type OnboardingStepStatus,
} from "@/lib/durable-route-state";
import { GUIDED_SETUP_HOLD_COPY, isGuidedSetupAvailable } from "@/lib/guided-setup-availability";
import { createDefaultProtocolData } from "@/types/protocol";
import type { OnboardingDerivedProfile } from "@/lib/server/onboarding-ai";
import styles from "./onboarding.module.css";

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

  if (!isGuidedSetupAvailable()) {
    return (
      <EmptyState
        variant="warning"
        icon="schedule"
        title={GUIDED_SETUP_HOLD_COPY.routeTitle}
        description={GUIDED_SETUP_HOLD_COPY.routeDescription}
        primaryAction={{
          label: GUIDED_SETUP_HOLD_COPY.workspaceActionLabel,
          href: id ? `/project/${id}` : "/",
        }}
        secondaryAction={{ label: GUIDED_SETUP_HOLD_COPY.dashboardActionLabel, href: "/" }}
        className={styles.notFound}
      />
    );
  }

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
