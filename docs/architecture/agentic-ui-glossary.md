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
The base typed unit of the chat timeline.
In code, `TimelineItem` is the discriminated union that tells the renderer what kind of row should appear.
In the UI, users do not see "a TimelineItem"; they see one specific kind of row such as progress, a tool receipt, a checkpoint, an artifact, or an error.

### `progress`
The transient live-status item for work that is still happening.
In the UI, this appears as the composer-adjacent live status bar rather than as durable transcript content.
It should feel temporary and active.
Once the underlying step ends, it should shrink, transition, or disappear instead of reading like a saved chat message.

### `tool_activity`
The durable record that a tool ran.
In the UI, this appears as a receipt-like row or card for actions such as `ask_user`, `store_memory`, or search tools.
Unlike `progress`, this is meant to stay visible as a factual record of what happened.

### `checkpoint`
A short grounded narration step between tool execution and the final answer.
In the UI, a checkpoint should read like quiet process explanation, not like raw reasoning and not like a loud alert.
Its job is to help the user follow the workflow without exposing hidden chain-of-thought.

### `error`
The structured failure item in the timeline.
In the UI, this is the canonical error surface for a failed run or failed step.
It should appear once, clearly, with the right recovery affordance if one exists.

## Process Transparency

### Execution Trace
The product term for the visible process layer of an assistant turn.
This includes `progress`, `tool_activity`, `checkpoint`, `artifact`, and `error`.
In code, this is assembled from timeline items and renderer grouping rather than stored as one top-level object.

### `Process details`
The UI label for the collapsible summary that groups completed pre-answer durable trace items.
This is a presentation mode, not a separate timeline type.
In the UI, it appears as a compact disclosure block above the final assistant answer.

### `reasoning`
The assistant reasoning field attached to assistant output.
This is separate from checkpoints and separate from tool receipts.
In the UI, it should remain secondary and tightly controlled; the main transparency layer should still come from receipts, checkpoints, and progress.

## Tool Receipts

### Tool Receipt
The preferred product term for a durable completed `tool_activity` block.
In code today, these are still mostly rendered from `tool_activity`.
In the UI, a tool receipt should feel like a factual execution record: what ran, what happened, and any compact metadata that helps the user understand the step.

### PubMed Sequence
The renderer-level grouped display for contiguous `search_pubmed` tool activity rows.
In code, this is a presentation grouping built in `TimelineRenderer`, not a different stored item type.
In the UI, it appears as a compact grouped search sequence rather than a stack of repetitive independent PubMed rows.

## Artifacts

### `artifact`
A durable generated output that the user can inspect or act on.
This is different from assistant prose.
In the UI, artifacts usually appear as larger structured cards.

### `ArtifactWrapper`
The shared wrapper used to render artifact cards and their surrounding controls.
In the UI, this is the common frame that gives artifacts their durable card treatment.

### Artifact Type
The canonical content family of an artifact, such as `study_proposal`, `study_update`, `screening_batch`, `criteria_card`, `protocol_suggestion`, `draft_diff`, `memory_proposal`, or `memory_forget_proposal`.
In practice, the artifact type determines which artifact card is shown and what actions are available.

## Composer

### `CopilotInputCore`
The shared implementation of the chat composer.
This is the code-level owner of the input shell used across the main chat surfaces.
In the UI, the composer is the full bottom input area, not just the textarea.

### Composer
The product term for the full input shell: text input, model selector, voice, send, and secondary actions.
It is the main action entrypoint for the chat surface.

### `CopilotActionsMenuButton`
The `+` button on the far left of the composer.
In the UI, it opens the secondary actions menu for actions such as file import and compression.

### `VoiceLevelVisualizer`
The live recording visualizer shown during voice capture.
In the UI, this is the animated voice strip shown while recording is active.
It should communicate live microphone activity in a calm, restrained way rather than looking like a music equalizer.

## Clarification Flow

### `ask_user`
The structured tool used when the assistant must stop and request user clarification before continuing.
This is not just a normal sentence question in the transcript; it is a formal blocking step in the agentic flow.

### `UserInputRequest`
The typed request payload representing that clarification step.
It is the code-level object that carries the prompt and answer options for a blocked execution state.

### `UserInputCard`
The visible UI card used to present a clarification request and collect the user's answer.
In the UI, this should feel like a deliberate handoff point in the workflow, not like an incidental form element.
