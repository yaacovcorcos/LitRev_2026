# Thinking + Live Process UX V2 Plan

## Purpose
Define the canonical architecture for a truthful execution trace so users can follow what the agent is doing, what it found, and what happens next without relying on raw chain-of-thought visibility.

This plan is not just about a prettier reasoning lane. It is the architecture home for:
- conditional task-outline visibility for complex work
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

### Progress is still too uneven outside the PubMed proving ground
- PubMed now has stronger live progress semantics (`Searching`, `Refining`, `Reviewing`, `Waiting`).
- Most other workflows still rely on generic tool-name-derived labels.
- They still do not distinguish phases such as:
  - searching
  - analyzing results
  - reading source material
  - comparing candidates
  - drafting output

### Cross-surface parity is improved but not complete
- `/ai`, sidebar copilot, and the main project conversation now preserve the same core shared trace primitives for the shipped PubMed path.
- Popup still lacks full timeline-style parity.
- Some surfaces still achieve compactness through reduced presentation rather than fully mature semantic coverage.

### Reasoning visibility is optional but not dependable
- The UI can display `reasoning_start|delta|end`.
- In practice, provider/model support is inconsistent, so raw reasoning cannot be the primary transparency mechanism.

### The middle layer exists but only for the first proving ground
- Shared checkpoints now exist as a real provider-independent narration layer.
- Today they are meaningfully authored only for the PubMed workflow and blocking clarification states.
- Most other workflows still have receipts without enough grounded explanation of:
  - what the result means
  - why the next action is happening

## Strategic Position
The correct product strategy is:

**Do not optimize for showing “thoughts.” Optimize for showing truthful process.**

That means the primary transparency layer should be grounded in:
- observable runtime facts
- compact summaries derived from those facts

Raw/provider-native reasoning should remain optional and secondary.

## Current Implementation Status
- Project copilot now treats live progress as ephemeral process state instead of rendering it as assistant transcript text.
- PubMed tool receipts now preserve compact factual metadata (`queryPreview`, `returnedCount`, `totalResults`) through the shared trace path.
- Project copilot and the main project conversation now preserve shared checkpoint semantics through the structured message bridge instead of dropping them on project surfaces.
- Repeated adjacent PubMed searches are grouped in the renderer into one compact in-chat search sequence card; the canonical runtime record remains atomic.
- Shared reducer semantics now derive PubMed-specific live progress (`Searching`, `Refining`, `Reviewing`) plus selective grounded checkpoints from runtime search facts alone; provider reasoning remains unnecessary for understanding the workflow.
- Executable search evals now exercise the live chat/runtime orchestration path for direct, delegated, zero-result, and failed search scenarios instead of relying only on catalog-shape validation.
- The shared search receipt path now extends beyond PubMed: OpenAlex and Semantic Scholar preserve source label, query preview, result counts, and compact identifiers through the reducer, renderer, and project message bridge on the main timeline surfaces.
- Completed answer turns can now collapse a conservative pre-answer durable trace block into a compact reopenable `Process details` summary placed above the final assistant answer. This renderer-only grouping is heuristic, ignores `progress`, skips ambiguous/blocking/error cases, and keeps the underlying timeline facts intact.
- Popup now preserves a truthful reduced subset of the shared trace contract: live progress, checkpoints, blocking clarification, and structured terminal errors all flow through shared reducer semantics even though popup still hides full receipt/artifact density.
- `/ai`, the main project conversation, and embedded project copilot now elevate the single live `progress` row into a composer-adjacent status bar while keeping receipts, checkpoints, grouped PubMed sequences, and terminal errors inline; suppression of the matching inline progress row is render-only and uses each surface's local progress id.
- `/ai` and project copilot now reconcile known-run abnormal disconnects against persisted run truth: recovery is driven by `AgentRun` + authoritative replayable `RunEvent`s, unfinished live tool activity becomes explicitly interrupted instead of hanging indefinitely, `Reconnect` / `Retry` / `Stop & Retry` come from structured recovery metadata instead of generic retry flags, paused-for-input is treated as a successful terminal handoff rather than a failure, and replay restores only persisted authoritative truth rather than ephemeral live progress.
- Search/scoping answer contracts now explicitly keep raw query strings, result-count mechanics, and search-iteration logs in receipts/checkpoints/process details by default; visible answer prose should synthesize findings unless the user explicitly asks for the search strategy.
- Model-visible search tool payloads are now shaped as synthesis context with explicit anti-duplication guidance rather than raw search-log fuel, reducing provider-specific leakage of `Objective` / `Queries Run` style process scaffolding into answer prose.
- The current stabilization program in [plan-agentic.md](./plan-agentic.md) is now about durable convergence of those existing recovery primitives: disconnect classification, durable continuation from completed work, and elimination of stuck/partial recovery states. This plan should stay focused on truthful execution-trace UX and must not imply that ephemeral progress or non-persisted intermediate semantics are replayable.
- The current stabilization program is about durable convergence and continuation, not decorative execution-trace expansion. New trace work should prefer durable truth and explicit degraded-state honesty over denser presentation.
- Full provider-independent execution trace coverage is not done yet for read tools, proposal/mutation tools, full popup parity, task-outline UX, or answer-level provenance follow-through. Core search provenance now exists for PubMed/OpenAlex/Semantic Scholar without changing the clean narrative answer style.

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

### Recovery Truth Contract
- replay restores authoritative persisted truth only
- ephemeral progress is not replayed
- checkpoints shown after recovery must be persisted checkpoints, not reconstructed narration
- paused-for-input is a successful handoff state, not a failure
- if continuation is degraded, the trace must say so explicitly rather than pretending full replay parity

## Core UX Architecture
The chat should expose distinct but coordinated layers.

### Layer A: Conditional task outline
For substantial multi-step work, the UI may show a compact task outline that answers:
- what major stages this task involves
- how many major stages are done
- which major stage is active now

This layer is:
- high-level
- compact
- optional
- separate from tool receipts and reasoning

It should appear only when the work is genuinely complex enough that the user benefits from a map.

Rules:
- do not show it for short or trivial runs
- do not show it for fake boilerplate steps like "understand request" or "summarize result"
- do not let repeated tool refinements masquerade as separate tasks
- default to 3-7 meaningful stages at most

### Layer B: Live phase
One ephemeral current state, for example:
- Searching PubMed
- Analyzing PubMed results
- Refining the query
- Reading the PDF
- Drafting protocol update
- Waiting for your answer

This is process state, not assistant prose.

### Layer C: Tool receipts
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

### Layer D: Checkpoints
After meaningful tool steps, the runtime should emit a short grounded checkpoint:
- what happened
- what was learned
- what happens next

This is the missing “middle lane” between tool receipts and final answer.

### Layer E: Optional reasoning
If provider-native reasoning exists and the user wants it, show it in a collapsible lane.
If not, the user should still have a strong understanding of the process from phases + receipts + checkpoints.

### Layer F: Blocking clarification
Required user input should continue using the existing `ask_user` / `user_input_required` path.
Optional suggestions should remain `<choices>` only.

## Locked Product Decisions
1. **Primary transparency is structured execution trace, not raw chain-of-thought.**
2. **Task outlines are conditional, not default.**
3. **Progress is not assistant transcript content.**
4. **Tool cards must become semantic receipts, not raw tool ids with status only.**
5. **Checkpoints are first-class and should exist even when no provider reasoning is available.**
6. **Reasoning display is optional and secondary.**
7. **Cross-surface truth is mandatory:** the same runtime state should not look fundamentally different on `/ai` and project copilot.

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
- optional task-outline updates for complex work

The client should not be inventing semantic meaning from raw tool ids.

## Visual Strategy
The execution trace should feel calm, compact, and continuously informative.

The goal is not to show more boxes. The goal is to show the right information with the least visual noise.

### Primary UX Principles
1. **One live thing at a time.**
   - At most one primary live-phase component should be visually emphasized.
   - Users should always know the current step without scanning a stack of simultaneous active cards.
   - If a task outline exists, it should remain quiet and secondary to the current live phase.
2. **Progressive disclosure over card sprawl.**
   - The default state should be compact:
     - optional task outline
     - one live phase
     - compact receipts
     - short checkpoints
   - Detailed payloads, raw reasoning, and long result lists should stay behind explicit expansion.
3. **Receipts are durable, progress is ephemeral.**
   - Live phase/progress should shrink, transition, or disappear once the step ends.
   - Durable receipts should keep the audit trail without feeling like a second transcript.
   - On completed answer turns, durable trace items may collapse into a compact summary above the answer instead of remaining fully expanded inline.
4. **Checkpoints should read like calm narration, not logs.**
   - They should explain what changed in one or two short lines.
   - They should not look like debug output or raw JSON.
5. **Assistant messages should remain conversational.**
   - Process UI should not masquerade as assistant prose.
   - The transcript should not be cluttered with stale status messages.

### Recommended Visual Hierarchy

#### 0. Conditional task-outline block
This is a compact, high-level map for complex work only.

Recommended visual form:
- a slim checklist block
- progress count (`2 of 4 steps`)
- one active stage
- quiet completed states

Rules:
- place it above the detailed execution trace, not attached to every tool step
- do not show it for very short or single-step work
- do not use it for repeated search refinements or other repeated calls within one strategy loop
- completed items should feel calm, not celebratory
- this layer is a map, not evidence

Examples:
- `Define cohort framing`
- `Search and refine evidence`
- `Compare candidate cohort boundaries`
- `Propose final cohort options`

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

For repeated search calls, the UI should not show a stack of nearly identical cards with no explanation, and they should not appear as separate top-level tasks.

Recommended pattern:
- group contiguous search receipts into a compact in-chat “search sequence” card
- show each query as a compact row inside the sequence
- show one checkpoint after the sequence explaining the refinement

Default collapsed view:
- `Search PubMed (4 queries)`
- secondary text: `Narrowed from broad disposition terms to retrospective cohort comparisons`

Expanded view:
- each query row
- result counts
- durations

This makes search look strategic instead of repetitive while keeping repeated refinements out of the high-level task outline.

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
- task-outline blocks for short or trivial runs
- repeated search refinements presented as separate top-level tasks
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
Reference: [LangGraph Studio](https://github.com/langchain-ai/langgraph-studio)

Useful ideas:
- explicit step/thread identity
- clear interrupt points
- execution feels inspectable, not magical

What to borrow:
- steps and waits should be first-class and explicit

What not to copy directly:
- graph/node visualization is too developer-oriented for the main LitRev chat surface

### OpenCode
Reference: [OpenCode](https://github.com/sst/opencode)

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
- conditional task outline for complex work
- progress lane
- receipts
- checkpoints
- conservative turn-scoped `Process details` collapse for completed answer turns
- optional reasoning lane

### Project copilot sidebar
- same underlying trace contract as `/ai`
- more compact layout allowed
- conditional task outline allowed only when it stays quiet and compact
- but no transcript-progress masquerade
- no semantic downgrades that make process state look like assistant speech
- compactness should come from denser spacing and lighter chrome, not from dropping meaning
- supports the same conservative completed-turn trace collapse when the bridge preserves a safe pre-answer durable block

### Main project conversation
- same underlying semantic contract as `/ai` and sidebar copilot
- layout can stay more transcript-forward, but it must still render:
  - live progress
  - durable receipts
  - grounded checkpoints
  - explicit blockers and failures
- completed answer turns may collapse a safe pre-answer durable trace block above the answer
- it must not silently drop structured trace items while preserving only assistant prose

### Popup
- popup supports a reduced but truthful subset:
  - live progress
  - grounded checkpoints
  - blocking clarification
  - structured terminal errors
- popup still does not claim full receipt/artifact/timeline parity
- compactness may reduce presentation density, but it must not falsify the underlying runtime state

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

They should not be promoted into separate top-level task-outline items unless the search itself is one major stage within a larger complex task.

## Non-Goals
This plan does not aim to:
- expose raw chain-of-thought by default
- dump raw tool payloads into the UI
- narrate every token-level microstep
- redesign suggestion chips or ask-user UX
- change `<choices>` extraction or event shape

## Execution Sequence

### Phase V2.0 - Contract lock and shipped foundation
1. Freeze the execution-trace truth model:
   - conditional task outline
   - live phase/progress
   - durable receipts
   - grounded checkpoints
   - optional provider reasoning
2. Freeze the product rule that process state must not be rendered as assistant transcript content.
3. Freeze the product rule that repeated search refinements belong inside search-sequence receipts, not the high-level task outline.
4. Treat the shipped PubMed work as the proving-ground baseline:
   - shared PubMed progress semantics
   - factual PubMed receipt summaries
   - selective grounded PubMed checkpoints
   - checkpoint preservation across `/ai`, sidebar copilot, and main project conversation

Exit criteria:
- One canonical transparency model exists.
- The first provider-independent workflow is shipped and documented.

### Phase V2.1 - Cross-surface parity completion
1. Audit all remaining adapter/storage loss between `/ai`, sidebar copilot, main project conversation, and popup.
2. Preserve structured semantics end-to-end for:
   - `progress`
   - `tool_activity`
   - `checkpoint`
   - `stream_error`
   - `artifact`
   - `user_input_required`
3. Finish parity for the main surfaces and document popup limits explicitly if it remains reduced.

Exit criteria:
- The same stream has the same semantic meaning on all supported main surfaces.
- No supported surface silently degrades process state into assistant prose.

### Phase V2.2 - Receipt expansion beyond core search tools
1. Preserve the shipped PubMed/OpenAlex/Semantic Scholar receipt contract and expand the same factual-receipt approach to the next workflow families.
2. Prioritize high-value provider-independent workflows:
   - `read_protocol`
   - `read_ledger`
   - PDF read/extract tools
   - selected proposal/mutation tools that create reviewable artifacts
3. Keep the contract narrow and factual:
   - display label
   - compact input preview
   - compact output summary
   - authoritative duration/status
4. Keep atomic trace facts canonical and leave grouping/compression in the renderer.

Exit criteria:
- Read and proposal runs leave intelligible receipts without opening raw payloads.
- Search workflows remain consistent while additional workflow families stop feeling semantically blank.

### Phase V2.3 - Checkpoint expansion across core workflows
1. Extend selective grounded checkpoints beyond PubMed.
2. Add checkpoint builders only where the runtime truly has enough facts:
   - search refinement
   - read complete
   - blocked prerequisite / missing context
   - proposal created / awaiting review
   - clarification required
3. Keep checkpoint authoring selective and factual, not mandatory per tool completion.

Exit criteria:
- Users can follow what changed and what happens next across the main workflows.
- Checkpoints reduce confusion without becoming log spam.

### Phase V2.3a - Durable trace compaction for completed turns
1. Preserve the shipped renderer-only collapse of contiguous pre-answer durable trace blocks (`tool_activity`, `checkpoint`, `artifact`) above final assistant answers.
2. Keep grouping conservative:
   - ignore `progress`
   - skip ambiguous/blocking/error turns
   - rely on contiguous ordering only, not invented turn lineage
3. Refine summary wording and artifact inclusion rules only when the output remains clearly supporting trace, not the turn's primary visible outcome.

Exit criteria:
- Completed turns stay clean without losing access to durable process details.
- Ambiguous or actionable turns remain fully inline instead of collapsing unsafely.

### Phase V2.4 - Stronger live phase vocabulary
1. Expand the current `progress` vocabulary across the core workflows:
   - searching
   - reviewing results
   - refining query
   - reading source
   - comparing candidates
   - drafting answer
   - drafting proposal
   - waiting for input
2. Re-evaluate whether the existing `progress` event shape is sufficient.
3. Only if proven necessary, design a migration to a first-class `phase` event in a later slice.

Exit criteria:
- One active process state is always legible.
- Generic tool-name progress no longer dominates the user-facing experience.

### Phase V2.5 - Search/source provenance follow-through
1. Preserve the shipped shared search receipt contract as the provenance source of truth.
2. Extend carry-forward provenance beyond the initial search receipt where grounded:
   - selected/cited source identifiers carried into later read/review steps
   - stronger answer/read consistency with prior search receipts
3. Keep answer-level `Based on` formatting deferred until it clearly improves trust without making the answer feel technical.

Exit criteria:
- Users can trace answer claims back to observable retrieval steps without relying on raw transcript narration.
- Provenance remains a runtime contract, not just narrative transcript text.

### Phase V2.6 - Conditional task outlines for complex work
1. Add a compact high-level task-outline layer for genuinely complex multi-step runs only.
2. Source outlines from explicit runtime/task-state facts, not renderer guesses.
3. Keep outlines above the detailed trace and prevent repeated refinement loops from becoming fake top-level steps.

Exit criteria:
- Complex runs get a clear high-level map.
- Short runs stay clean and receipt/checkpoint-driven.

### Phase V2.7 - Honest popup parity and unified interruption states
1. Finish the popup contract honestly:
   - active progress
   - compact receipts where supported
   - explicit blockers
   - structured terminal failures
2. Align interruption semantics across all surfaces:
   - retryable vs non-retryable failure
   - blocked-on-user
   - degraded continuation
   - resumed/retried runs
3. Keep documented surface limits explicit instead of implying full parity.

Exit criteria:
- Popup is supportable and truthful.
- Failure, blocker, and recovery semantics are consistent across surfaces.

### Phase V2.8 - Evals, telemetry, and rollout hardening
1. Build fixture/scenario coverage for:
   - search refinement
   - read-after-search
   - blocked clarification
   - proposal/review flow
   - terminal failure flow
2. Add telemetry for:
   - missing receipt coverage
   - missing checkpoint coverage
   - stale progress incidents
   - cross-surface semantic loss
3. Keep architecture guards and rollout gates current.

Exit criteria:
- Trace regressions are caught by tests and telemetry instead of user reports.
- Rollout decisions can rely on measurable signals.

### Phase V2.9 - Optional provider reasoning
1. Add provider reasoning summaries only after the provider-independent foundation is strong.
2. Keep reasoning collapsible, user-controlled, and clearly secondary.
3. Show reasoning controls only for models/providers that can actually return readable reasoning.

Exit criteria:
- Provider reasoning enriches the experience when available.
- The core UX remains complete when no provider reasoning is present.

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
- `CAG-009` follow-through (runtime provenance carry-forward and answer alignment)
- `FIX-011` (shared failure handling and popup parity)

This plan should also inform future agent-runtime work when execution-trace semantics cross the server/runtime boundary.

## Validation Gates (Per PR)
1. `cd next-app && npx tsc --noEmit`
2. `cd next-app && npx vitest run`
3. `cd next-app && node scripts/check-chat-stream-architecture.mjs --mode=enforce`
4. Manual smoke:
   - search receipt clarity (`/ai` + project copilot)
   - progress lane truthfulness
   - checkpoint readability
   - ask-user vs optional suggestion separation
   - compactness and visual stability during repeated search/refinement loops
   - surface parity for blocking and terminal failure states
