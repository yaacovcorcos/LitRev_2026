# Agentic UI Glossary

This glossary is the shared vocabulary for LitRev's agentic chat surfaces.
It is meant to bridge product language and code language so UI discussions, plans, and implementation work refer to the same things.

Primary code references:
- `next-app/types/timeline.ts`
- `next-app/components/copilot/TimelineRenderer.tsx`
- `next-app/components/copilot/CopilotInputCore.tsx`
- `next-app/lib/ai/shared-stream-reducer.ts`

## Timeline Items

### `TimelineItem`
Type union.
This is the base unit of the chat timeline in code.
In the UI, users do not see "a TimelineItem"; they see one concrete row such as progress, a tool receipt, a checkpoint, an artifact, or an error.

### `progress`
Timeline item type.
This is the transient live-status item for work that is still happening.
In the UI, this appears as the composer-adjacent live status bar rather than as durable transcript content.
It should feel temporary and active.
Once the step ends, it should shrink, transition, or disappear instead of reading like a saved chat message.

### `tool_activity`
Timeline item type.
This is the durable record of a tool execution step.
In the UI, this appears as a receipt-like row or card for actions such as `ask_user`, `store_memory`, or search tools.
Unlike `progress`, it stays visible as part of the turn record.

### `checkpoint`
Timeline item type.
This is a short grounded narration step between tool execution and the final answer.
In the UI, a checkpoint should read like a quiet process explanation, not like raw reasoning and not like a loud alert.
Its job is to help the user follow the workflow without exposing hidden chain-of-thought.

### `error`
Timeline item type.
This is the structured failure item in the timeline.
In the UI, this is the canonical error surface for a failed run or failed step.
It should appear once, clearly, with the right recovery affordance if one exists.

## Process Transparency

### Execution Trace
Product term, not a stored type.
This is the full visible process layer of an assistant turn.
It includes `progress`, `tool_activity`, `checkpoint`, `artifact`, and `error`.
In code, it is assembled from timeline items and renderer grouping rather than stored as one top-level object.

### `Process details`
UI label, not a timeline type.
This is the collapsible summary shown when completed pre-answer durable trace items are grouped together.
In the UI, it appears as a compact disclosure block above the final assistant answer.

### `reasoning`
Assistant message field.
This is the reasoning field attached to assistant output.
This is separate from checkpoints and separate from tool receipts.
In the UI, it should remain secondary and tightly controlled. The main transparency layer should still come from receipts, checkpoints, and progress.

## Tool Receipts

### Tool Receipt
Product term.
This is the preferred name for a durable completed `tool_activity` block.
In code today, these are still mostly rendered from `tool_activity`.
In the UI, a tool receipt should feel like a factual execution record: what ran, what happened, and any compact metadata that helps the user understand the step.

### PubMed Sequence
Renderer grouping, not a stored item type.
This is the grouped display for contiguous `search_pubmed` tool activity rows.
In code, this is a presentation grouping built in `TimelineRenderer`, not a different stored item type.
In the UI, it appears as a compact grouped search sequence rather than a stack of repetitive independent PubMed rows.

## Artifacts

### `artifact`
Timeline item type.
This is a durable generated output that the user can inspect or act on.
It is different from assistant prose.
In the UI, artifacts usually appear as larger structured cards.

### `ArtifactWrapper`
Component name.
This is the shared wrapper used to render artifact cards and their surrounding controls.
In the UI, this is the common frame that gives artifacts their durable card treatment.

### Artifact Type
Type/category term.
This is the canonical content family of an artifact, such as `study_proposal`, `study_update`, `screening_batch`, `criteria_card`, `protocol_suggestion`, `draft_diff`, `memory_proposal`, or `memory_forget_proposal`.
In practice, the artifact type determines which artifact card is shown and what actions are available.

## Composer

### `CopilotInputCore`
Component name.
This is the shared implementation owner of the composer across the main chat surfaces.
In the UI, the composer means the full bottom input area, not just the textarea.

### Composer
Product term.
This is the full input shell: text field, model selector, voice controls, send button, and secondary actions.
It should not be used to mean only the textarea.

### `CopilotActionsMenuButton`
Component name.
This is the `+` button on the far left of the composer.
In the UI, it opens the secondary actions menu for actions such as file import and compression.

### `VoiceLevelVisualizer`
Component name.
This is the live recording visualizer shown during voice capture.
In the UI, this is the animated voice strip shown while recording is active.
It should communicate live microphone activity in a calm, restrained way rather than looking like a music equalizer.

## Runtime to UI Translation

### `SharedStreamState`
Runtime state object.
This is the aggregated streaming state used to track assistant content, progress, tool activity, reasoning state, and related execution data before final presentation.

### `SharedStreamIntent`
Reducer intent type.
This is the intermediate event layer that turns raw stream chunks into UI-meaningful updates such as assistant upserts, progress updates, tool activity updates, checkpoints, and errors.

### `PresentedTimelineItem`
Renderer presentation type.
This is a renderer-level display wrapper used when raw `TimelineItem`s are transformed into presentation-specific units, such as grouped PubMed sequences.

## Clarification Flow

### `ask_user`
Tool name.
This is the structured tool used when the assistant must stop and request user clarification before continuing.
This is not just a normal sentence question in the transcript; it is a formal blocking step in the agentic flow.

### `UserInputRequest`
Request type.
This is the typed request payload representing that clarification step.
It is the object that carries the prompt, answer options, and request metadata for a blocked execution state. On the main surfaces, the canonical blocked-request identity is `sourceRunId + callId`; loop-control metadata such as `decisionBoundaryKey` is related but is not identity.

### `UserInputResolution`
Resolution type.
This is the typed resolution payload for a blocked clarification request.
It records whether the user answered, accepted the recommended default, or cancelled the blocked request, and it is what the shared runtime uses to continue the exact paused run truthfully.

### `UserInputCard`
Component name.
This is the visible UI card used to present a clarification request and collect the user's answer.
In the UI, this should feel like a deliberate handoff point in the workflow, not like an incidental form element. Answer, recommended-default, and cancel/rewrite are explicit resolution paths, and cancelled clarifications should remain visible as cancelled rather than disappearing from history.
