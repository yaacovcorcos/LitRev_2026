import type { AIStreamChunk, CopilotPage } from "@/types/ai";

export type ChatStreamFixture = {
  id: string;
  description: string;
  page: CopilotPage;
  section?: string;
  chunks: AIStreamChunk[];
};

export const CHAT_STREAM_FIXTURES_V1: ChatStreamFixture[] = [
  {
    id: "basic-reasoning-content",
    description: "Reasoning + content + run lifecycle",
    page: "ai",
    section: "overview",
    chunks: [
      { type: "run_start", runId: "run-basic", conversationId: "conv-basic" },
      { type: "reasoning_start", reasoningId: "r-1" },
      { type: "reasoning_delta", reasoningId: "r-1", reasoningText: "thinking" },
      { type: "reasoning_end", reasoningId: "r-1" },
      { type: "content", content: "Hello" },
      { type: "content", content: " world" },
      { type: "run_end", runStatus: "completed" },
    ],
  },
  {
    id: "tool-interleave-run-end",
    description: "Interleaved tools with unresolved running call at run end",
    page: "overview",
    chunks: [
      { type: "run_start", runId: "run-tools", conversationId: "conv-tools" },
      { type: "tool_call", toolCall: { id: "tc-A", name: "search_a", arguments: {} } },
      { type: "tool_call", toolCall: { id: "tc-B", name: "search_b", arguments: {} } },
      { type: "tool_result", toolName: "search_b", toolResult: { callId: "tc-B", result: { ok: true } } },
      { type: "run_end", runStatus: "failed" },
    ],
  },
  {
    id: "ask-user-navigation-title",
    description: "Ask-user flow with title, choices, and navigation",
    page: "draft",
    section: "intro",
    chunks: [
      { type: "run_start", runId: "run-ask", conversationId: "conv-ask" },
      { type: "conversation_title", conversationTitle: "Draft discussion" },
      {
        type: "user_input_required",
        userInputRequest: {
          callId: "ask-1",
          question: "Continue with strict mode?",
          questionType: "yes_no",
        },
      },
      { type: "choices", choices: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }] },
      { type: "navigate", navigateUrl: "/project/abc/draft" },
      { type: "run_end", runStatus: "paused" },
    ],
  },
  {
    id: "artifact-progress-plan-step",
    description: "Artifact + progress + plan updates + checkpoint",
    page: "ai",
    chunks: [
      { type: "run_start", runId: "run-plan", conversationId: "conv-plan" },
      { type: "progress", progressMessage: "Planning", progressCurrent: 1, progressTotal: 3 },
      {
        type: "artifact",
        artifactId: "plan-1",
        artifactType: "plan",
        artifactStatus: "proposed",
        artifactTitle: "Plan",
        artifactPayload: { steps: [] },
      },
      { type: "plan_step_update", planId: "plan-1", stepIndex: 0, stepStatus: "running" },
      { type: "checkpoint", checkpointLabel: "Checkpoint 1" },
      { type: "run_end", runStatus: "completed" },
    ],
  },
  {
    id: "error-and-done",
    description: "Explicit error and done events for contract coverage",
    page: "overview",
    chunks: [
      { type: "run_start", runId: "run-error", conversationId: "conv-error" },
      { type: "error", error: "Synthetic stream error" },
      { type: "done" },
      { type: "run_end", runStatus: "failed", stopReason: "error" },
    ],
  },
];
