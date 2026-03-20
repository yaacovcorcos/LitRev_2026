import { describe, expect, it } from "vitest";
import {
  createInitialSharedStreamState,
  reduceSharedStreamChunk,
  reserveSharedAssistantTurn,
} from "@/lib/ai/shared-stream-reducer";
import type { AIStreamChunk } from "@/types/ai";

const meta = { page: "ai" as const, section: "overview" };

describe("shared stream reducer", () => {
  it("handles all stream chunk types without throwing", () => {
    const chunks: AIStreamChunk[] = [
      { type: "content", content: "Hello" },
      { type: "reasoning_start", reasoningId: "r1" },
      { type: "reasoning_delta", reasoningId: "r1", reasoningText: "thinking" },
      { type: "reasoning_end", reasoningId: "r1" },
      { type: "tool_call", toolCall: { id: "tc1", name: "search", arguments: {} } },
      { type: "tool_result", toolName: "search", toolResult: { callId: "tc1", result: { ok: true } } },
      { type: "artifact", artifactId: "a1", artifactType: "plan", artifactStatus: "proposed", artifactTitle: "Plan" },
      { type: "progress", progressMessage: "Working", progressCurrent: 1, progressTotal: 2 },
      { type: "checkpoint", checkpointLabel: "checkpoint" },
      { type: "run_start", runId: "run1", conversationId: "conv1" },
      { type: "conversation_title", conversationTitle: "New title" },
      { type: "choices", choices: [{ label: "A", value: "a" }] },
      { type: "plan_step_update", planId: "plan-1", stepIndex: 0, stepStatus: "running" },
      { type: "navigate", navigateUrl: "/ai" },
      {
        type: "user_input_required",
        userInputRequest: {
          callId: "ask-1",
          question: "Continue?",
          questionType: "yes_no",
        },
      },
      { type: "error", error: "boom" },
      { type: "run_end", runStatus: "completed" },
      { type: "done" },
    ];

    let state = createInitialSharedStreamState();
    for (const chunk of chunks) {
      const reduced = reduceSharedStreamChunk(state, chunk, meta);
      state = reduced.state;
      expect(Array.isArray(reduced.intents)).toBe(true);
    }
  });

  it("marks add_to_ledger tool results as ledger changes", () => {
    const start = createInitialSharedStreamState({ lastToolCallId: "tc-1" });
    const reduced = reduceSharedStreamChunk(
      start,
      {
        type: "tool_result",
        toolName: "add_to_ledger",
        toolResult: { callId: "tc-1", result: { ok: true } },
      },
      meta,
    );

    expect(reduced.intents.some((intent) => intent.type === "ledger_changed")).toBe(true);
  });

  it("emits synthetic tool ids when tool_call id is missing", () => {
    const reduced = reduceSharedStreamChunk(
      createInitialSharedStreamState(),
      {
        type: "tool_call",
        toolCall: { id: "", name: "search", arguments: {} },
      },
      meta,
    );

    const toolIntent = reduced.intents.find((intent) => intent.type === "tool_activity_upsert");
    expect(toolIntent && toolIntent.type === "tool_activity_upsert").toBe(true);
    if (!toolIntent || toolIntent.type !== "tool_activity_upsert") return;
    expect(toolIntent.callId.startsWith("synthetic-tool-")).toBe(true);
  });

  it("preserves factual PubMed metadata on tool activity intents", () => {
    let state = createInitialSharedStreamState();

    const toolCallReduced = reduceSharedStreamChunk(
      state,
      {
        type: "tool_call",
        toolCall: {
          id: "pubmed-1",
          name: "search_pubmed",
          arguments: {
            query: "\"retrospective cohort\" AND disposition decision AND physicians AND llm",
          },
        },
      },
      meta,
    );
    state = toolCallReduced.state;

    const runningIntent = toolCallReduced.intents.find((intent) => intent.type === "tool_activity_upsert");
    expect(runningIntent && runningIntent.type === "tool_activity_upsert").toBe(true);
    if (!runningIntent || runningIntent.type !== "tool_activity_upsert") return;
    expect(runningIntent.displayLabel).toBe("Searching PubMed");
    expect(runningIntent.inputPreview).toContain("retrospective cohort");
    expect(runningIntent.sourceBadge).toBe("PubMed");
    expect(runningIntent.queryPreview).toContain("retrospective cohort");
    expect(toolCallReduced.intents).toContainEqual({
      type: "progress_upsert",
      message: "Searching PubMed",
    });

    const toolResultReduced = reduceSharedStreamChunk(
      state,
      {
        type: "tool_result",
        toolName: "search_pubmed",
        toolResult: {
          callId: "pubmed-1",
          result: {
            query: "\"retrospective cohort\" AND disposition decision AND physicians AND llm",
            source: "pubmed",
            totalResults: 42,
            returnedCount: 10,
            results: [
              { pmid: "40123456", title: "A" },
              { pmid: "39887711", title: "B" },
            ],
          },
        },
      },
      meta,
    );

    const doneIntent = toolResultReduced.intents.find((intent) => intent.type === "tool_activity_upsert" && intent.status === "done");
    expect(doneIntent && doneIntent.type === "tool_activity_upsert").toBe(true);
    if (!doneIntent || doneIntent.type !== "tool_activity_upsert") return;
    expect(doneIntent.displayLabel).toBe("Searched PubMed");
    expect(doneIntent.outcomeSummary).toBe("Found 10 of 42 PubMed results.");
    expect(doneIntent.sourceBadge).toBe("PubMed");
    expect(doneIntent.detailItems).toEqual([
      "10 of 42 results",
      "PMID 40123456 · PMID 39887711",
    ]);
    expect(doneIntent.returnedCount).toBe(10);
    expect(doneIntent.totalResults).toBe(42);
    expect(doneIntent.resultIdentifiers).toEqual(["PMID 40123456", "PMID 39887711"]);
    expect(doneIntent.summary).toBe("Found 10 of 42 PubMed results.");
    expect(toolResultReduced.intents).toContainEqual({
      type: "progress_upsert",
      message: "Reviewing PubMed results",
    });
    expect(toolResultReduced.intents).toContainEqual({
      type: "checkpoint_append",
      label: "PubMed returned 42 results. The search is broad, so it is being narrowed next.",
    });
  });

  it("emits refinement progress and narrowing checkpoint for repeated PubMed searches", () => {
    let state = createInitialSharedStreamState({
      completedPubmedSearchCount: 1,
      lastPubmedSearchSize: 42,
    });

    const secondCall = reduceSharedStreamChunk(
      state,
      {
        type: "tool_call",
        toolCall: {
          id: "pubmed-2",
          name: "search_pubmed",
          arguments: { query: "\"retrospective cohort\" AND llm admission discharge" },
        },
      },
      meta,
    );
    state = secondCall.state;

    expect(secondCall.intents).toContainEqual({
      type: "progress_upsert",
      message: "Refining the PubMed query",
    });

    const secondResult = reduceSharedStreamChunk(
      state,
      {
        type: "tool_result",
        toolName: "search_pubmed",
        toolResult: {
          callId: "pubmed-2",
          result: {
            totalResults: 9,
            returnedCount: 4,
            results: [],
          },
        },
      },
      meta,
    );

    expect(secondResult.intents).toContainEqual({
      type: "checkpoint_append",
      label: "The latest PubMed search narrowed the result set from 42 to 9 results. Reviewing the strongest matches now.",
    });
    expect(secondResult.state.completedPubmedSearchCount).toBe(2);
    expect(secondResult.state.lastPubmedSearchSize).toBe(9);
  });

  it("replaces assistant content snapshots during replay instead of appending duplicates", () => {
    const initial = createInitialSharedStreamState({
      aiMessageCreated: true,
      fullContent: "Partial answer",
      effectiveConvId: "conv-1",
    });

    const reduced = reduceSharedStreamChunk(
      initial,
      {
        type: "content",
        content: "Recovered full answer",
        contentMode: "replace",
        replay: true,
      },
      meta,
    );

    expect(reduced.state.fullContent).toBe("Recovered full answer");
    expect(reduced.intents).toContainEqual({ type: "progress_clear" });
    expect(reduced.intents).toContainEqual({
      type: "assistant_upsert",
      text: "Recovered full answer",
      reasoning: undefined,
    });
  });

  it("reserves the assistant turn without visible content", () => {
    const reserved = reserveSharedAssistantTurn(createInitialSharedStreamState());

    expect(reserved.state.aiMessageCreated).toBe(true);
    expect(reserved.state.hasVisibleContent).toBe(false);
    expect(reserved.intents).toEqual([{ type: "assistant_reserve" }]);
  });

  it("clears progress only on the first visible content chunk", () => {
    let state = createInitialSharedStreamState();

    let reduced = reduceSharedStreamChunk(state, { type: "reasoning_start", reasoningId: "r1" }, meta);
    state = reduced.state;
    expect(reduced.intents.some((intent) => intent.type === "progress_clear")).toBe(false);

    reduced = reduceSharedStreamChunk(state, { type: "content", content: "Hello" }, meta);
    state = reduced.state;
    expect(reduced.intents.filter((intent) => intent.type === "progress_clear")).toHaveLength(1);

    reduced = reduceSharedStreamChunk(state, { type: "content", content: " world" }, meta);
    expect(reduced.intents.some((intent) => intent.type === "progress_clear")).toBe(false);
  });

  it("does not recreate ephemeral PubMed progress or checkpoints during replay", () => {
    let state = createInitialSharedStreamState();

    state = reduceSharedStreamChunk(
      state,
      {
        type: "tool_call",
        toolCall: {
          id: "pubmed-1",
          name: "search_pubmed",
          arguments: { query: "omega 3 cognition" },
        },
      },
      meta,
    ).state;

    const replayedCall = reduceSharedStreamChunk(
      state,
      {
        type: "tool_call",
        replay: true,
        toolCall: {
          id: "pubmed-1",
          name: "search_pubmed",
          arguments: { query: "omega 3 cognition" },
        },
      },
      meta,
    );
    expect(replayedCall.intents.some((intent) => intent.type === "progress_upsert")).toBe(false);

    const replayedResult = reduceSharedStreamChunk(
      replayedCall.state,
      {
        type: "tool_result",
        replay: true,
        toolName: "search_pubmed",
        toolResult: {
          callId: "pubmed-1",
          result: {
            totalResults: 42,
            returnedCount: 20,
            results: [{ pmid: "1234", title: "Study" }],
          },
        },
      },
      meta,
    );

    expect(replayedResult.intents.some((intent) => intent.type === "progress_upsert")).toBe(false);
    expect(replayedResult.intents.some((intent) => intent.type === "checkpoint_append")).toBe(false);
    expect(replayedResult.intents.some((intent) => intent.type === "ledger_changed")).toBe(false);
  });

  it("extends factual receipt metadata to OpenAlex search results", () => {
    let state = createInitialSharedStreamState();

    const toolCallReduced = reduceSharedStreamChunk(
      state,
      {
        type: "tool_call",
        toolCall: {
          id: "openalex-1",
          name: "search_openalex",
          arguments: { query: "triage AI emergency department" },
        },
      },
      meta,
    );
    state = toolCallReduced.state;

    const runningIntent = toolCallReduced.intents.find((intent) => intent.type === "tool_activity_upsert");
    expect(runningIntent && runningIntent.type === "tool_activity_upsert").toBe(true);
    if (!runningIntent || runningIntent.type !== "tool_activity_upsert") return;
    expect(runningIntent.displayLabel).toBe("Searching OpenAlex");
    expect(runningIntent.inputPreview).toBe("triage AI emergency department");
    expect(runningIntent.sourceBadge).toBe("OpenAlex");
    expect(runningIntent.queryPreview).toBe("triage AI emergency department");

    const toolResultReduced = reduceSharedStreamChunk(
      state,
      {
        type: "tool_result",
        toolName: "search_openalex",
        toolResult: {
          callId: "openalex-1",
          result: {
            totalResults: 18,
            returnedCount: 5,
            results: [
              { doi: "10.1000/openalex-1", metadata: { openAlexId: "https://openalex.org/W123" } },
              { metadata: { openAlexId: "https://openalex.org/W456" } },
            ],
          },
        },
      },
      meta,
    );

    const doneIntent = toolResultReduced.intents.find((intent) => intent.type === "tool_activity_upsert" && intent.status === "done");
    expect(doneIntent && doneIntent.type === "tool_activity_upsert").toBe(true);
    if (!doneIntent || doneIntent.type !== "tool_activity_upsert") return;
    expect(doneIntent.displayLabel).toBe("Searched OpenAlex");
    expect(doneIntent.outcomeSummary).toBe("Found 5 of 18 OpenAlex results.");
    expect(doneIntent.detailItems).toEqual([
      "5 of 18 results",
      "DOI 10.1000/openalex-1 · OpenAlex W456",
    ]);
    expect(doneIntent.returnedCount).toBe(5);
    expect(doneIntent.totalResults).toBe(18);
    expect(doneIntent.resultIdentifiers).toEqual(["DOI 10.1000/openalex-1", "OpenAlex W456"]);
    expect(doneIntent.summary).toBe("Found 5 of 18 OpenAlex results.");
  });

  it("extends factual receipt metadata to Semantic Scholar search results", () => {
    let state = createInitialSharedStreamState();

    state = reduceSharedStreamChunk(
      state,
      {
        type: "tool_call",
        toolCall: {
          id: "semantic-1",
          name: "search_semantic_scholar",
          arguments: { query: "llm triage emergency department" },
        },
      },
      meta,
    ).state;

    const toolResultReduced = reduceSharedStreamChunk(
      state,
      {
        type: "tool_result",
        toolName: "search_semantic_scholar",
        toolResult: {
          callId: "semantic-1",
          result: {
            totalResults: 11,
            returnedCount: 3,
            results: [
              { doi: "10.1000/s2-1", metadata: { s2PaperId: "abc123" } },
              { metadata: { s2PaperId: "def456" } },
            ],
          },
        },
      },
      meta,
    );

    const doneIntent = toolResultReduced.intents.find((intent) => intent.type === "tool_activity_upsert" && intent.status === "done");
    expect(doneIntent && doneIntent.type === "tool_activity_upsert").toBe(true);
    if (!doneIntent || doneIntent.type !== "tool_activity_upsert") return;
    expect(doneIntent.displayLabel).toBe("Searched Semantic Scholar");
    expect(doneIntent.outcomeSummary).toBe("Found 3 of 11 Semantic Scholar results.");
    expect(doneIntent.detailItems).toEqual([
      "3 of 11 results",
      "DOI 10.1000/s2-1 · S2 def456",
    ]);
    expect(doneIntent.returnedCount).toBe(3);
    expect(doneIntent.totalResults).toBe(11);
    expect(doneIntent.resultIdentifiers).toEqual(["DOI 10.1000/s2-1", "S2 def456"]);
    expect(doneIntent.summary).toBe("Found 3 of 11 Semantic Scholar results.");
  });

  it("keeps user input context from reducer meta", () => {
    const reduced = reduceSharedStreamChunk(
      createInitialSharedStreamState(),
      {
        type: "user_input_required",
        userInputRequest: {
          callId: "ask-2",
          question: "Pick one",
          questionType: "single_choice",
          options: [{ label: "One" }],
        },
      },
      { page: "draft", section: "intro" },
    );

    const appendIntent = reduced.intents.find((intent) => intent.type === "user_input_append");
    expect(appendIntent && appendIntent.type === "user_input_append").toBe(true);
    if (!appendIntent || appendIntent.type !== "user_input_append") return;
    expect(appendIntent.page).toBe("draft");
    expect(appendIntent.section).toBe("intro");
    expect(reduced.intents).toContainEqual({
      type: "progress_upsert",
      message: "Waiting for your answer",
    });
    expect(reduced.intents).toContainEqual({
      type: "checkpoint_append",
      label: "Need your answer before continuing: Pick one",
    });
  });

  it("derives truthful semantic receipts for read and inspection tools", () => {
    let state = createInitialSharedStreamState();

    const protocolCall = reduceSharedStreamChunk(
      state,
      { type: "tool_call", toolCall: { id: "read-protocol-1", name: "read_protocol", arguments: {} } },
      meta,
    );
    state = protocolCall.state;
    const protocolRunning = protocolCall.intents.find((intent) => intent.type === "tool_activity_upsert");
    expect(protocolRunning && protocolRunning.type === "tool_activity_upsert").toBe(true);
    if (!protocolRunning || protocolRunning.type !== "tool_activity_upsert") return;
    expect(protocolRunning.displayLabel).toBe("Reading protocol");
    expect(protocolRunning.inputPreview).toBe("Current project protocol");
    expect(protocolRunning.sourceBadge).toBe("Protocol");

    const protocolResult = reduceSharedStreamChunk(
      state,
      {
        type: "tool_result",
        toolName: "read_protocol",
        toolResult: {
          callId: "read-protocol-1",
          result: { hasProtocol: false, protocolContext: "[PROTOCOL_CONTEXT]\\nNo protocol defined yet.", protocol: {} },
        },
      },
      meta,
    );
    const protocolDone = protocolResult.intents.find((intent) => intent.type === "tool_activity_upsert" && intent.status === "done");
    expect(protocolDone && protocolDone.type === "tool_activity_upsert").toBe(true);
    if (!protocolDone || protocolDone.type !== "tool_activity_upsert") return;
    expect(protocolDone.displayLabel).toBe("Read protocol");
    expect(protocolDone.outcomeSummary).toBe("No protocol is defined yet.");

    const memoryResult = reduceSharedStreamChunk(
      createInitialSharedStreamState({ lastToolCallId: "inspect-memory-1", runningToolCallIds: ["inspect-memory-1"] }),
      {
        type: "tool_result",
        toolName: "inspect_memory",
        toolResult: {
          callId: "inspect-memory-1",
          result: {
            summary: "Found 2 active memories.",
            memories: [
              { id: "m1", memoryType: "project", key: "protocol_decision", value: "..." },
              { id: "m2", memoryType: "study", key: "study_methods", value: "..." },
            ],
          },
        },
      },
      meta,
    );
    const memoryDone = memoryResult.intents.find((intent) => intent.type === "tool_activity_upsert" && intent.status === "done");
    expect(memoryDone && memoryDone.type === "tool_activity_upsert").toBe(true);
    if (!memoryDone || memoryDone.type !== "tool_activity_upsert") return;
    expect(memoryDone.displayLabel).toBe("Checked memory");
    expect(memoryDone.outcomeSummary).toBe("Found 2 active memories.");
    expect(memoryDone.detailItems).toEqual(["protocol_decision", "study_methods"]);
  });

  it("derives truthful semantic receipts for delegation tools", () => {
    let state = createInitialSharedStreamState();

    const delegationCall = reduceSharedStreamChunk(
      state,
      {
        type: "tool_call",
        toolCall: {
          id: "delegate-search-1",
          name: "delegate_search",
          arguments: { task: "Search for omega-3 cognition trials and summarize the strongest studies." },
        },
      },
      meta,
    );
    state = delegationCall.state;

    const delegationRunning = delegationCall.intents.find((intent) => intent.type === "tool_activity_upsert");
    expect(delegationRunning && delegationRunning.type === "tool_activity_upsert").toBe(true);
    if (!delegationRunning || delegationRunning.type !== "tool_activity_upsert") return;
    expect(delegationRunning.displayLabel).toBe("Delegating search");
    expect(delegationRunning.inputPreview).toContain("omega-3 cognition");
    expect(delegationRunning.sourceBadge).toBe("Search agent");

    const delegationResult = reduceSharedStreamChunk(
      state,
      {
        type: "tool_result",
        toolName: "delegate_search",
        toolResult: {
          callId: "delegate-search-1",
          result: {
            success: true,
            summary: "Queued PubMed and OpenAlex searches and shortlisted 4 candidate studies.",
            toolCallCount: 3,
            stopReason: "completed",
            searchPlanUsed: true,
          },
        },
      },
      meta,
    );
    const delegationDone = delegationResult.intents.find((intent) => intent.type === "tool_activity_upsert" && intent.status === "done");
    expect(delegationDone && delegationDone.type === "tool_activity_upsert").toBe(true);
    if (!delegationDone || delegationDone.type !== "tool_activity_upsert") return;
    expect(delegationDone.displayLabel).toBe("Delegated search");
    expect(delegationDone.outcomeSummary).toBe("Queued PubMed and OpenAlex searches and shortlisted 4 candidate studies.");
    expect(delegationDone.detailItems).toEqual([
      "3 delegated tool calls",
      "Stop reason: completed",
      "Structured search plan used",
    ]);
  });

  it("fails dangling running tool when run ends", () => {
    const reduced = reduceSharedStreamChunk(
      createInitialSharedStreamState({
        lastToolCallId: "tc-9",
        runningToolCallIds: ["tc-9"],
      }),
      { type: "run_end", runStatus: "failed" },
      meta,
    );

    expect(reduced.intents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "run_set", runId: null }),
        expect.objectContaining({
          type: "tool_activity_upsert",
          callId: "tc-9",
          status: "failed",
        }),
      ]),
    );
    expect(reduced.state.runningToolCallIds).toEqual([]);
  });

  it("preserves structured error metadata on stream_error intents", () => {
    const reduced = reduceSharedStreamChunk(
      createInitialSharedStreamState(),
      {
        type: "error",
        error: "Validation failed.",
        errorMeta: {
          kind: "tool_schema_validation",
          code: "TOOL_VALIDATION_FAILED",
          retryable: false,
          source: "tool_validator",
          message: "Validation failed.",
        },
      },
      meta,
    );

    expect(reduced.intents).toContainEqual({
      type: "stream_error",
      message: "Validation failed.",
      errorMeta: {
        kind: "tool_schema_validation",
        code: "TOOL_VALIDATION_FAILED",
        retryable: false,
        source: "tool_validator",
        message: "Validation failed.",
      },
    });
  });

  it("fails all remaining running tools when calls interleave", () => {
    let state = createInitialSharedStreamState();

    state = reduceSharedStreamChunk(
      state,
      { type: "tool_call", toolCall: { id: "tc-A", name: "toolA", arguments: {} } },
      meta,
    ).state;

    state = reduceSharedStreamChunk(
      state,
      { type: "tool_call", toolCall: { id: "tc-B", name: "toolB", arguments: {} } },
      meta,
    ).state;

    state = reduceSharedStreamChunk(
      state,
      { type: "tool_result", toolName: "toolB", toolResult: { callId: "tc-B", result: { ok: true } } },
      meta,
    ).state;

    const runEnd = reduceSharedStreamChunk(
      state,
      { type: "run_end", runStatus: "failed" },
      meta,
    );

    const failedToolIds = runEnd.intents.reduce<string[]>((ids, intent) => {
      if (intent.type === "tool_activity_upsert" && intent.status === "failed") {
        ids.push(intent.callId);
      }
      return ids;
    }, []);

    expect(failedToolIds).toContain("tc-A");
    expect(failedToolIds).not.toContain("tc-B");
    expect(runEnd.state.runningToolCallIds).toEqual([]);
  });
});
