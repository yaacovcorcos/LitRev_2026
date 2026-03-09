# Thinking + Live Process UX V2 Plan

## Purpose
Define the canonical architecture for a truthful execution trace so users can follow what the agent is doing, what it found, and what happens next without relying on raw chain-of-thought visibility.

This plan is not just about a prettier reasoning lane. It is the architecture home for:
- live process visibility
- tool receipts and result summaries
- grounded checkpoints between tool calls and final answers
- optional reasoning display
- cross-surface truth contracts for `/ai`, project copilot, and any future compact surfaces

## North Star
At any moment, the user should be able to answer five questions:
1. What is the agent doing right now?
2. What just finished?
3. What did it find?
4. What is it doing next?
5. What, if anything, does it need from me?

The system should satisfy that even when the selected model emits no provider-native reasoning stream at all.

## Current Failure Modes
The current runtime already has useful primitives, but the visible execution trace is still too weak.

### Tool cards are real but too lossy
- Tool activity cards exist and correctly reflect tool lifecycle (`running|done|failed`).
- The timeline currently drops most successful tool inputs/outputs, so users cannot see:
  - the search query
  - the result count
  - why repeated calls happened
  - what changed between attempts

### Progress is too generic
- Generic progress labels are still derived from tool name only (for example `Searching PubMed...`).
- They do not distinguish phases such as:
  - searching
  - analyzing results
  - refining the query
  - drafting output

### Project copilot still degrades progress into assistant text
- `/ai` has a dedicated progress item.
- project copilot still treats progress too much like assistant content.
- This creates stale or misleading “it is still searching” moments even after the tool cards are done.

### Reasoning visibility is optional but not dependable
- The UI can display `reasoning_start|delta|end`.
- In practice, provider/model support is inconsistent, so raw reasoning cannot be the primary transparency mechanism.

### The middle layer is missing
- There is still no durable checkpoint model that explains:
  - what a tool result means
  - what the agent concluded
  - why the next action is happening

## Strategic Position
The correct product strategy is:

**Do not optimize for showing “thoughts.” Optimize for showing truthful process.**

That means the primary transparency layer should be grounded in:
- observable runtime facts
- compact summaries derived from those facts

Raw/provider-native reasoning should remain optional and secondary.

## Truth Model
Every visible process item should fall into one of these categories:

### 1. Observed facts
Directly grounded in tool input/output or runtime state.
Examples:
- tool started
- tool finished
- query used
- result count returned
- duration
- explicit blocked/waiting state

### 2. Grounded summaries
Compact summaries generated from observed facts.
Examples:
- Most PubMed hits are about triage rather than final disposition.
- I’m narrowing the search to retrospective cohort studies.
- No study context is selected yet, so I need your answer before continuing.

### 3. Provider reasoning
Optional model-native thinking stream.
Examples:
- Anthropic/OpenAI/xAI reasoning deltas when available

Rule:
- provider reasoning is additive, never the only transparency layer

## Core UX Architecture
The chat should expose distinct but coordinated layers.

### Layer A: Live phase
One ephemeral current state, for example:
- Searching PubMed
- Analyzing PubMed results
- Refining the query
- Reading the PDF
- Drafting protocol update
- Waiting for your answer

This is process state, not assistant prose.

### Layer B: Tool receipts
Each meaningful tool call leaves a durable receipt with:
- human-readable label
- compact input preview
- compact output summary
- authoritative duration
- status

Search tools should also show:
- query preview
- returned count / total count
- source badge where relevant

### Layer C: Checkpoints
After meaningful tool steps, the runtime should emit a short grounded checkpoint:
- what happened
- what was learned
- what happens next

This is the missing “middle lane” between tool receipts and final answer.

### Layer D: Optional reasoning
If provider-native reasoning exists and the user wants it, show it in a collapsible lane.
If not, the user should still have a strong understanding of the process from phases + receipts + checkpoints.

### Layer E: Blocking clarification
Required user input should continue using the existing `ask_user` / `user_input_required` path.
Optional suggestions should remain `<choices>` only.

## Locked Product Decisions
1. **Primary transparency is structured execution trace, not raw chain-of-thought.**
2. **Progress is not assistant transcript content.**
3. **Tool cards must become semantic receipts, not raw tool ids with status only.**
4. **Checkpoints are first-class and should exist even when no provider reasoning is available.**
5. **Reasoning display is optional and secondary.**
6. **Cross-surface truth is mandatory:** the same runtime state should not look fundamentally different on `/ai` and project copilot.

## Runtime Architecture Decisions

### Shared ownership model
Keep the current architectural split:
- `shared-stream-reducer.ts` owns normalized event/state reduction
- `ai-stream-runtime.ts` owns shared client-side trace application
- `TimelineRenderer.tsx` owns display

Do not fork per-surface semantics unless a surface is explicitly reduced and documented as such.

### Tool metadata must become trace-aware
The tool registry should eventually carry trace metadata such as:
- display label
- input preview builder
- success summary builder
- failure summary builder
- checkpoint builder
- default phase mapping

This allows search tools, read tools, write/proposal tools, and delegation tools to all present truthful receipts using one contract.

### Server owns authoritative semantics
The server/runtime path should eventually emit:
- phase changes
- canonical receipt summaries
- authoritative duration
- checkpoint content

The client should not be inventing semantic meaning from raw tool ids.

## Visual Strategy
The execution trace should feel calm, compact, and continuously informative.

The goal is not to show more boxes. The goal is to show the right information with the least visual noise.

### Primary UX Principles
1. **One live thing at a time.**
   - At most one primary live-phase component should be visually emphasized.
   - Users should always know the current step without scanning a stack of simultaneous active cards.
2. **Progressive disclosure over card sprawl.**
   - The default state should be compact:
     - one live phase
     - compact receipts
     - short checkpoints
   - Detailed payloads, raw reasoning, and long result lists should stay behind explicit expansion.
3. **Receipts are durable, progress is ephemeral.**
   - Live phase/progress should shrink, transition, or disappear once the step ends.
   - Durable receipts should keep the audit trail without feeling like a second transcript.
4. **Checkpoints should read like calm narration, not logs.**
   - They should explain what changed in one or two short lines.
   - They should not look like debug output or raw JSON.
5. **Assistant messages should remain conversational.**
   - Process UI should not masquerade as assistant prose.
   - The transcript should not be cluttered with stale status messages.

### Recommended Visual Hierarchy

#### 1. Live phase row
This should be the main active process indicator.

Recommended visual form:
- a slim inline row or pill block
- icon + short phrase + subtle spinner
- optional secondary text for current sub-step

Examples:
- `Searching PubMed`
- `Analyzing PubMed results`
- `Refining search strategy`

Rules:
- only one primary live phase should be visible at a time
- transitions should be cross-fade or height-collapse, not sudden jumps
- this row is ephemeral and should not persist as if it were a durable result

#### 2. Compact tool receipts
Receipts should be durable but low-noise.

Recommended default structure:
- left: icon/status dot
- main line: human label (`Search PubMed`)
- secondary line: compact summary (`Query refined; 10 of 42 results`)
- right: short status/duration badge

Rules:
- default height should stay small
- raw internal tool ids should never be the primary label
- repeated tool invocations should be visually grouped when they belong to the same strategy sequence

#### 3. Quiet checkpoints
Checkpoints should be lighter than receipts and feel like “what changed.”

Recommended visual form:
- subtle inline block between receipts/assistant text
- no heavy chrome
- slightly different tone from assistant prose

Examples:
- `Found 42 results, but most focus on triage rather than final disposition.`
- `Narrowing to retrospective cohort studies with clinician vs model comparison.`

Rules:
- checkpoint text should be short
- one checkpoint per meaningful transition, not per microstep
- checkpoints should reduce the need for users to read raw reasoning

#### 4. Optional reasoning panel
Reasoning should stay collapsible and secondary.

Recommended visual form:
- tucked behind the assistant message that owns it
- collapsed by default in normal use
- open automatically only while live reasoning is actively streaming if the user enabled it

Rules:
- no giant reasoning blocks by default
- no dependence on reasoning presence for user comprehension
- reasoning should never displace the main process trace

### Search-Specific Visual Rules
Search is the first proving ground and needs extra discipline.

For repeated search calls, the UI should not show a stack of nearly identical cards with no explanation.

Recommended pattern:
- group contiguous search receipts into a compact “search sequence”
- show each query as a compact row inside the sequence
- show one checkpoint after the sequence explaining the refinement

Default collapsed view:
- `Search PubMed (4 queries)`
- secondary text: `Narrowed from broad disposition terms to retrospective cohort comparisons`

Expanded view:
- each query row
- result counts
- durations

This makes search look strategic instead of repetitive.

### Motion and Layout Rules
1. Use subtle transitions only:
   - opacity fades
   - small height transitions
   - no large layout jumps
2. Prefer inline evolution:
   - live phase becomes receipt
   - receipt stays in place
   - checkpoint appears beneath it
3. Avoid tall stacked chrome:
   - multiple bordered cards in a row should be the exception, not the default
4. Preserve reading flow:
   - assistant text, checkpoints, and receipts should read top-to-bottom without forcing the user to decode a dashboard

### Hard Anti-Patterns
Do not ship these patterns:
- generic progress text rendered as assistant transcript content
- one large card per microstep
- raw tool ids as user-facing labels
- multiple simultaneous “running” cards with equal visual priority
- long reasoning dumps open by default
- durable receipts that repeat exactly the same label with no semantic differentiation

## External Patterns Worth Borrowing
These references are not implementation templates, but they show useful design principles.

### Agent Prism
Reference: [Agent Prism](https://github.com/evilmartians/agent-prism)

Useful ideas:
- normalized trace model optimized for UI rendering
- compact tree/list primary view
- deeper detail only on explicit inspection

What to borrow:
- durable trace records should be compact by default and rich on demand

What not to copy directly:
- developer-facing trace density and span terminology are too technical for LitRev’s default user surface

### LangGraph Studio
Reference: [LangGraph Studio](https://github.com/anygrab-kick/langchain-ai-langgraph-studio)

Useful ideas:
- explicit step/thread identity
- clear interrupt points
- execution feels inspectable, not magical

What to borrow:
- steps and waits should be first-class and explicit

What not to copy directly:
- graph/node visualization is too developer-oriented for the main LitRev chat surface

### OpenCode
Reference: local OSS repo analysis at `cloned_repos/opencode_repo`

Useful ideas:
- delegated work and visible progress should be separated
- execution units and user-facing checklist/progress are not the same thing

What to borrow:
- do not confuse agent task execution with user-facing progress narration

What not to copy directly:
- file-based planning mode is not the right UX model for LitRev chat surfaces

## Surface Contract

### `/ai`
- full execution trace surface
- progress lane
- receipts
- checkpoints
- optional reasoning lane

### Project copilot
- same underlying trace contract as `/ai`
- more compact layout allowed
- but no transcript-progress masquerade
- no semantic downgrades that make process state look like assistant speech
- compactness should come from denser spacing and lighter chrome, not from dropping meaning

### Popup
- only opt in once popup can honestly render the relevant trace primitives
- otherwise keep popup out of scope rather than pretending to support the same transparency layer

## Phase Model
The runtime should move toward phase-aware reporting instead of generic tool-name progress.

Recommended phase families:
- `searching`
- `analyzing_results`
- `refining_strategy`
- `reading`
- `drafting`
- `waiting_for_user`
- `applying_change`
- `verifying`

Search is the clearest first proving ground:
- `Searching PubMed`
- `Analyzing PubMed results`
- `Refining search strategy`

## Search Workflow Strategy
Search tools should become the first-class proof of the architecture.

For search workflows, the user should be able to see:
- the query used
- how many results came back
- what the search revealed
- why another search is happening

Repeated search calls should either:
- be visibly grouped into a search strategy sequence
or
- be differentiated enough through receipts/checkpoints that repetition feels justified

## Non-Goals
This plan does not aim to:
- expose raw chain-of-thought by default
- dump raw tool payloads into the UI
- narrate every token-level microstep
- redesign suggestion chips or ask-user UX
- change `<choices>` extraction or event shape

## Execution Sequence

### Phase V2.0 - Contract lock
1. Freeze the execution-trace truth model:
   - live phase
   - tool receipts
   - checkpoints
   - optional reasoning
2. Freeze the product rule that process state must not be rendered as assistant transcript content.

Exit criteria:
- One canonical transparency model exists.
- No future work needs to guess whether “thinking” means reasoning, progress, or checkpoints.

### Phase V2.1 - Tool receipt semantics
1. Preserve tool inputs/results needed for user-visible receipts.
2. Humanize tool names and add compact input/output summaries.
3. Prefer authoritative server duration over client-only deltas where possible.

Exit criteria:
- Tool cards explain what actually happened, not just that something ran.

### Phase V2.2 - Phase-aware progress
1. Replace generic tool-name progress with phase-aware progress.
2. Stop showing stale or misleading phase text after a tool already finished.
3. Remove transcript-style progress masquerade on project copilot.

Exit criteria:
- Current process state is honest and ephemeral.
- Project copilot no longer looks like the assistant is “saying” old progress labels.

### Phase V2.3 - Checkpoints
1. Add grounded checkpoints after meaningful tool results.
2. Use them to explain:
   - what was found
   - what changed
   - what happens next

Exit criteria:
- Users can follow the process even without provider-native reasoning.

### Phase V2.4 - Reasoning parity and refinement
1. Improve reasoning-lane behavior where models/providers support it.
2. Keep reasoning additive and user-controlled.
3. Do not let reasoning become the only visible explanation layer.

Exit criteria:
- Reasoning is useful when present, but the system stays intelligible when absent.

### Phase V2.5 - Guardrails and rollout
1. Extend existing shared tests first.
2. Keep architecture guard scripts enforced.
3. Roll out by surface after parity confidence is high.

Exit criteria:
- Trace semantics are shared across supported surfaces.
- Drift is caught by tests/guardrails rather than user reports.

## Risks and Mitigations
1. Risk: showing too much noise instead of clarity.
   - Mitigation: default to receipts + checkpoints; keep raw reasoning secondary.
2. Risk: UI drift across surfaces.
   - Mitigation: shared reducer/runtime contract first; compact layouts only change presentation.
3. Risk: fake transparency.
   - Mitigation: prefer observed facts and grounded summaries over inferred “thinking.”
4. Risk: latency regressions from richer trace UI.
   - Mitigation: preserve shared streaming architecture, coalescing, and render throttling.

## Plan Alignment
Track implementation under existing governance items:
- `CUX-027` (tool receipts / copilot UX)
- `CUX-D01` (chat architecture unification)

This plan should also inform future agent-runtime work when execution-trace semantics cross the server/runtime boundary.

## Validation Gates (Per PR)
1. `cd next-app && npx tsc --noEmit`
2. `cd next-app && npx vitest run`
3. `cd next-app && node scripts/check-chat-stream-architecture.mjs --mode=enforce`
4. Manual smoke:
   - search receipt clarity (`/ai` + project copilot)
   - progress lane truthfulness
   - reasoning visibility (`off/summary/full`)
   - checkpoint readability
   - ask-user vs optional suggestion separation
   - compactness and visual stability during repeated search/refinement loops
