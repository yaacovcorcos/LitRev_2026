# Updated Diagnosis Report (Cross-Checked)

Date: 2026-03-02  
Scope: `next-app/`  
Method: `tsc` diagnostics, import/reference scans, duplication spot-checks, and targeted file verification.

## Section 1: What Was Re-Checked in Code

1. Diagnostics were reproduced exactly:
- `27x TS2304`
- `61x TS6133`
- `12x TS6196`

2. The direct typecheck blocker is confirmed in `app/actions/memory.ts`:
- Import line includes `withValidatedAction` but omits `withAction`.
- `withAction` is used repeatedly later in the file.

3. The previously identified duplication hotspots are confirmed:
- `lib/server/ai/tool-helpers.ts` vs `lib/server/ai/sub-agent.ts` (tool->artifact mapping)
- `lib/server/ledger.ts` vs `lib/ai/mentioned-studies.ts` (DOI/PMID normalization)
- `components/project/ConversationMainView.tsx` vs `components/ProjectCopilot.tsx` (conversation handlers)
- `lib/server/ai/tools/delegate-screening.ts` vs `lib/server/ai/tools/delegate-protocol.ts` (delegate tool structure)

Why this matters:
- This confirms both the immediate compile blocker and medium/high-value dedup opportunities are real.

Safety:
- Verification only, no behavior change.

Influence on codebase:
- Establishes a reliable baseline and priority order for safe cleanup.

---

## Section 2: P0 Recommendation (Do First)

### Recommendation
Restore the type-safety gate by fixing the missing `withAction` import in `app/actions/memory.ts`.

### Why we should do it
- It removes the root cause of the TS2304 failures in the highest-noise action file.
- Without this, global typecheck is already red and masks other regressions.

### Safety
- **Very high** (compile fix only, no intended runtime behavior change).

### Influence on codebase
- Re-enables trustworthy `npx tsc --noEmit` checks.
- Unblocks phased cleanup and safe refactoring.

### Related files to adapt
- `lib/server/action-utils.ts` already exports `withAction`; no functional adaptation required there.

---

## Section 3: P1 Recommendations (Low-Risk Cleanup in Small Atomic Commits)

### 3.1 Clean unused symbols in `app/actions/memory.ts` and schema imports

Why:
- This file is the largest source of TS unused-noise and currently obscures signal.

Safety:
- **High** if each removal is backed by TS diagnostics and re-run checks.

Influence:
- Better maintainability, lower review noise, easier future bug detection.

Related files:
- `lib/schemas/memory.ts` (has unused import surface to align with actions usage).

### 3.2 Remove stale unused destructured values in Copilot UI components

Why:
- Both chat surfaces destructure fields not used in rendering/logic, increasing drift risk and confusion.

Safety:
- **High** (pure dead-code removal).

Influence:
- Cleaner UI orchestration code and fewer false positives in future audits.

Related files:
- `components/project/ConversationMainView.tsx`
- `components/ProjectCopilot.tsx`

### 3.3 Remove straightforward unused imports/locals across production files

Examples already verified:
- `app/actions/extraction.ts`
- `app/actions/onboarding.ts`
- `components/CommandPalette.tsx`
- `contexts/ProjectCopilotContext.tsx`
- `lib/server/drafts.ts`
- `lib/server/files.ts`
- `lib/server/ledger.ts`

Safety:
- **High** with per-commit `tsc`/tests.

Influence:
- Reduces code entropy and cleanup debt with minimal regression risk.

### 3.4 Treat Copilot model-prop mismatch as behavior bug (not cosmetic cleanup)

Why:
- `CopilotInput` passes controlled model props, but `CopilotInputCore` currently ignores `selectedModelProp` / `onModelChange`.
- This can cause model-selection drift between context state and input component state.

Safety:
- **Medium** (state behavior can change).

Influence:
- Improves model-selection consistency and predictability.

Related files:
- `components/copilot/CopilotInput.tsx`
- `components/copilot/CopilotInputCore.tsx`
- `components/copilot/CopilotInputCoreClient.tsx`
- `contexts/ProjectCopilotContext.tsx`

---

## Section 4: Unreferenced Candidates (Not Auto-Safe Deletes)

These should be treated as **candidates**, not guaranteed-safe removals.

### 4.1 Likely legacy/unreferenced candidates
- `data/projects.ts`
- `lib/chatStorage.ts`
- `lib/seedLocalStorage.ts`
- `lib/server/test-db.ts`

Why:
- No in-repo imports found.

Safety:
- **Medium-high**, but still requires confirmation against any manual scripts or external workflows.

Influence:
- Improves hygiene and reduces dormant code surface.

### 4.2 Barrel/entrypoint-style candidates
- `components/artifacts/index.ts`
- `lib/server/search/index.ts`
- `lib/server/chat-runtime/index.ts`
- `lib/schemas/index.ts`

Why:
- Currently unreferenced internally, but these often exist as intended import surfaces.

Safety:
- **Medium** (deleting may break expected public module boundaries or future import patterns).

Influence:
- Potentially low immediate impact, but architectural/API-style implications.

Related adaptation if deleted:
- Update docs/contributor guidance for import conventions.

---

## Section 5: P2 Recommendations (Targeted Dedup, Medium Risk / High Value)

### 5.1 Consolidate tool->artifact mapping to one source

Current duplication:
- `lib/server/ai/tool-helpers.ts`
- `lib/server/ai/sub-agent.ts`

Why:
- Dual definitions can drift and produce inconsistent artifact behavior.

Safety:
- **Medium**.

Influence:
- Strong consistency improvement across parent and sub-agent pathways.

Related files/tests:
- `lib/server/__tests__/delegation-tools.test.ts`
- Any tests around artifact creation/apply flow.

### 5.2 Consolidate DOI/PMID normalization into shared utility

Current duplication:
- `lib/server/ledger.ts`
- `lib/ai/mentioned-studies.ts`

Why:
- A mismatch here causes duplicate detection inconsistencies between parsing and persistence.

Safety:
- **Medium**.

Influence:
- Better dedup correctness and fewer edge-case duplicate records.

Related files/tests:
- `lib/server/__tests__/mentioned-studies.test.ts`
- `lib/server/__tests__/ledger-mentioned-study.test.ts`

### 5.3 Introduce delegate-tool factory for screening/protocol delegates

Current duplication:
- `lib/server/ai/tools/delegate-screening.ts`
- `lib/server/ai/tools/delegate-protocol.ts`

Why:
- Near-clone files are easy to drift when features evolve.

Safety:
- **Medium**.

Influence:
- Reduces maintenance overhead and improves consistency for future delegate tools.

Related files/tests:
- `lib/server/__tests__/delegation-tools.test.ts`

---

## Section 6: P3 Recommendations (Larger Refactors, Higher Regression Risk)

### 6.1 Refactor OpenAI-compatible providers via shared base/helper

Affected files:
- `lib/server/ai/providers/openai.ts`
- `lib/server/ai/providers/google.ts`
- `lib/server/ai/providers/xai.ts`
- (partially related: `lib/server/ai/providers/anthropic.ts`)

Why:
- Large duplicated streaming/tool-call parsing paths are expensive to maintain.

Safety:
- **Medium-low** due streaming behavior sensitivity.

Influence:
- High long-term maintainability and parity improvements.

Related tests:
- `lib/server/__tests__/provider-reasoning-parity.test.ts`
- Additional provider parity tests recommended before/after refactor.

### 6.2 Extract shared conversation handler logic from the two copilot UIs

Affected files:
- `components/project/ConversationMainView.tsx`
- `components/ProjectCopilot.tsx`

Why:
- Duplicated message/retry/branch/plan-resume handlers invite divergence.

Safety:
- **Medium-low** (UI/interaction regressions possible).

Influence:
- Better feature parity between panel and full-page conversation surfaces.

Related tests:
- Existing: `components/__tests__/ProjectCopilot.test.tsx`
- Add dedicated tests for `ConversationMainView` parity.

### 6.3 Consider unifying editable components only after interaction contracts are explicit

Candidate set:
- `components/EditableText.tsx`
- `components/EditableTextArea.tsx`
- `components/EditableChips.tsx`
- `components/EditableList.tsx`

Why:
- There is structural overlap, but user-input behavior differs enough to regress UX/a11y if merged prematurely.

Safety:
- **Medium**.

Influence:
- Can reduce maintenance burden, but only safe with explicit behavior tests.

Related files:
- Primary usage in `app/project/[id]/protocol/ProtocolSections.tsx`.

---

## Section 7: Practical Execution Order

1. **P0**: Fix `withAction` import and restore baseline typecheck.
2. **P1**: Remove low-risk unused symbols in small atomic commits.
3. Run validation after each phase:
- `npx tsc --noEmit`
- `npx vitest run`
4. Handle unreferenced candidates explicitly:
- Remove likely-legacy files first.
- Defer barrel deletes unless intentional API boundary changes are approved.
5. **P2** dedup with targeted test updates.
6. **P3** larger refactors only with parity tests + manual UI verification.

---

## Final Position

The corrected framing is:
- Keep "safe removals" wording only for items proven behavior-neutral.
- Label everything else as "unreferenced candidates" or "refactor candidates" with explicit risk.

This is the cross-checked, safety-prioritized diagnosis to execute from.
