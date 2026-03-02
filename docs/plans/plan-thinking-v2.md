# Thinking + Live Process UX V2 Plan

## Purpose
Define a safe, high-ROI rollout for live reasoning visibility and tool-invocation UX so users feel part of the process without degrading speed or quality.

## Phase 1 Preconditions (Technical)
1. Shared runtime/reducer path is present on `main`:
   - `next-app/lib/ai/shared-stream-reducer.ts`
   - `next-app/lib/ai/ai-stream-runtime.ts`
   - `next-app/lib/ai/__tests__/stream-adapter-parity.test.ts`
2. Ask-user context continuity + retry/model continuity fixes are already shipped.
3. Architecture guard script exists and can run in `enforce` mode.

## Gap Audit (2026-03-02)
This plan now follows a strict delta-only policy: do not re-implement shipped behavior.

| Area | Already shipped | Missing (Phase 1 target) | Action |
|---|---|---|---|
| Shared stream core | `/ai` + project copilot use shared reducer/runtime; parity fixtures exist | None | No core rewrite |
| Reasoning lane | Reasoning renders in `off/summary/full`; streaming works | Summary-mode live visibility is weaker than full mode; `/ai` does not pass model reasoning support tier to dropdown | Improve UI only (no runtime semantic changes) |
| Tool lifecycle cards | Typed `tool_activity` cards (`running/done/failed`) with shared reducer intents | Cards lack timing/duration and stronger visual status hierarchy | UI polish only; keep reducer contracts unchanged |
| Parity harness | Cross-adapter replay tests exist | Add only missing edge assertions discovered during work | Extend existing fixtures/tests only |
| Guardrails | Architecture script exists; CI currently runs warn mode | Warn mode is non-blocking confidence only | Move CI default to enforce for this phase |

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

### Phase V2.0 - Gap Audit + Scope Lock
1. Produce a done-vs-missing checklist against live code.
2. Lock implementation scope to missing deltas only.

Exit criteria:
- No duplicate implementation work planned.
- Runtime changes are justified by explicit missing behavior.

### Phase V2.1 - Net-New Reasoning UX Deltas
1. Improve live reasoning visibility for summary mode while preserving `off/summary/full` contracts.
2. Wire `/ai` reasoning support tier into dropdown behavior (parity with project copilot controls).
3. Keep reasoning storage/runtime semantics unchanged.

Exit criteria:
- Better live visibility without runtime contract drift.
- `/ai` reasoning controls reflect model support tier.

### Phase V2.2 - Net-New Tool Activity UX Deltas
1. Improve tool cards with timing metadata (start/completion + duration) and clearer status hierarchy.
2. Keep status contract scoped to currently emitted states (`running|done|failed`) for Phase 1.
3. Do not add new persistence paths.

Exit criteria:
- Tool cards communicate progress and completion quality at a glance.
- No reducer semantic duplication in UI bridge layers.

### Phase V2.3 - Parity Hardening (Missing Edges Only)
1. Extend existing replay fixtures/tests only where edge coverage is missing.
2. Keep strict parity target at reducer-state + intents.

Exit criteria:
- New edges covered without rewriting the existing harness.

### Phase V2.4 - Guardrail Enforcement
1. Promote chat stream architecture guard from warn to enforce in CI defaults.
2. Keep allowlists narrow and explicit.

Exit criteria:
- Divergent stream logic additions fail CI by default.

### Phase V2.5 - Rollout
1. Power users first.
2. Broaden after KPI verification.

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

## Validation Gates (Per PR)
1. `cd next-app && npx tsc --noEmit`
2. `cd next-app && npx vitest run`
3. `cd next-app && node scripts/check-chat-stream-architecture.mjs --mode=enforce`
4. Manual smoke:
   - reasoning visibility (`off/summary/full`) in `/ai` + project copilot
   - tool lifecycle card transitions
   - retry/model continuity
   - ask-user context continuity
