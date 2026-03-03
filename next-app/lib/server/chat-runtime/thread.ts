import type { RuntimeStreamEvent } from "@/lib/server/chat-runtime/events";

export type RuntimeEventSink = (event: RuntimeStreamEvent) => void | Promise<void>;

export type ThreadSnapshot = {
  conversationId?: string;
  runId?: string;
};

export class RuntimeThreadContext {
  private conversationId?: string;
  private runId?: string;
  private readonly sink: RuntimeEventSink;

  constructor(sink: RuntimeEventSink, initial?: ThreadSnapshot) {
    this.sink = sink;
    this.conversationId = initial?.conversationId;
    this.runId = initial?.runId;
  }

  snapshot(): ThreadSnapshot {
    return { conversationId: this.conversationId, runId: this.runId };
  }

  bindConversation(conversationId?: string): void {
    this.conversationId = conversationId;
  }

  bindRun(runId?: string): void {
    this.runId = runId;
  }

  async emit(event: RuntimeStreamEvent): Promise<void> {
    const withConversation =
      event.conversationId || !this.conversationId
        ? event
        : { ...event, conversationId: this.conversationId };
    await this.sink(withConversation);
  }

  async reply(content: string): Promise<void> {
    await this.emit({ type: "content", content, conversationId: this.conversationId });
  }

  async progress(message: string, progressCurrent?: number, progressTotal?: number): Promise<void> {
    await this.emit({
      type: "progress",
      progressMessage: message,
      progressCurrent,
      progressTotal,
      conversationId: this.conversationId,
    });
  }

  async error(message: string): Promise<void> {
    await this.emit({ type: "error", error: message, conversationId: this.conversationId });
  }

  async runStart(runId?: string, conversationId?: string): Promise<void> {
    if (conversationId) this.bindConversation(conversationId);
    if (runId) this.bindRun(runId);
    await this.emit({
      type: "run_start",
      runId: runId ?? this.runId,
      conversationId: this.conversationId,
    });
  }

  async runEnd(params?: {
    runId?: string;
    runStatus?: string;
    actualModel?: string;
    actualModelSource?: "provider" | "requested" | "unknown";
    stopReason?: string;
    iterationCount?: number;
    toolCallCount?: number;
    runCostTokensIn?: number;
    runCostTokensOut?: number;
  }): Promise<void> {
    await this.emit({
      type: "run_end",
      runId: params?.runId ?? this.runId,
      runStatus: params?.runStatus,
      actualModel: params?.actualModel,
      actualModelSource: params?.actualModelSource,
      stopReason: params?.stopReason,
      iterationCount: params?.iterationCount,
      toolCallCount: params?.toolCallCount,
      runCostTokensIn: params?.runCostTokensIn,
      runCostTokensOut: params?.runCostTokensOut,
      conversationId: this.conversationId,
    });
  }
}
