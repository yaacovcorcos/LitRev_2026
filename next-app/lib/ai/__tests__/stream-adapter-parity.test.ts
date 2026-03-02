import { describe, expect, it } from "vitest";
import { CHAT_STREAM_FIXTURES_V1, type ChatStreamFixture } from "@/lib/ai/stream-fixtures";
import { createAiStreamRuntime } from "@/lib/ai/ai-stream-runtime";
import { reduceSharedStreamChunk, type SharedStreamIntent } from "@/lib/ai/shared-stream-reducer";
import {
  createInitialProjectStreamState,
  handleProjectCopilotStreamChunk,
  type StreamMutableState,
} from "@/contexts/project-copilot-stream-events";
import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { ArtifactData } from "@/types/artifacts";

const INITIAL_CONVERSATION_ID = "conv-initial";
const EXPECTED_EVENT_TYPES = [
  "artifact",
  "checkpoint",
  "choices",
  "content",
  "conversation_title",
  "done",
  "error",
  "navigate",
  "plan_step_update",
  "progress",
  "reasoning_delta",
  "reasoning_end",
  "reasoning_start",
  "run_end",
  "run_start",
  "tool_call",
  "tool_result",
  "user_input_required",
] as const;

type ReplayResult = {
  states: StreamMutableState[];
  intentsByChunk: SharedStreamIntent[][];
};

function replayReducerFixture(fixture: ChatStreamFixture): ReplayResult {
  let state = createInitialProjectStreamState({
    effectiveConvId: INITIAL_CONVERSATION_ID,
  });
  const states: StreamMutableState[] = [];
  const intentsByChunk: SharedStreamIntent[][] = [];

  for (const chunk of fixture.chunks) {
    const reduced = reduceSharedStreamChunk(state, chunk, {
      page: fixture.page,
      section: fixture.section,
    });
    state = reduced.state;
    states.push(structuredClone(state));
    intentsByChunk.push(structuredClone(reduced.intents));
  }

  return { states, intentsByChunk };
}

function replayProjectAdapterFixture(fixture: ChatStreamFixture): ReplayResult {
  const messages: CopilotMessage[] = [];
  const artifacts = new Map<string, ArtifactData>();
  let state = createInitialProjectStreamState({
    effectiveConvId: INITIAL_CONVERSATION_ID,
  });

  const states: StreamMutableState[] = [];
  const intentsByChunk: SharedStreamIntent[][] = [];

  for (const chunk of fixture.chunks) {
    const currentChunkIntents: SharedStreamIntent[] = [];
    state = handleProjectCopilotStreamChunk(chunk, state, {
      aiMessageId: "ai-message",
      page: fixture.page,
      section: fixture.section,
      projectId: "project-1",
      myGen: 1,
      getCurrentGen: () => 1,
      setCurrentRunId: () => {},
      syncConversationId: () => {},
      upsertConversationTitle: () => {},
      upsertArtifact: (artifact) => {
        artifacts.set(artifact.id, artifact);
      },
      updateMessages: (updater) => {
        const next = updater(messages);
        messages.splice(0, messages.length, ...next);
      },
      emitLedgerChanged: () => {},
      setPendingChoices: () => {},
      setPendingUserInput: () => {},
      onIntent: (intent) => {
        currentChunkIntents.push(structuredClone(intent));
      },
    });

    states.push(structuredClone(state));
    intentsByChunk.push(currentChunkIntents);
  }

  return { states, intentsByChunk };
}

function replayAiAdapterFixture(fixture: ChatStreamFixture): ReplayResult {
  const timelineByConversation: Record<string, unknown[]> = {
    [INITIAL_CONVERSATION_ID]: [],
  };
  let activeChunkIntents: SharedStreamIntent[] = [];
  const states: StreamMutableState[] = [];
  const intentsByChunk: SharedStreamIntent[][] = [];

  const runtime = createAiStreamRuntime({
    aiMessageId: "ai-message",
    page: fixture.page,
    section: fixture.section,
    initialConversationId: INITIAL_CONVERSATION_ID,
    selectedProjectId: "project-1",
    myGen: 1,
    getCurrentGen: () => 1,
    updateConversationTimeline: (conversationId, updater) => {
      const existing = timelineByConversation[conversationId] ?? [];
      timelineByConversation[conversationId] = updater(existing as never[]);
    },
    ensureConversationTimeline: (conversationId) => {
      timelineByConversation[conversationId] = timelineByConversation[conversationId] ?? [];
    },
    setActiveConversationId: () => {},
    upsertConversationTitle: () => {},
    setPendingChoices: () => {},
    setPendingUserInput: () => {},
    onPlanStepUpdate: () => {},
    onNavigate: () => {},
    onIntent: (intent) => {
      activeChunkIntents.push(structuredClone(intent));
    },
    now: () => "2026-03-02T00:00:00.000Z",
    emitLedgerChanged: () => {},
  });

  for (const chunk of fixture.chunks) {
    activeChunkIntents = [];
    runtime.handleChunk(chunk);
    states.push(structuredClone(runtime.getState()));
    intentsByChunk.push(structuredClone(activeChunkIntents));
  }

  return { states, intentsByChunk };
}

describe("stream adapter parity", () => {
  it("fixtures cover the full runtime stream event contract", () => {
    const seen = new Set<string>();
    for (const fixture of CHAT_STREAM_FIXTURES_V1) {
      for (const chunk of fixture.chunks) {
        seen.add(chunk.type);
      }
    }
    expect([...seen].sort()).toEqual([...EXPECTED_EVENT_TYPES].sort());
  });

  for (const fixture of CHAT_STREAM_FIXTURES_V1) {
    it(`keeps reducer state+intent parity for fixture: ${fixture.id}`, () => {
      const reducerReplay = replayReducerFixture(fixture);
      const projectReplay = replayProjectAdapterFixture(fixture);

      expect(projectReplay.states).toEqual(reducerReplay.states);
      expect(projectReplay.intentsByChunk).toEqual(reducerReplay.intentsByChunk);

      const aiReplay = replayAiAdapterFixture(fixture);
      expect(aiReplay.states).toEqual(reducerReplay.states);
      expect(aiReplay.intentsByChunk).toEqual(reducerReplay.intentsByChunk);
    });
  }
});
