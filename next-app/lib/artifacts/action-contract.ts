export type ReviewArtifactAction = {
  type: "artifact.review";
  artifactId: string;
  status: "accepted" | "rejected";
  note?: string;
  editedPayload?: Record<string, unknown>;
};

export type UndoArtifactAction = {
  type: "artifact.undo";
  artifactId: string;
};

export type ExecutePlanArtifactAction = {
  type: "artifact.execute_plan";
  artifactId: string;
  selectedIndexes: number[];
};

export type ArtifactActionContract =
  | ReviewArtifactAction
  | UndoArtifactAction
  | ExecutePlanArtifactAction;
