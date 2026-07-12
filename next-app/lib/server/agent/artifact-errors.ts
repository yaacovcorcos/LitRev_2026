import "server-only";

export type ArtifactErrorCode =
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_ACCESS_DENIED"
  | "ARTIFACT_INVALID_STATE"
  | "ARTIFACT_INVALID_PAYLOAD"
  | "ARTIFACT_APPLY_FAILED"
  | "ARTIFACT_UNDO_UNSUPPORTED"
  | "ARTIFACT_UNDO_FAILED"
  | "ARTIFACT_UNDO_CONFLICT"
  | "ARTIFACT_CONTEXT_MISSING";

export class ArtifactError extends Error {
  readonly errorCode: ArtifactErrorCode;

  constructor(errorCode: ArtifactErrorCode, message?: string) {
    super(message ?? errorCode);
    this.name = "ArtifactError";
    this.errorCode = errorCode;
  }
}

export function isArtifactError(error: unknown): error is ArtifactError {
  return error instanceof ArtifactError;
}
