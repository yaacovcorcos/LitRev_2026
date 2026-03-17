import type { RuntimeStreamEvent } from "@/lib/server/chat-runtime/events";

export const STREAM_MIN_CHARS = 800;
export const STREAM_MAX_CHARS = 1200;
export const STREAM_IDLE_MS = 1000;
const STREAM_HARD_MAX_CHARS = STREAM_MAX_CHARS * 4;

export type StreamCadence = {
  firstFlushMinChars?: number;
  firstFlushIdleMs?: number;
  minChars: number;
  maxChars: number;
  idleMs: number;
};

type CoalescibleEvent =
  | Extract<RuntimeStreamEvent, { type: "content" }>
  | Extract<RuntimeStreamEvent, { type: "reasoning_delta" }>;

type BufferState = {
  kind: CoalescibleEvent["type"];
  reasoningId?: string;
  conversationId?: string;
  text: string;
  flushCount: number;
};

type FlushParams = {
  force: boolean;
};

export type StreamCoalescerOptions = {
  minChars?: number;
  maxChars?: number;
  idleMs?: number;
  contentCadence?: Partial<StreamCadence>;
  reasoningCadence?: Partial<StreamCadence>;
  onEmit: (event: RuntimeStreamEvent) => Promise<void> | void;
};

function normalizeCadence(
  defaults: StreamCadence,
  overrides?: Partial<StreamCadence>,
): StreamCadence {
  const firstFlushMinChars = overrides?.firstFlushMinChars ?? defaults.firstFlushMinChars;
  const firstFlushIdleMs = overrides?.firstFlushIdleMs ?? defaults.firstFlushIdleMs;
  const minChars = Math.max(1, Math.floor(overrides?.minChars ?? defaults.minChars));
  const maxChars = Math.max(minChars, Math.floor(overrides?.maxChars ?? defaults.maxChars));
  const idleMs = Math.max(0, Math.floor(overrides?.idleMs ?? defaults.idleMs));
  return {
    firstFlushMinChars: firstFlushMinChars === undefined ? undefined : Math.max(1, Math.floor(firstFlushMinChars)),
    firstFlushIdleMs: firstFlushIdleMs === undefined ? undefined : Math.max(0, Math.floor(firstFlushIdleMs)),
    minChars,
    maxChars,
    idleMs,
  };
}

function isCoalescibleEvent(event: RuntimeStreamEvent): event is CoalescibleEvent {
  return event.type === "content" || event.type === "reasoning_delta";
}

function makeBufferState(event: CoalescibleEvent): BufferState {
  if (event.type === "content") {
    return {
      kind: "content",
      conversationId: event.conversationId,
      text: event.content,
      flushCount: 0,
    };
  }
  return {
    kind: "reasoning_delta",
    reasoningId: event.reasoningId,
    conversationId: event.conversationId,
    text: event.reasoningText,
    flushCount: 0,
  };
}

function toRuntimeEvent(buffer: BufferState, text: string): RuntimeStreamEvent {
  if (buffer.kind === "content") {
    return { type: "content", content: text, conversationId: buffer.conversationId };
  }
  return {
    type: "reasoning_delta",
    reasoningId: buffer.reasoningId ?? "reasoning",
    reasoningText: text,
    conversationId: buffer.conversationId,
  };
}

function isBoundaryChar(text: string, index: number): boolean {
  const char = text[index];
  if (char === "\n") return true;
  if (char === " " || char === "\t") {
    const prev = index > 0 ? text[index - 1] : "";
    return /[.!?;:,)]/.test(prev);
  }
  return false;
}

type FenceLineMatch = {
  markerChar: string;
  markerLen: number;
  lineEndExclusive: number;
};

function matchFenceLineAt(text: string, lineStart: number): FenceLineMatch | null {
  const newline = text.indexOf("\n", lineStart);
  const lineEnd = newline === -1 ? text.length : newline;
  const line = text.slice(lineStart, lineEnd);
  const match = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
  if (!match) return null;
  return {
    markerChar: match[2][0] ?? "`",
    markerLen: match[2].length,
    lineEndExclusive: newline === -1 ? text.length : newline + 1,
  };
}

function findSafeSplitIndex(text: string, minChars: number, maxChars: number): number | null {
  if (!text) return null;
  const limit = Math.min(text.length, Math.max(1, maxChars));
  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;
  let inInlineCode = false;
  let inlineTicks = 0;
  let lastSafe = -1;

  let index = 0;
  while (index < limit) {
    const lineStart = index === 0 || text[index - 1] === "\n";
    if (lineStart) {
      const fence = matchFenceLineAt(text, index);
      if (fence) {
        if (!inFence) {
          inFence = true;
          fenceChar = fence.markerChar;
          fenceLen = fence.markerLen;
        } else if (fence.markerChar === fenceChar && fence.markerLen >= fenceLen) {
          inFence = false;
          fenceChar = "";
          fenceLen = 0;
          if (fence.lineEndExclusive <= limit) {
            lastSafe = fence.lineEndExclusive;
          }
        }
        index = fence.lineEndExclusive;
        continue;
      }
    }

    if (!inFence && text[index] === "`") {
      let runLength = 1;
      while (index + runLength < limit && text[index + runLength] === "`") {
        runLength += 1;
      }
      if (!inInlineCode) {
        inInlineCode = true;
        inlineTicks = runLength;
      } else if (runLength === inlineTicks) {
        inInlineCode = false;
        inlineTicks = 0;
        lastSafe = index + runLength;
      }
      index += runLength;
      continue;
    }

    if (!inFence && !inInlineCode && isBoundaryChar(text, index)) {
      lastSafe = index + 1;
    }
    index += 1;
  }

  if (lastSafe >= minChars) {
    return lastSafe;
  }
  if (!inFence && !inInlineCode && limit >= minChars) {
    return limit;
  }
  return null;
}

export class StreamCoalescer {
  private readonly contentCadence: StreamCadence;
  private readonly reasoningCadence: StreamCadence;
  private readonly onEmit: StreamCoalescerOptions["onEmit"];

  private buffer: BufferState | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: StreamCoalescerOptions) {
    const legacyDefaults = normalizeCadence({
      minChars: options.minChars ?? STREAM_MIN_CHARS,
      maxChars: options.maxChars ?? STREAM_MAX_CHARS,
      idleMs: options.idleMs ?? STREAM_IDLE_MS,
    });
    this.contentCadence = normalizeCadence(legacyDefaults, options.contentCadence);
    this.reasoningCadence = normalizeCadence(legacyDefaults, options.reasoningCadence);
    this.onEmit = options.onEmit;
  }

  push(event: RuntimeStreamEvent): Promise<void> {
    return this.enqueue(async () => {
      if (!isCoalescibleEvent(event)) {
        await this.flushInternal({ force: true });
        await this.emit(event);
        return;
      }

      const text = event.type === "content" ? event.content : event.reasoningText;
      if (!text) return;

      const incoming = makeBufferState(event);
      if (!this.buffer) {
        this.buffer = incoming;
      } else if (
        this.buffer.kind !== incoming.kind
        || this.buffer.reasoningId !== incoming.reasoningId
        || this.buffer.conversationId !== incoming.conversationId
      ) {
        await this.flushInternal({ force: true });
        this.buffer = incoming;
      } else {
        this.buffer.text += incoming.text;
      }

      const cadence = this.getCadence(this.buffer);
      if (this.buffer.text.length >= cadence.maxChars) {
        await this.flushInternal({ force: false });
      }
      this.scheduleIdleFlush();
    });
  }

  flushAll(): Promise<void> {
    return this.enqueue(async () => {
      await this.flushInternal({ force: true });
    });
  }

  stop(): Promise<void> {
    this.clearIdleTimer();
    return this.queue;
  }

  private getCadence(buffer: BufferState): StreamCadence {
    return buffer.kind === "content" ? this.contentCadence : this.reasoningCadence;
  }

  private getMinChars(buffer: BufferState): number {
    const cadence = this.getCadence(buffer);
    if (buffer.flushCount === 0 && cadence.firstFlushMinChars !== undefined) {
      return cadence.firstFlushMinChars;
    }
    return cadence.minChars;
  }

  private getIdleMs(buffer: BufferState): number {
    const cadence = this.getCadence(buffer);
    if (buffer.flushCount === 0 && cadence.firstFlushIdleMs !== undefined) {
      return cadence.firstFlushIdleMs;
    }
    return cadence.idleMs;
  }

  private enqueue(task: () => Promise<void> | void): Promise<void> {
    this.queue = this.queue.then(async () => {
      await task();
    });
    return this.queue;
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private scheduleIdleFlush(): void {
    if (!this.buffer?.text) return;
    const idleMs = this.getIdleMs(this.buffer);
    if (idleMs <= 0) return;
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      void this.enqueue(async () => {
        await this.flushInternal({ force: true });
      });
    }, idleMs);
  }

  private async flushInternal(params: FlushParams): Promise<void> {
    this.clearIdleTimer();
    while (this.buffer && this.buffer.text.length > 0) {
      const cadence = this.getCadence(this.buffer);
      const activeMinChars = this.getMinChars(this.buffer);
      const minRequired = params.force ? 1 : activeMinChars;
      if (!params.force && this.buffer.text.length < activeMinChars) {
        this.scheduleIdleFlush();
        return;
      }

      let splitIndex = findSafeSplitIndex(this.buffer.text, minRequired, cadence.maxChars);
      if (splitIndex === null) {
        const canForceBySize = this.buffer.text.length >= STREAM_HARD_MAX_CHARS;
        if (!params.force && !canForceBySize) {
          this.scheduleIdleFlush();
          return;
        }
        splitIndex = Math.min(this.buffer.text.length, cadence.maxChars);
      }

      const piece = this.buffer.text.slice(0, splitIndex);
      this.buffer.text = this.buffer.text.slice(splitIndex);
      if (piece) {
        await this.emit(toRuntimeEvent(this.buffer, piece));
        this.buffer.flushCount += 1;
      }

      if (!params.force && this.buffer.text.length < this.getMinChars(this.buffer)) {
        this.scheduleIdleFlush();
        return;
      }
    }
    this.buffer = null;
  }

  private async emit(event: RuntimeStreamEvent): Promise<void> {
    await this.onEmit(event);
  }
}
