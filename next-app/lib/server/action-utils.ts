// ---------------------------------------------------------------------------
// ActionResult – structured return type for all server actions
// ---------------------------------------------------------------------------

import type { ZodType } from "zod";
import { logServerError } from "@/lib/server/logging";

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string };

type SanitizeErrorOptions = {
  allowRawMessage?: boolean;
};

/** Known user-facing error messages keyed by error code */
const SAFE_MESSAGES: Record<string, string> = {
  NOT_FOUND: "The requested resource was not found.",
  ACCESS_DENIED: "You don't have permission to perform this action.",
  VALIDATION: "Invalid input. Please check your data and try again.",
  CONFLICT: "This operation conflicts with existing data.",
};

/**
 * Wrap an async server-action body so that:
 *  1. Success returns `{ success: true, data }`.
 *  2. Errors are logged server-side but NEVER forwarded raw to the client —
 *     only safe, classified messages are surfaced.
 */
export async function withAction<T>(
  fn: () => Promise<T>,
  fallbackMessage = "Something went wrong. Please try again.",
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (err) {
    logServerError("action", "server action failed", undefined, err);
    const raw = getErrorMessage(err);
    const code = classifyError(raw);
    const message = code ? SAFE_MESSAGES[code]! : fallbackMessage;
    return { success: false, error: message, errorCode: code };
  }
}

/**
 * Wrap a server action with Zod input validation + error handling.
 * Validation runs inside the error boundary so ZodError is automatically
 * classified as VALIDATION and returned as ActionResult.
 */
export async function withValidatedAction<I, T>(
  schema: ZodType<I>,
  rawInput: unknown,
  fn: (input: I) => Promise<T>,
  fallbackMessage = "Something went wrong. Please try again.",
): Promise<ActionResult<T>> {
  return withAction(async () => {
    const input = schema.parse(rawInput);
    return fn(input);
  }, fallbackMessage);
}

/**
 * Sanitizes an error before returning to clients.
 * - Converts known classes to safe product messages.
 * - Redacts Prisma/SQL/connection internals.
 * - Optionally allows safe raw one-line messages for domain-specific flows.
 */
export function sanitizeErrorMessage(
  error: unknown,
  fallbackMessage: string,
  options: SanitizeErrorOptions = {},
): string {
  const raw = getErrorMessage(error).trim();
  if (!raw) return fallbackMessage;

  const code = classifyError(raw);
  if (code) return SAFE_MESSAGES[code] ?? fallbackMessage;
  if (hasSensitiveErrorDetails(raw)) return fallbackMessage;

  return options.allowRawMessage ? raw : fallbackMessage;
}

/**
 * Classify a raw error message into a safe error code.
 * Returns undefined when the error doesn't match a known pattern —
 * callers should fall back to a generic message in that case.
 */
export function classifyError(msg: string): string | undefined {
  const lower = msg.toLowerCase();
  if (lower.includes("unauthorized")) return "ACCESS_DENIED";
  if (lower.includes("not found") || lower.includes("no rows")) return "NOT_FOUND";
  if (lower.includes("access denied") || lower.includes("permission")) return "ACCESS_DENIED";
  if (lower.includes("unique constraint") || lower.includes("already exists")) return "CONFLICT";
  if (lower.includes("foreign key constraint")) return "CONFLICT";
  if (lower.includes("invalid") || lower.includes("required")) return "VALIDATION";
  if (lower.includes("expected") && lower.includes("received")) return "VALIDATION";
  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "";
}

function hasSensitiveErrorDetails(message: string): boolean {
  const lower = message.toLowerCase();

  if (lower.includes("invalid `prisma.")) return true;
  if (lower.includes("prisma.") || lower.includes("connectorerror")) return true;
  if (lower.includes("postgresql://") || lower.includes("jdbc:postgresql://")) return true;
  if (lower.includes("sqlstate") || lower.includes("query execution")) return true;
  if (lower.includes("handshakefailure") || lower.includes("econnrefused")) return true;

  // Multi-line messages often include stack traces or query internals.
  if (message.includes("\n")) return true;

  // Redact credential-bearing connection strings if present.
  if (/:\/\/[^/\s]+:[^@\s]+@/.test(message)) return true;

  return false;
}
