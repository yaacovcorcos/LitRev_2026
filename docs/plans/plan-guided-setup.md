# Guided Setup Plan

## Purpose
Ship a complete, premium guided setup that helps novice users understand the full study workflow while keeping setup fast and low-friction for experienced users.

## Current Architecture
- Guided setup route is `app/project/[id]/onboarding/page.tsx` with 3 lightweight manual steps.
- Protocol persistence is already available via `saveProtocolAction` and `saveProtocol` service.
- Onboarding completion/skip is persisted in `Project.progress.onboarding` via `markProjectOnboardingCompletedAction`.
- Guided setup default preference is persisted at user level in `UserMemory` (`guided_setup_new_projects`).
- There is no strict per-step onboarding status model, no deterministic launch gate checks, and no structured AI assists dedicated to onboarding.
- Guided setup entry is temporarily held behind a shared availability gate: the home project-creation modal disables the guided launcher with hold copy, and direct `/project/[id]/onboarding` visits show a hold state with a workspace fallback until the flow is resumed.

## Final Product Decisions (Locked)
- **No central agent-loop mode for onboarding.** Onboarding AI runs as dedicated typed server actions.
- **Canonical write target remains `ProtocolData`.** No parallel protocol schema.
- **User uncertainty is expected.** UX copy must reinforce that question/PICO are draftable and can be refined later.
- **Clarification is ask_user-style UI, not tool invocation.** Use structured question cards in onboarding UI.
- **Quick Setup behavior:** rapid auto-advance with review (AI-prefilled steps, reversible edits).
- **Personalization profile:** derived-only signals (`strictness`, `timelinePressure`, `recallVsPrecision`, `evidenceDepth`).

## Step Model (Single Complete Flow)
1. **Topic & Draft Question**
   - AI suggests 2-3 question candidates with broad/balanced/narrow variants.
   - Writes selected/edited value to `protocol.researchQuestion`.
2. **PICO Decomposition**
   - Four editable cards (Population, Intervention/Exposure, Comparator, Outcome).
   - Writes to `protocol.pico.*`.
3. **Criteria Builder**
   - AI proposes inclusion/exclusion criteria with rationale and inline accept/edit/remove.
   - Writes to `protocol.eligibility.*`.
4. **Strategy Preview**
   - AI shows 2-3 strategy variants (precision/balanced/recall) with query + databases + tradeoffs.
   - Accepted strategy writes to `protocol.searchStrategy.*`.
5. **Workflow Orientation**
   - Static stage map (`Protocol -> Search -> Screen -> Draft -> QA`) plus AI-personalized next-action line.
6. **Launch Gate + Final Clarifications**
   - Deterministic pass/fail checks and structured clarifier questions for broad unresolved choices.

## Context-Chain Action Contracts (Strict)
- `suggestQuestionsAction(topicText)`
- `decomposePicoAction(researchQuestion, domain)`
- `generateCriteriaAction(researchQuestion, pico)`
- `previewStrategyAction(researchQuestion, pico, criteria)`
- `buildWorkflowOrientationAction(researchQuestion, pico, criteria, strategyPreview)`
- `validateSetupAction(fullProtocolSnapshot)`
- `finalClarificationAction(fullProtocolSnapshot, derivedProfile)`

All action responses must be strict typed JSON and include short provenance text.

## Deterministic Clarification Triggers
- Contradiction across step outputs.
- Two near-equal viable options.
- Input too vague to safely continue.

## Launch Gate (Pass/Fail)
Minimum pass checks:
- Non-empty research question.
- PICO population and outcome present.
- At least 2 inclusion criteria.
- At least 1 exclusion criterion.
- No direct contradiction between selected scope/question/criteria.

## Active Tasks
- [ ] `GSU-001` Replace onboarding UI with a 6-step shell (step rail + central workspace + right explainer panel), mobile-responsive and keyboard navigable.
- [ ] `GSU-002` Implement full AI assist surface on each step (`Suggest`, `Use`, `Edit`, `Explain this`) with visible loading/error/saving states.
- [ ] `GSU-003` Implement onboarding AI server actions matching the strict context-chain signatures and JSON contracts.
- [ ] `GSU-004` Persist per-step onboarding progress and derived profile signals in `Project.progress.onboarding` with statuses `pending|completed|skipped`.
- [ ] `GSU-005` Implement strategy preview accept/edit contract and persist accepted values to `protocol.searchStrategy`.
- [ ] `GSU-006` Implement workflow orientation panel with static lifecycle map + personalized next action.
- [ ] `GSU-007` Implement deterministic launch gate checks and ask_user-style final clarifications UI.
- [ ] `GSU-008` Add deterministic manual fallback for every step when AI is slow/unavailable.
- [ ] `GSU-009` Add telemetry for completion/drop-off/time-per-step/edit-depth/post-setup correction rate.
- [ ] `GSU-010` Test gate: `npx tsc --noEmit`, `npx vitest run`, mobile pass, keyboard/a11y pass, and AI-timeout fallback pass.

## Recently Completed
- [x] Canonical guided setup plan created and linked from `docs/plans/README.md`.

## Deferred / Parking Lot
- [ ] Adaptive step count based on inferred user expertise.
- [ ] Domain template packs for prefilled onboarding.
- [ ] Voice walkthrough mode.
