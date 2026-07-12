import type { ArtifactStatus, ArtifactType } from "@/types/artifacts";
import { getArtifactSettledLabel, isArtifactReviewable } from "@/lib/artifacts/reviewability";

export type ArtifactActionClass =
  | "review_resolution"
  | "execution"
  | "secondary"
  | "undo";

export type ArtifactResolutionKind =
  | "accept"
  | "apply"
  | "reject"
  | "dismiss"
  | "exclude"
  | "keep"
  | "remember"
  | "archive"
  | "delete";

export type ArtifactSecondaryKind = "discuss" | "edit";

export type ArtifactInlineActionDescriptor =
  | {
      key: string;
      class: "review_resolution";
      kind: ArtifactResolutionKind;
      requiresConfirmation: boolean;
    }
  | {
      key: string;
      class: "secondary";
      kind: ArtifactSecondaryKind;
      requiresConfirmation: false;
    }
  | {
      key: string;
      class: "undo";
      kind: "undo";
      requiresConfirmation: true;
    }
  | {
      key: string;
      class: "execution";
      kind: "execute_plan";
      requiresConfirmation: false;
    };

export type ArtifactSettledAffordance = {
  label: string | null;
  undoAction?: Extract<ArtifactInlineActionDescriptor, { class: "undo" }>;
};

export type ArtifactInlineActionModel = {
  isReviewable: boolean;
  actions: ArtifactInlineActionDescriptor[];
  settled: ArtifactSettledAffordance;
};

function reviewAction(
  key: string,
  kind: ArtifactResolutionKind,
  requiresConfirmation: boolean,
): Extract<ArtifactInlineActionDescriptor, { class: "review_resolution" }> {
  return {
    key,
    class: "review_resolution",
    kind,
    requiresConfirmation,
  };
}

function secondaryAction(
  key: string,
  kind: ArtifactSecondaryKind,
): Extract<ArtifactInlineActionDescriptor, { class: "secondary" }> {
  return {
    key,
    class: "secondary",
    kind,
    requiresConfirmation: false,
  };
}

function undoAction(): Extract<ArtifactInlineActionDescriptor, { class: "undo" }> {
  return {
    key: "undo",
    class: "undo",
    kind: "undo",
    requiresConfirmation: true,
  };
}

export function supportsArtifactInlineUndo(
  artifactType: ArtifactType,
  status: ArtifactStatus,
): boolean {
  return (artifactType === "study_update" || artifactType === "study_deletion")
    && (status === "accepted" || status === "auto_applied");
}

export function getArtifactInlineActionModel(
  artifactType: ArtifactType,
  status: ArtifactStatus,
): ArtifactInlineActionModel {
  const isReviewable = isArtifactReviewable(status);

  if (!isReviewable) {
    return {
      isReviewable,
      actions: [],
      settled: {
        label: getArtifactSettledLabel(status),
        undoAction: supportsArtifactInlineUndo(artifactType, status) ? undoAction() : undefined,
      },
    };
  }

  switch (artifactType) {
    case "study_proposal":
      return {
        isReviewable,
        actions: [
          reviewAction("keep", "keep", false),
          reviewAction("exclude", "exclude", true),
        ],
        settled: { label: null },
      };
    case "study_update":
      return {
        isReviewable,
        actions: [
          reviewAction("apply", "apply", false),
          reviewAction("reject", "reject", true),
        ],
        settled: { label: null },
      };
    case "study_deletion":
      return {
        isReviewable,
        actions: [
          reviewAction("reject", "reject", false),
          reviewAction("delete", "delete", true),
        ],
        settled: { label: null },
      };
    case "protocol_suggestion":
      return {
        isReviewable,
        actions: [
          secondaryAction("discuss", "discuss"),
          reviewAction("apply", "apply", false),
        ],
        settled: { label: null },
      };
    case "criteria_card":
      return {
        isReviewable,
        actions: [
          secondaryAction("discuss", "discuss"),
          reviewAction("apply", "apply", false),
        ],
        settled: { label: null },
      };
    case "draft_diff":
      return {
        isReviewable,
        actions: [
          secondaryAction("edit", "edit"),
          reviewAction("apply", "apply", false),
        ],
        settled: { label: null },
      };
    case "memory_proposal":
      return {
        isReviewable,
        actions: [
          secondaryAction("edit", "edit"),
          reviewAction("dismiss", "dismiss", true),
          reviewAction("remember", "remember", false),
        ],
        settled: { label: null },
      };
    case "memory_forget_proposal":
      return {
        isReviewable,
        actions: [
          reviewAction("dismiss", "dismiss", true),
          reviewAction("archive", "archive", true),
        ],
        settled: { label: null },
      };
    case "screening_batch":
      return {
        isReviewable,
        actions: [reviewAction("apply", "apply", false)],
        settled: { label: null },
      };
    case "plan":
      return {
        isReviewable,
        actions: [
          reviewAction("reject", "reject", true),
          {
            key: "execute_plan",
            class: "execution",
            kind: "execute_plan",
            requiresConfirmation: false,
          },
        ],
        settled: { label: null },
      };
    default:
      return {
        isReviewable,
        actions: [],
        settled: { label: null },
      };
  }
}
