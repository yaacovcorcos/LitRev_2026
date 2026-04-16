# Plan: General-Mode Scoping and Clarification Cleanup

> Supporting plan only. Canonical status, priority, and completion rules live in [../plan-agentic.md](../plan-agentic.md).
>
> Supports: `FIX-004`
>
> Historical note: `FIX-004` is complete. Keep this file only as supporting implementation history until it is deleted or archived. Do not keep active status tracking here.

## Overall Goal

Reduce the default action surface of `general` mode, remove misleading global delegation affordances, and make clarification behavior deterministic: `ask_user` for required decisions, `<choices>` only for lightweight suggestions.

## Goal + Scope

### Problem Statement

`general` mode currently falls back to all tools when delegation is disabled, which creates wrong-tool-selection risk and undermines the architecture target of specialist delegation. Global scope also exposes delegation tools whose documented capability is not available without project context. On top of that, clarification is split between deterministic `ask_user` and prompt-driven `<choices>`, increasing behavior variance.

### Intended Outcome

- `general` mode is explicitly scoped by default.
- Global scope exposes only capabilities that are honest in global context.
- Required clarification uses `ask_user`.
- `<choices>` remains an optional suggestion UI, not a substitute for required decisions.

### In Scope

- `next-app/lib/agent/router.ts`
- `next-app/lib/agent/feature-flags.ts`
- `next-app/lib/server/ai/tools/base.ts`
- `next-app/lib/ai/prompts/assistant-prompts.ts`
- `next-app/lib/server/ai/ai-service.ts`
- tool-filtering and prompt-behavior tests

### Out Of Scope

- Replacing the router with an ML classifier
- Full task graph or phase-state-machine work
- Rewriting the entire suggestion-chip UX

## Governance and Repo Grounding

- AGENTS trigger mapping: agent runtime/orchestration changes
- Required Tier 2 specialist: `docs/agents/specialists/agent-runtime-specialist.md`
- Required Tier 3 retrieval:
  - `docs/plans/plan-agentic.md`

### Current-State Evidence

- `general.allowedTools = []` in `next-app/lib/agent/router.ts`, which means unrestricted fallback.
- Delegation scoping is off by default in `next-app/lib/agent/feature-flags.ts`.
- Global scope allowlist still includes `delegate_protocol` and `delegate_screening` in `next-app/lib/server/ai/tools/base.ts`.
- Base prompt recommends `ask_user`, but `AIService.streamChatWithArtifacts()` still adds `<choices>` instructions to the prompt.

## Documentation Impact and Updates

Documentation updates are required.

- Update `docs/plans/plan-agentic.md`
  - change current architecture to reflect explicit general-mode scoping once shipped
- Update `docs/plans/plan-memory.md` if clarification semantics change memory, extraction, or prompt-library behavior materially

## Minimal-Sufficient Strategy

Keep the routing model and existing specialist taxonomy. The fix is to narrow the default `general` envelope and make the remaining capabilities honest and predictable.

## Reuse vs New

### Reuse

- Existing specialist modes and delegated tools
- Existing `ask_user` tool contract
- Existing `<choices>` parser and chip rendering for optional suggestions

### New

- Scope-aware general-mode allowlist resolution
- Clarification policy split between required and optional interactions

## Decision-Complete Implementation Design

### 1. Make `general` explicitly scoped by default

Replace the empty-array fallback in `AGENT_MODE_CONFIG.general` with explicit allowlist resolution.

Implementation decision:

- keep `AGENT_MODE_CONFIG.general` declarative
- add a scope-aware helper such as `getEffectiveAllowedTools(mode, scope)` or `getContextualAllowedTools({ mode, scope })`
- use that helper everywhere tool filtering currently depends on `getEffectiveAllowedTools(mode)`

Recommended project-context `general` list:

- `delegate_search`
- `delegate_protocol`
- `delegate_screening`
- `read_protocol`
- `read_ledger`
- `read_study_content`
- `update_note`
- `update_study`
- `inspect_memory`
- `store_memory`
- `forget_memory`
- `list_projects`
- `open_project`
- `create_project`
- `ask_user`

Recommended global-context `general` list:

- `search_pubmed`
- `search_semantic_scholar`
- `search_openalex`
- `inspect_memory`
- `store_memory`
- `forget_memory`
- `list_projects`
- `open_project`
- `create_project`
- `ask_user`

This keeps `general` useful without giving it the full raw action surface.

### 2. Remove misleading global delegation affordances

Update the global scope allowlist in `tools/base.ts`:

- remove `delegate_protocol`
- remove `delegate_screening`
- remove `delegate_search`

Decision:

- global `general` should expose direct search tools, not delegated tools
- if the product wants no-project delegation later, it should be added alongside a truly global-capable specialist implementation rather than by exposing misleading tool names now

### 3. Simplify feature-flag semantics

Delegation feature flags should not be the only thing keeping `general` scoped.

Recommended policy:

- explicit scoped `general` is the default architecture
- delegation flag controls whether delegated meta-tools are available, not whether `general` becomes “all tools”
- if a temporary legacy fallback is needed, hide it behind a clearly named emergency flag
- with the delegation flag off, `general` must remain explicitly scoped rather than reopening the all-tools fallback

### 4. Clarification contract cleanup

Define the rule clearly in prompts and runtime docs:

- `ask_user`
  - required for decisions, ambiguity, missing preference, or blocking clarification
- `<choices>`
  - optional only
  - used for lightweight suggested next actions after a normal response
  - must not be used when the assistant cannot proceed without an answer

Prompt updates:

- tighten base prompt wording in `assistant-prompts.ts`
- keep `<choices>` support in `ai-service.ts`, but mark it explicitly optional and non-blocking

### 5. Tests and guards

Add coverage for:

- `general` mode tool set in project and global scope
- the new scope-aware helper itself
- delegation flag on/off without reopening the all-tools fallback
- absence of all `delegate_*` tools from global scope
- prompt wording expectations around `ask_user` vs `<choices>`

### Practical Impact Translation

- User experience
  - fewer irrelevant tool actions from general chat
  - clearer clarification behavior
- Runtime/system behavior
  - lower tool-token overhead
  - fewer impossible global delegation attempts
- Operational/support impact
  - easier to reason about why `general` chose a tool

## Long-Term Quality and Scalability

- Maintainability
  - explicit tool lists are easier to audit than “all tools unless flagged”
- Scalability
  - specialist growth stays bounded because `general` does not inherit every new tool automatically
- Reliability
  - lower wrong-tool-selection rate
- Operability
  - simpler telemetry around tool usage and delegation conversion

### Tradeoffs

- Narrower `general` mode may reduce convenience for some legacy turns.
- The benefit is a safer, more legible action space that aligns with the intended architecture.

## Execution Slicing

### Slice 1: Scope correction

- make `general` explicit by default
- remove global protocol/screening delegation
- update tool-filtering tests

Blast radius:
- router, tool registry, delegation availability

### Slice 2: Clarification cleanup

- update prompt rules for `ask_user` vs `<choices>`
- add tests for optional-suggestion semantics

Blast radius:
- prompt behavior and choice-chip expectations

### Alternatives Considered

- Chosen
  - explicit scoped `general` plus prompt cleanup
- Rejected
  - preserving all-tools fallback until a future bigger refactor

## Risk + Rollback

### Primary Failure Modes

- regressions in general-chat capability if the new allowlist is too narrow
- prompt cleanup reduces optional suggestion chip frequency more than desired

### Detection Signals

- spike in “tool unavailable in general mode” errors
- drop in successful general-chat task completion
- support feedback that useful general workflows disappeared

### Rollback Path

- temporarily widen the explicit `general` allowlist if needed
- do not restore the empty-array all-tools fallback unless there is an emergency and a clear incident reason

## Verification Strategy

### Test Matrix

- Happy path
- general mode can still search, inspect memory, and open projects
- Edge cases
  - global general mode cannot invoke protocol/screening delegation
  - project general mode still delegates correctly when delegation is enabled
  - project general mode remains scoped when delegation is disabled
- Regression scenarios
  - `<choices>` still render for optional suggestions
  - `ask_user` remains the blocking clarification path

### Relevant Test Layers

- unit tests for tool filtering
- prompt-behavior tests where feasible
- delegation smoke tests

### Acceptance Signals

- `general` no longer maps to the full tool registry by default
- no misleading global delegation tool exposure remains
- clarification policy is explicit and test-backed

## Validation Mapping

- `cd next-app && npx tsc --noEmit`
  - catches type drift in router and prompt/runtime contracts
- `cd next-app && npx vitest run`
  - catches tool-filtering and delegation regressions

## Debuggability + Triage

### Failure Surface Signals

- `general` mode emits tool-unavailable errors for common tasks
- logs show blocked global delegation attempts
- UI shows missing suggestion chips where optional choices used to appear

### Fast Reproduction Path

1. Run a no-project general chat asking for protocol changes.
2. Run a project-scoped general chat asking for protocol or screening work.
3. Run an ambiguous request that should block on `ask_user`.
4. Run a normal answer that should still offer optional next-step chips.

### First Triage Steps

- inspect effective general allowlist
- inspect scope-aware allowlist resolution call sites
- inspect global-scope allowlist
- inspect prompt fragments appended for `<choices>`

### First Owner

- agent runtime owner for tool filtering and prompt policy

## Assumptions / Defaults

- `general` should remain a coordination surface, not a raw superuser mode.
- Required clarification should use `ask_user`; optional nudges can continue using `<choices>`.
