export function isAbortLikeError(error: unknown): boolean {
  if (!error) return false;

  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError";
  }

  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  if (typeof error !== "object") return false;

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
    cause?: unknown;
  };

  if (candidate.name === "AbortError") return true;
  if (candidate.code === "ABORT_ERR" || candidate.code === "ERR_ABORTED") return true;
  if (
    typeof candidate.message === "string"
    && /^(aborted|the operation was aborted|this operation was aborted)$/i.test(candidate.message.trim())
  ) {
    return true;
  }

  return candidate.cause !== undefined && isAbortLikeError(candidate.cause);
}

export function createAbortError(message = "Aborted"): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException(message, "AbortError");
  }
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}
