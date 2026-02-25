import type { RuntimeStreamEvent } from "@/lib/server/chat-runtime/events";

export const STREAM_MIN_CHARS = 800;
export const STREAM_MAX_CHARS = 1200;
export const STREAM_IDLE_MS = 1000;
const STREAM_HARD_MAX_CHARS = STREAM_MAX_CHARS * 4;

type CoalescibleEvent =
  | Extract<RuntimeStreamEvent, { type: "content" }>
  | Extract<RuntimeStreamEvent, { type: "reasoning_delta" }>;

type BufferState = {
  kind: CoalescibleEvent["type"];
  reasoningId?: string;
  conversationId?: string;
  text: string;
};

type FlushParams = {
  force: boolean;
};

export type StreamCoalescerOptions = {
  minChars?: number;
  maxChars?: number;
  idleMs?: number;
  onEmit: (event: RuntimeStreamEvent) => Promise<void> | void;
};

function isCoalescibleEvent(event: RuntimeStreamEvent): event is CoalescibleEvent {
  return event.type === "content" || event.type === "reasoning_delta";
}

function makeBufferState(event: CoalescibleEvent): BufferState {
  if (event.type === "content") {
    return {
      kind: "content",
      conversationId: event.conversationId,
      text: event.content,
    };
  }
  return {
    kind: "reasoning_delta",
    reasoningId: event.reasoningId,
    conversationId: event.conversationId,
    text: event.reasoningText,
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
  private readonly minChars: number;
  private readonly maxChars: number;
  private readonly idleMs: number;
  private readonly onEmit: StreamCoalescerOptions["onEmit"];

  private buffer: BufferState | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: StreamCoalescerOptions) {
    this.minChars = Math.max(1, Math.floor(options.minChars ?? STREAM_MIN_CHARS));
    this.maxChars = Math.max(this.minChars, Math.floor(options.maxChars ?? STREAM_MAX_CHARS));
    this.idleMs = Math.max(0, Math.floor(options.idleMs ?? STREAM_IDLE_MS));
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

      if (this.buffer.text.length >= this.maxChars) {
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

  stop(): void {
    this.clearIdleTimer();
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
    if (this.idleMs <= 0 || !this.buffer?.text) return;
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      void this.enqueue(async () => {
        await this.flushInternal({ force: true });
      });
    }, this.idleMs);
  }

  private async flushInternal(params: FlushParams): Promise<void> {
    this.clearIdleTimer();
    while (this.buffer && this.buffer.text.length > 0) {
      const minRequired = params.force ? 1 : this.minChars;
      if (!params.force && this.buffer.text.length < this.minChars) {
        this.scheduleIdleFlush();
        return;
      }

      let splitIndex = findSafeSplitIndex(this.buffer.text, minRequired, this.maxChars);
      if (splitIndex === null) {
        const canForceBySize = this.buffer.text.length >= STREAM_HARD_MAX_CHARS;
        if (!params.force && !canForceBySize) {
          this.scheduleIdleFlush();
          return;
        }
        splitIndex = Math.min(this.buffer.text.length, this.maxChars);
      }

      const piece = this.buffer.text.slice(0, splitIndex);
      this.buffer.text = this.buffer.text.slice(splitIndex);
      if (piece) {
        await this.emit(toRuntimeEvent(this.buffer, piece));
      }

      if (!params.force && this.buffer.text.length < this.minChars) {
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
