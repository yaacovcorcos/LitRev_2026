# Thinking + Live Process UX V2 Plan

## Purpose
Define a safe, high-ROI rollout for live reasoning visibility and tool-invocation UX so users feel part of the process without degrading speed or quality.

## Product Outcome
- Users can see what the agent is doing in real time.
- Users can follow tool calls as explicit lifecycle steps.
- Users can intervene when needed (starting with retry-only controls).
- UX is consistent across `/ai`, project copilot, and popup through shared core logic.

## Core Principle
Unify chat/runtime logic first, then expand advanced UI lanes.

`Same engine, different shells`:
- Shared engine: stream normalization, reducer/state machine, retry/model continuity.
- Shell-specific UI: `/ai` (advanced), project copilot (embedded), popup (compact).

## Locked Decisions
1. Default reasoning mode: `summary`.
2. Rollout: power users first.
3. Step controls v1: display + retry only.
4. Persist reasoning: summary + provenance; raw reasoning live-only.
5. KPI priority: trust -> completion rate -> speed.

## Execution Sequence

### Phase V2.0 - Blockers (must fix first)
1. Fix model ownership in shared input core (single source of truth).
2. Preserve selected model + reasoning mode in retry flows.
3. Eliminate duplicate ask-user rendering (single decision surface).

Exit criteria:
- No model drift on retry.
- One ask-user UI path only.
- No duplicate question rendering.

### Phase V2.1 - Shared Client Stream Layer
1. Introduce shared stream reducer + adapters used by `/ai` and project copilot.
2. Keep surface-specific adapters thin.
3. Normalize all runtime events into one client event contract.

Exit criteria:
- Same stream event yields same state transition on both major surfaces.

### Phase V2.2 - Typed Tool Activity Model
1. Add first-class `tool_activity` timeline type (`queued|running|done|failed`).
2. Include timestamps, duration, safe summaries, and tool identity.
3. Reuse existing run-event metadata; do not create a second persistence path.

Exit criteria:
- Tool lifecycle is typed data, not inferred from prose.

### Phase V2.3 - Reasoning Lane UX
1. Render live reasoning with states: `idle|streaming|done|truncated`.
2. Respect modes: `off|summary|full`.
3. Add provenance chip (`provider-native` vs `best-effort`).

Exit criteria:
- Reasoning visibility is predictable and mode-consistent.
- Clear fallback message when model emits no reasoning.

### Phase V2.4 - Action Lane UX
1. Render live tool cards with status, duration, and compact I/O summaries.
2. Group repeated tool activity into batches.
3. Keep high-signal surface: what ran, why, result.

Exit criteria:
- User can follow progress without reading raw transcript text.

### Phase V2.5 - Control Lane UX (staged)
1. V2.5a: retry controls only.
2. V2.5b: pause control behind flag.
3. V2.5c: skip/step controls after reliability proof.

Exit criteria:
- User intervention improves trust without introducing unstable run control.

### Phase V2.6 - Performance + Coalescing
1. Split coalescing by lane:
   - Tool/control transitions: fast path.
   - Reasoning/content deltas: coalesced.
2. Add lane-specific SLOs.

Suggested SLOs:
- Time-to-first-visible-work: < 1.5s
- Tool/control status update latency: < 300-500ms
- No visible scroll/input jank under sustained streams

### Phase V2.7 - Rollout
1. Feature flags:
   - `NEXT_PUBLIC_ENABLE_LIVE_REASONING_V2`
   - `NEXT_PUBLIC_ENABLE_TOOL_ACTIVITY_V2`
   - `NEXT_PUBLIC_ENABLE_AGENT_CONTROLS_V2`
2. Internal -> power users -> broad rollout by metrics.

## Risks and Mitigations
1. Risk: UI drift across surfaces.
   - Mitigation: shared reducer/adapters before advanced lane work.
2. Risk: over-verbose or noisy reasoning.
   - Mitigation: `summary` default + truncation + raw/live-only policy.
3. Risk: latency regressions from rich streaming UI.
   - Mitigation: lane-specific coalescing + render throttling + virtualization where needed.

## Plan Alignment
Track implementation under existing UI governance items:
- `CUX-027` (tool receipts / copilot UX)
- `CUX-D01` (chat architecture unification)

