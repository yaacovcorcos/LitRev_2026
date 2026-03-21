import "server-only";

export type ServerLogContext = Record<string, unknown>;

type ErrorWithCode = Error & {
  code?: unknown;
  cause?: unknown;
};

type LogMethod = "error" | "warn" | "info";

function formatScope(scope: string): string {
  const trimmed = scope.trim();
  return trimmed.startsWith("[") ? trimmed : `[${trimmed}]`;
}

function normalizeError(error: unknown): unknown {
  if (error instanceof Error) {
    const normalized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };

    const maybeError = error as ErrorWithCode;
    if (typeof maybeError.code !== "undefined") {
      normalized.code = maybeError.code;
    }
    if (typeof maybeError.cause !== "undefined") {
      normalized.cause = maybeError.cause;
    }

    return normalized;
  }

  if (error && typeof error === "object") {
    return error;
  }

  if (typeof error === "string") {
    return { message: error };
  }

  return { message: String(error) };
}

function emitServerLog(
  method: LogMethod,
  scope: string,
  message: string,
  context?: ServerLogContext,
  error?: unknown,
): void {
  const formattedMessage = `${formatScope(scope)} ${message}`;

  if (context && typeof error !== "undefined") {
    console[method](formattedMessage, { ...context, error: normalizeError(error) });
    return;
  }

  if (context) {
    console[method](formattedMessage, context);
    return;
  }

  if (typeof error !== "undefined") {
    console[method](formattedMessage, normalizeError(error));
    return;
  }

  console[method](formattedMessage);
}

export function logServerError(
  scope: string,
  message: string,
  context?: ServerLogContext,
  error?: unknown,
): void {
  emitServerLog("error", scope, message, context, error);
}

export function logServerWarn(
  scope: string,
  message: string,
  context?: ServerLogContext,
  error?: unknown,
): void {
  emitServerLog("warn", scope, message, context, error);
}

export function logServerInfo(
  scope: string,
  message: string,
  context?: ServerLogContext,
): void {
  emitServerLog("info", scope, message, context);
}
