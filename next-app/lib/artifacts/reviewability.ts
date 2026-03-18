import type { ArtifactStatus } from "@/types/artifacts";

export function isArtifactReviewable(status: ArtifactStatus): boolean {
    return status === "proposed";
}

export function getArtifactSettledLabel(status: ArtifactStatus): string | null {
    switch (status) {
        case "accepted":
            return "Approved.";
        case "rejected":
            return "Rejected.";
        case "auto_applied":
            return "Already applied.";
        case "edited":
            return "Edited.";
        case "collapsed":
            return "Hidden from review.";
        default:
            return null;
    }
}
