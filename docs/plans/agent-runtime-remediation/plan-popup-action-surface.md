# Plan: Popup Action Surface Repair

> Supporting plan only. Canonical status, priority, and completion rules live in [../plan-agentic.md](../plan-agentic.md).
>
> Supports: `FIX-003`
>
> Retirement rule: when `FIX-003` is complete, either delete/archive this file or reduce it to a short historical note. Do not keep active status tracking here.

## Overall Goal

Make popup behavior honest. The popup assistant must either be fully capable of rendering tool-driven proposal flows or be deliberately limited to read-only and advisory behavior. It cannot continue advertising protocol edits that the user cannot actually review or apply.

## Goal + Scope

### Problem Statement

Popup mode currently allows `update_protocol` through the popup tool contract, tells the model to use it, and then streams through the non-artifact path. The popup UI only renders plain content chunks, so proposal cards and tool-driven review flows are effectively invisible.

### Intended Outcome

- Immediate state: popup no longer exposes invisible mutation flows.
- Durable state: if popup editing remains a product goal, it reuses artifact-aware streaming and shared reducer logic instead of a bespoke partial implementation.

### In Scope

- `next-app/lib/server/ai/popup-tool-contract.ts`
- `next-app/lib/server/ai/popup-context.ts`
- `next-app/app/api/ai/stream/route.ts`
- `next-app/components/PopupChat.tsx`
- popup-related tests

### Out Of Scope

- Broader popup visual redesign
- Full `/ai` and popup runtime unification beyond what is required for artifact correctness

## Governance and Repo Grounding

- AGENTS trigger mapping: agent runtime plus UI surface changes
- Required Tier 2 specialists:
  - `docs/agents/specialists/agent-runtime-specialist.md`
  - `docs/agents/specialists/frontend-ui-specialist.md`
- Required Tier 3 retrieval:
  - `docs/plans/plan-agentic.md`
  - `docs/plans/plan-ux-ui.md`
  - `docs/plans/plan-chat-unification-v2.md`

### Current-State Evidence

- Popup prompt tells the model to call `update_protocol` in `next-app/lib/server/ai/popup-context.ts`.
- Popup tool guard allows `update_protocol` in `next-app/lib/server/ai/popup-tool-contract.ts`.
- Popup route uses `streamChatWithTools()` in `next-app/app/api/ai/stream/route.ts`.
- Popup client renders only `content` chunks in `next-app/components/PopupChat.tsx`.
- There is no popup-specific test coverage for artifact or tool-result handling.

## Documentation Impact and Updates

Documentation updates are required.

- Update `docs/plans/plan-agentic.md`
  - document the popup limitation if Slice 1 ships before Slice 2
- Update `docs/plans/plan-chat-unification-v2.md`
  - record popup artifact parity as an explicit integration requirement if full support is built
- Update `docs/plans/plan-ux-ui.md`
  - capture any user-visible popup behavior change

## Minimal-Sufficient Strategy

Use a two-slice approach:

- Slice 1 is the safety fix: make popup read-only/advisory so the backend and UI are honest.
- Slice 2 is the capability build: only re-enable popup mutation once artifact-aware streaming exists.

This is smaller and safer than trying to complete popup editing and UI parity in one change.

## Reuse vs New

### Reuse

- Existing popup context capture
- Existing artifact-aware stream path in `AIService.streamChatWithArtifacts()`
- Existing shared stream reducer and event handling in the main copilot

### New

- A read-only popup tool policy for the immediate fix
- If full support is needed, a popup event bridge for artifact, tool-result, and `user_input_required` rendering
- Shared popup/main-copilot event reduction instead of a second bespoke chunk parser

## Decision-Complete Implementation Design

### Slice 1 Design: Safe popup policy

Make popup explicitly read-only and advisory:

- Remove `update_protocol` from `POPUP_ALLOWED_TOOLS`
- Keep the popup tool set limited to read-only tools such as `read_protocol`, `read_ledger`, and `inspect_memory`
- Do not enable `ask_user` in popup during Slice 1; popup does not yet render the structured answer flow
- Update popup prompt text so it no longer tells the model to call `update_protocol`
- Replace that instruction with:
  - explain the suggested change concisely
  - tell the user to open the main copilot/protocol surface to apply it

If the product wants one-click continuation:

- add a lightweight CTA or navigation affordance to open the main copilot with the popup context carried over

### Slice 2 Design: Full popup artifact support

If popup editing remains a requirement:

- route popup requests through artifact-aware streaming instead of `streamChatWithTools()`
- reuse the shared stream reducer/event model from the main copilot rather than teaching `PopupChat.tsx` a one-off set of special cases
- teach `PopupChat.tsx` to handle:
  - `artifact`
  - `tool_result`
  - `user_input_required`
  - `navigate`
- render proposal cards or a compact artifact wrapper in popup context
- preserve strict popup field scoping from the existing popup tool guard
- keep `ask_user` disabled until popup can both render and submit the structured response contract

### Recommended Decision

Ship Slice 1 first. Slice 2 should only start if there is still a clear product need for in-popup editing after the safe read-only patch lands.

### Edge Cases and Failure Behavior

- Popup receives stale prompt guidance during rollout
  - server-side allowed-tool removal still blocks mutation
- Popup context section mismatch
  - existing guard continues returning a scoped error
- User asks for an edit after Slice 1
  - popup explains the edit and routes the user to the main surface instead of pretending the edit was proposed

### Practical Impact Translation

- User experience
  - immediate behavior becomes more honest, even if temporarily less convenient
- Runtime/system behavior
  - no more invisible proposal flows
- Operational/support impact
  - fewer confusing “the popup said it edited something but nothing appeared” reports

## Long-Term Quality and Scalability

- Maintainability
  - one shared artifact/event model is better than popup-specific partial behavior
- Reliability
  - fewer silent mismatches between backend actions and UI rendering
- Operability
  - popup errors become straightforward to interpret

### Tradeoffs

- The immediate safe fix removes a capability surface.
- That is preferable to keeping a misleading capability surface.

## Execution Slicing

### Slice 1: Read-only popup hardening

- remove `update_protocol` from popup allowed tools
- update prompt copy
- add tests confirming popup tool policy
- add a regression test that popup edit-intent requests never claim a hidden proposal was created

Blast radius:
- popup-specific behavior only

### Slice 2: Artifact-aware popup runtime

- move popup onto artifact-aware stream path or shared runtime
- add popup rendering for artifact/tool/user-input events
- add focused UI tests

Blast radius:
- popup stream pipeline and UI state handling

### Alternatives Considered

- Chosen
  - immediate read-only hardening, then optional capability rebuild
- Rejected
  - leaving popup mutation enabled while adding only better prompt wording

## Risk + Rollback

### Primary Failure Modes

- Popup becomes too constrained for existing workflows after Slice 1
- Slice 2 introduces a second artifact renderer that diverges from the main copilot

### Detection Signals

- drop in popup completion for edit-intent sessions
- support reports about missing apply path
- popup tests failing on artifact event handling

### Rollback Path

- Slice 1 can be rolled back independently if a replacement apply path is ready immediately
- Slice 2 should be behind a flag so popup artifact support can be disabled without losing the safer Slice 1 policy

## Verification Strategy

### Test Matrix

- Happy path
  - popup answers advisory questions normally
- Edge cases
  - blocked mutation tool returns explicit popup-safe error
  - popup protocol-scope restrictions still hold
- Regression scenarios
  - popup no longer claims to have proposed/applied hidden protocol changes

### Relevant Test Layers

- unit tests for popup tool guard
- component tests for popup stream handling if Slice 2 lands
- route-level tests for popup request path

### Acceptance Signals

- no popup mutation tool is available unless the popup can render the resulting UI contract
- popup copy matches actual capability

## Validation Mapping

- `cd next-app && npx tsc --noEmit`
  - catches popup route, tool-contract, and component typing drift
- `cd next-app && npx vitest run`
  - catches popup guard and renderer regressions

## Debuggability + Triage

### Failure Surface Signals

- popup shows plain text claiming a protocol update happened
- popup tool guard errors for allowed read-only operations
- popup stream receives artifact events with no renderer

### Fast Reproduction Path

1. Open popup from a protocol section.
2. Ask for a concrete protocol change.
3. Confirm whether the popup can truly surface a proposal or correctly routes to the main surface.

### First Triage Steps

- inspect popup allowed-tool list
- inspect popup route streaming path
- inspect popup chunk handler coverage in `PopupChat.tsx`
- inspect whether popup is still using bespoke content-only handling instead of shared event reduction

### First Owner

- shared runtime owner plus frontend owner for popup rendering

## Assumptions / Defaults

- Honest read-only behavior is better than misleading partial edit support.
- If popup editing remains important, it should reuse the shared artifact contract instead of inventing a popup-only one.
