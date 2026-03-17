const FALSY = new Set(["0", "false", "off", "no"]);
const TRUTHY = new Set(["1", "true", "on", "yes"]);

function readFlag(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (FALSY.has(normalized)) return false;
  if (TRUTHY.has(normalized)) return true;
  return null;
}

function readInteger(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A1 rollout gate for scroll ownership behavior.
 * This is a deployment-level gate because NEXT_PUBLIC_* values are embedded
 * into the client bundle at build time.
 */
export function isScrollOwnershipA1Enabled(): boolean {
  return readFlag(process.env.NEXT_PUBLIC_SCROLL_OWNERSHIP_A1) ?? false;
}

export type ProgressiveAnswerStreamingConfig = {
  enabled: boolean;
  contentFirstFlushMinChars: number;
  contentFirstFlushIdleMs: number;
  contentMinChars: number;
  contentMaxChars: number;
  contentIdleMs: number;
  reasoningMinChars: number;
  reasoningMaxChars: number;
  reasoningIdleMs: number;
};

const DEFAULT_PROGRESSIVE_ANSWER_STREAMING_CONFIG: Omit<ProgressiveAnswerStreamingConfig, "enabled"> = {
  contentFirstFlushMinChars: 1,
  contentFirstFlushIdleMs: 60,
  contentMinChars: 48,
  contentMaxChars: 160,
  contentIdleMs: 120,
  reasoningMinChars: 800,
  reasoningMaxChars: 1200,
  reasoningIdleMs: 1000,
};

export function isProgressiveAnswerStreamingEnabled(): boolean {
  return (
    readFlag(process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_STREAMING_A1)
    ?? readFlag(process.env.ENABLE_PROGRESSIVE_ANSWER_STREAMING_A1)
    ?? true
  );
}

export function getProgressiveAnswerStreamingConfig(): ProgressiveAnswerStreamingConfig {
  return {
    enabled: isProgressiveAnswerStreamingEnabled(),
    contentFirstFlushMinChars:
      readInteger(process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_CONTENT_FIRST_FLUSH_MIN_CHARS)
      ?? DEFAULT_PROGRESSIVE_ANSWER_STREAMING_CONFIG.contentFirstFlushMinChars,
    contentFirstFlushIdleMs:
      readInteger(process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_CONTENT_FIRST_FLUSH_IDLE_MS)
      ?? DEFAULT_PROGRESSIVE_ANSWER_STREAMING_CONFIG.contentFirstFlushIdleMs,
    contentMinChars:
      readInteger(process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_CONTENT_MIN_CHARS)
      ?? DEFAULT_PROGRESSIVE_ANSWER_STREAMING_CONFIG.contentMinChars,
    contentMaxChars:
      readInteger(process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_CONTENT_MAX_CHARS)
      ?? DEFAULT_PROGRESSIVE_ANSWER_STREAMING_CONFIG.contentMaxChars,
    contentIdleMs:
      readInteger(process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_CONTENT_IDLE_MS)
      ?? DEFAULT_PROGRESSIVE_ANSWER_STREAMING_CONFIG.contentIdleMs,
    reasoningMinChars:
      readInteger(process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_REASONING_MIN_CHARS)
      ?? DEFAULT_PROGRESSIVE_ANSWER_STREAMING_CONFIG.reasoningMinChars,
    reasoningMaxChars:
      readInteger(process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_REASONING_MAX_CHARS)
      ?? DEFAULT_PROGRESSIVE_ANSWER_STREAMING_CONFIG.reasoningMaxChars,
    reasoningIdleMs:
      readInteger(process.env.NEXT_PUBLIC_PROGRESSIVE_ANSWER_REASONING_IDLE_MS)
      ?? DEFAULT_PROGRESSIVE_ANSWER_STREAMING_CONFIG.reasoningIdleMs,
  };
}
