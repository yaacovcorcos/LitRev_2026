# Ask User V2 Design Direction

## Purpose

Define the target architecture for the next-generation `ask_user` feature before writing an implementation plan.

This is a design-direction document, not an active implementation tracker. Canonical status still belongs in [plan-agentic.md](../plan-agentic.md). Use this file when the team is ready to write the implementation plan for the clarification/decision-system redesign.

The goal is not to make the current card slightly nicer. The goal is to redesign `ask_user` into the best possible user-decision system for LitRev:

- clearer
- smarter
- more structured
- more trustworthy
- more durable
- more scalable than the current one-question primitive

## Current LitRev Baseline To Preserve

The current system already has strong runtime properties. V2 must preserve them.

Current local grounding:

- tool contract: [next-app/lib/server/ai/tools/ask-user.ts](../../../next-app/lib/server/ai/tools/ask-user.ts)
- shared types: [next-app/types/ai.ts](../../../next-app/types/ai.ts)
- runtime policy/controller: [next-app/lib/server/ai/clarification-controller.ts](../../../next-app/lib/server/ai/clarification-controller.ts)
- pause/suppress path: [next-app/lib/server/ai/ai-service.ts](../../../next-app/lib/server/ai/ai-service.ts)
- structured resolution route: [next-app/app/api/ai/stream/route.ts](../../../next-app/app/api/ai/stream/route.ts)
- shared reducer/runtime: [next-app/lib/ai/shared-stream-reducer.ts](../../../next-app/lib/ai/shared-stream-reducer.ts), [next-app/lib/ai/ai-stream-runtime.ts](../../../next-app/lib/ai/ai-stream-runtime.ts)
- project adapter: [next-app/contexts/project-conversation-stream-events.ts](../../../next-app/contexts/project-conversation-stream-events.ts)
- UI card: [next-app/components/artifacts/UserInputCard.tsx](../../../next-app/components/artifacts/UserInputCard.tsx)
- current runtime contract docs: [plan-agentic.md](../plan-agentic.md), [plan-agent-quality.md](../plan-agent-quality.md), with historical supporting notes in [chat-runtime.md](../chat-runtime.md) and [transparency-ui.md](../transparency-ui.md)

Preserve these invariants:

1. Blocking clarification remains request-bound, not plain-turn prose.
2. Canonical request identity remains `sourceRunId + callId`.
3. Answer/default/cancel remain structured runtime actions, not local shell heuristics.
4. Clarification state remains durable and visible in transcript history.
5. Freeform blocked rewrite remains a truthful supersede/new-turn path.
6. Runtime policy, not prompt-only discipline, owns suppression and fallback.
7. Cross-surface parity remains mandatory for `/ai`, main conversation, and side-panel copilot.
8. The shipped single-question baseline already carries additive `questionId` support; V2 should build on that instead of reintroducing question identity as a UI-only heuristic later.

## Why V2 Is Needed

The current feature is runtime-safe but still too small for the real product problem.

Today `ask_user` is basically:

- one blocking question
- one pending request
- one answer/default/cancel resolution
- one continuation seed

That is a good primitive, but it is not yet a real decision system.

Current limitations:

1. The model asks for an "answer" when what it usually needs is a structured decision.
2. The payload is too thin for ambiguity, caveats, or partial agreement.
3. The controller is budget-smart but not quality-smart.
4. The UI is still a form card instead of a high-trust decision interface.
5. Resolved clarification is not yet a first-class reusable decision object.
6. The system is still too question-centric and not decision-centric.

## External Reference: What Codex Built

This direction is informed by the open-source Codex implementation at commit:

- `dedd1c386a9bb2b4031d26b0494217a20868fb7a`

Primary Codex references:

- tool schema:
  - [codex-rs/tools/src/request_user_input_tool.rs](https://github.com/openai/codex/blob/dedd1c386a9bb2b4031d26b0494217a20868fb7a/codex-rs/tools/src/request_user_input_tool.rs)
- tool handler:
  - [codex-rs/core/src/tools/handlers/request_user_input.rs](https://github.com/openai/codex/blob/dedd1c386a9bb2b4031d26b0494217a20868fb7a/codex-rs/core/src/tools/handlers/request_user_input.rs)
- core protocol:
  - [codex-rs/protocol/src/request_user_input.rs](https://github.com/openai/codex/blob/dedd1c386a9bb2b4031d26b0494217a20868fb7a/codex-rs/protocol/src/request_user_input.rs)
- TUI interaction note:
  - [docs/tui-request-user-input.md](https://github.com/openai/codex/blob/dedd1c386a9bb2b4031d26b0494217a20868fb7a/docs/tui-request-user-input.md)
- app-server request/response contract:
  - [codex-rs/app-server/README.md](https://github.com/openai/codex/blob/dedd1c386a9bb2b4031d26b0494217a20868fb7a/codex-rs/app-server/README.md)
- round-trip tests:
  - [codex-rs/app-server/tests/suite/v2/request_user_input.rs](https://github.com/openai/codex/blob/dedd1c386a9bb2b4031d26b0494217a20868fb7a/codex-rs/app-server/tests/suite/v2/request_user_input.rs)
- replay and cleanup behavior:
  - [codex-rs/tui/src/app/pending_interactive_replay.rs](https://github.com/openai/codex/blob/dedd1c386a9bb2b4031d26b0494217a20868fb7a/codex-rs/tui/src/app/pending_interactive_replay.rs)
- history rendering:
  - [codex-rs/tui/src/history_cell.rs](https://github.com/openai/codex/blob/dedd1c386a9bb2b4031d26b0494217a20868fb7a/codex-rs/tui/src/history_cell.rs)

Codex ideas worth reusing:

1. Bounded multi-question requests.
2. Stable per-question ids.
3. Choice plus nuance, not just one answer string.
4. Dedicated interactive request lifecycle.
5. Explicit replay and cleanup semantics.
6. Structured resolved-history rendering.
7. Secret-answer support in the schema.

Codex ideas to reject or improve:

1. Do not encode "recommended" by putting `(Recommended)` in the option label.
2. Do not force every question to be option-based.
3. Do not encode notes as string hacks like `user_note: ...`.
4. Do not make the design terminal/TUI-shaped when LitRev is transcript-and-surface-first.
5. Do not auto-add "Other" as the default escape hatch for every decision; nuance and unconstrained answers are different problems.

## Core Strategic Decision

`ask_user` should stay the model-facing tool name for continuity, but V2 should stop modeling the feature internally as "one question waiting for one answer."

The internal product/runtime concept should become:

**Decision Request**

That means:

- keep the external tool name `ask_user`
- redesign the internal contract around a first-class decision object
- let a decision request contain one to three tightly coupled questions
- persist decision requests as structured domain objects, not just ephemeral tool payloads plus events

This is the central V2 decision.

## North Star

`ask_user` v2 should become the system for handling irreversible or meaningfully divergent user decisions with maximum trust and minimum interruption.

Success means:

1. The agent blocks less often.
2. When it blocks, the user immediately understands why.
3. The user sees what changes depending on the answer.
4. The safest path is obvious.
5. The answer can carry nuance without collapsing into ambiguity.
6. The runtime can remember and reuse the decision later.
7. Recovery, replay, and transcript history remain truthful.

## Non-Negotiable Design Decisions

### 1. Keep `ask_user` as the only blocking clarification primitive

Do not add a second overlapping tool such as `request_user_input` beside `ask_user`.

Reason:

- LitRev already has one mature runtime contract around `ask_user`.
- A second overlapping primitive would split prompt guidance, test coverage, and surface behavior.
- The right move is to evolve the schema and internal domain model while preserving one canonical entrypoint.

### 2. Redesign around `DecisionRequest`, not `UserInputRequest`

The current `UserInputRequest` shape is too thin for the next phase.

V2 should introduce a first-class internal decision model:

- `DecisionRequest`
- `DecisionQuestion`
- `DecisionOption`
- `DecisionResolution`
- `DecisionAnswer`

Compatibility path:

- `ask_user` tool still emits a tool result
- transport can still emit `user_input_required` / `user_input_resolved` for compatibility during migration
- but the canonical in-memory and persisted runtime object should become decision-oriented

### 3. Allow 1-3 tightly coupled questions only

Adopt Codex's bounded multi-question idea, but with a stricter LitRev rule:

- prefer 1 question
- allow 2 or 3 only when they belong to the same decision boundary and the same continuation point
- never bundle unrelated questions to save a round trip

Allowed examples:

- direction + study-scope qualifier
- recommendation acceptance + one required constraint

Disallowed examples:

- topic choice plus unrelated formatting preference
- protocol handoff plus a future search-style preference

### 4. Every question must have a stable id

Each question needs a stable `questionId`, separate from `callId`.

Reason:

- answer mapping
- partial completion
- replay
- history rendering
- analytics
- decision memory
- future editable/reopenable workflows

### 5. Recommendation semantics must be explicit, not label-encoded

Unlike Codex, LitRev should not encode recommendation through option ordering or label suffixes.

Each option should support explicit fields like:

- `optionId`
- `label`
- `description`
- `impact`
- `isRecommended`
- `recommendedReason`

Request-level recommendation should also be explicit when the recommended path spans multiple questions.

### 6. Choice and nuance should coexist cleanly

Codex is right that structured choice alone is not enough. Users need a way to add nuance.

LitRev V2 should support:

- selected option(s)
- optional note
- free-text answer when the question is truly open

But do not always auto-add an unconstrained "Other" option.

Reason:

- many LitRev decision boundaries are intentionally constrained
- always allowing "Other" weakens the runtime's ability to reason about consequences
- note support is a better default than unconstrained branching

Design decision:

- for choice questions, note support is first-class
- explicit `allowOther` is opt-in, not universal

### 7. Secret answers should be supported in the schema

Adopt the Codex idea of `isSecret`.

Even if it is not common today, it is cheap to model early and expensive to bolt on later.

Use cases:

- credentials
- API keys
- institution-restricted values
- sensitive internal identifiers

### 8. Decision requests should be persisted as first-class entities

This is the biggest structural redesign and it is worth it.

Do not keep V2 as run-event-only truth.

Introduce canonical persistence for decision requests and resolutions.

Reason:

- multi-question support
- partial answers
- interrupted answering
- replay
- lifecycle transitions
- analytics
- decision reuse/memory
- future reopening or supersession

Recommended direction:

- canonical persistence in dedicated DB entities
- run events remain append-only transport/history mirrors
- transcript rendering reads the canonical entity shape, not just replayed event payloads

### 9. The lifecycle must become richer than answered/cancelled

V2 lifecycle should explicitly model:

- `pending`
- `answered`
- `accepted_recommended`
- `cancelled`
- `superseded`
- `interrupted`
- `stale`
- `expired` if the request is no longer valid to answer

The current model is too narrow for a richer system.

### 10. Partial answers must be a first-class concept

Codex's overlay already hints at this need but does not fully persist interrupted partial answers yet.

LitRev should support partial completion from the start.

Examples:

- question 1 answered, question 2 deferred
- choice selected, note half-written, run interrupted
- multi-question request superseded by a fresh user turn

This must be explicit in persistence and UI state.

### 11. Clarification policy should become quality-aware, not just budget-aware

The current controller is useful, but V2 should add a decision-quality layer before the budget layer.

The system should ask:

- Is the decision truly blocking?
- Is it too early to ask?
- Is the decision reversible enough to proceed under a default?
- Can this be deferred to review/proposal time?
- Is the question well-formed for a human?
- Is the recommended path strong enough to avoid blocking?

The budget controller still matters, but it should be the outer guardrail, not the whole brain.

### 12. Resolved decisions should become reusable memory, not just continuation text

A resolved decision should be a structured reusable fact:

- what the user chose
- under what boundary
- with what scope
- with what caveat

This should be eligible for:

- same-run continuation
- future same-conversation reuse
- project memory when appropriate

V2 should be designed so decision-memory integration is natural, not bolted on later.

## Target V2 Domain Model

### DecisionRequest

Suggested shape:

- `id`
- `callId`
- `sourceRunId`
- `rootRunId`
- `conversationId`
- `projectId?`
- `studyId?`
- `decisionBoundaryKey`
- `decisionKind`
- `blockingLevel`
- `whyThisDecisionIsNeeded`
- `whatChangesIfYouChooseDifferently`
- `reversible`
- `canProceedUnderRecommendation`
- `recommendedPathSummary?`
- `recommendedPathReason?`
- `status`
- `questions[]`
- `createdAt`
- `resolvedAt?`
- `supersededByTurnId?`

### DecisionQuestion

Suggested shape:

- `questionId`
- `header`
- `prompt`
- `responseKind`
- `required`
- `allowNote`
- `allowOther`
- `isSecret`
- `recommendedOptionId?`
- `options[]`

### DecisionOption

Suggested shape:

- `optionId`
- `label`
- `description`
- `impact`
- `isRecommended`
- `recommendedReason?`

### DecisionAnswer

Suggested shape:

- `questionId`
- `selectedOptionIds[]`
- `note?`
- `freeText?`
- `skipped`

### DecisionResolution

Suggested shape:

- `requestId`
- `callId`
- `sourceRunId`
- `resolutionKind`
- `answersByQuestionId`
- `resolvedByUserTurnId?`
- `answeredAt`
- `decisionBoundaryKey`

## Target UX Direction

### Core UX thesis

This should stop feeling like "the model asked me a form question."

It should feel like:

**"The system hit a real decision boundary, here is why it matters, here is the safest path, and here is the smallest amount of input needed from me."**

### V2 UI contract

Every active decision request should show:

1. a short header
2. the actual question(s)
3. why the decision matters
4. what changes depending on the answer
5. recommended path with clear reasoning
6. structured choices
7. optional nuance/note path
8. explicit actions:
   - use recommended path
   - answer manually
   - cancel and rewrite
   - stop here if appropriate

### Interaction model

Preferred web interaction:

- transcript item remains durable and visible
- active decision opens an inline focused decision workspace
- multi-question requests use a compact stepper inside the same transcript item
- resolved requests collapse into a compact structured summary

Do not use:

- transient modal-only semantics
- hidden side effects that disappear from transcript history

### Resolved-history rendering

Resolved decision history should show:

- decision header
- question(s)
- selected answer(s)
- note if present
- recommended-path-used badge when relevant
- cancelled/superseded/interrupted states explicitly

This is one of the best ideas from Codex's history rendering and should be adopted.

## Runtime Contract Direction

### Keep request-bound identity

Keep `sourceRunId + callId` as the canonical request identity.

Do not regress to heuristic matching.

### Add question-level identity

Runtime and UI should also understand `questionId`.

### Continue using structured resume

Do not go back to plain user-turn resume.

V2 continuation should still be request-bound, but the continuation context should be built from the richer structured decision object rather than a thin answer string.

### Add explicit supersession

Today freeform blocked rewrite is "cancel-and-new-run."

V2 should formalize this as:

- decision request becomes `superseded`
- the new user turn records that supersession link

That is a better domain model than treating everything as generic cancellation.

### Partial completion should be resumable only when safe

The runtime should distinguish:

- valid partial answer that still permits continuation
- partial answer that is insufficient for safe continuation
- interrupted partial state that can be resumed later

### Recommendation-driven continuation should be explicit

Current fallback order is good. V2 should preserve it but express it in the richer model:

1. use recommended path
2. bounded terminal decision
3. truthful stop

## Policy Direction

### Ask later when possible

The system should prefer:

- evidence first
- recommendation second
- user interruption last

This is especially important in LitRev because many early questions become easier to answer after the agent has gathered evidence.

### Ask only for meaningful divergence

`ask_user` v2 should be reserved for:

- irreversible branches
- materially divergent outputs
- user-value tradeoffs that cannot be safely defaulted
- policy/ownership boundaries where the system should not assume

### Prefer recommendation over mere questioning

The system should not ask:

"Which path do you want?"

when it could honestly ask:

"I recommend X because Y. Do you want me to continue with that, or choose one of these alternatives?"

That should become the default clarification style.

## What We Should Explicitly Adopt From Codex

1. bounded multi-question requests
2. stable per-question ids
3. choice-plus-note answer model
4. dedicated request lifecycle
5. replay/cleanup discipline
6. completed-history rendering
7. secret-answer capability

## What We Should Explicitly Not Copy

1. recommended-path encoding through label text
2. option-only bias for every question
3. note encoding as ad hoc strings inside answer arrays
4. terminal/TUI-shaped interaction assumptions
5. automatic unrestricted "Other" on every question

## Evaluation And Test Direction

The future implementation plan should treat this as a test-heavy redesign.

Minimum new coverage areas:

1. one-question backward-compatibility path
2. bounded multi-question request/resolution
3. structured choice plus note
4. explicit recommended-path acceptance
5. partial answer persistence
6. interrupted decision request replay
7. superseded request lifecycle
8. stale answer rejection
9. cross-surface parity
10. structured resolved-history rendering
11. scoping policy overlay on richer decision objects
12. decision-memory extraction/reuse if included in the same implementation slice

## Recommendation For Planning

When the implementation plan is written, it should assume a real redesign, not an incremental card polish.

Recommended execution framing:

1. keep the external tool name `ask_user`
2. introduce the `DecisionRequest` domain model
3. build dedicated persistence for request/resolution state
4. add multi-question support with strict bundling rules
5. redesign the UI around decision-quality interaction
6. migrate the controller from question-budgeting to decision-quality plus budget guardrails
7. preserve current runtime invariants throughout migration

## Final Recommendation

The best direction for LitRev is:

- **not** a tiny enhancement to the current card
- **not** a direct copy of Codex's `request_user_input`
- **not** a second overlapping tool

The best direction is:

**keep `ask_user` as the canonical model-facing primitive, but redesign the feature underneath it into a first-class persisted decision system with bounded multi-question support, structured answers, recommendation-first UX, partial/interrupted lifecycle truth, and reusable decision memory.**

That is the highest-quality path for this codebase and product.
