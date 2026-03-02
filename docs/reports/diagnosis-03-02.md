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

## Section 7: Integrated UX Quality Fixes (Cross-Checked)

Source files reviewed:
- `docs/reports/chatbot-ux-audit-claude.md`
- `docs/reports/codex-feedback-claude.md`

### 7.1 Add client-side stream chunk batching (`requestAnimationFrame` gate)

Why:
- Server-side coalescing exists, but client handlers still run per chunk and repeatedly update timeline state.
- This is a likely contributor to streaming jank in both copilot and `/ai`.

Safety:
- **Medium** (changes update cadence, not message semantics).

Influence:
- High perceived smoothness improvement during fast streaming.

Related files:
- `next-app/hooks/useCopilotStreamActions.ts`
- `next-app/app/ai/page.tsx`
- `next-app/components/PopupChat.tsx`
- `next-app/lib/ai/stream-processor.ts`

### 7.2 Split `ProjectCopilotContext` or adopt selector-based consumption

Why:
- A single broad context value is still used; streaming updates can trigger avoidable re-renders in unrelated consumers.

Safety:
- **Medium-low** (state plumbing changes across multiple consumers).

Influence:
- Major reduction in unnecessary render work and better interaction responsiveness.

Related files:
- `next-app/contexts/ProjectCopilotContext.tsx`
- `next-app/components/ProjectCopilot.tsx`
- `next-app/components/project/ConversationMainView.tsx`
- `next-app/components/copilot/CopilotInput.tsx`
- `next-app/components/copilot/TimelineRenderer.tsx`

### 7.3 Reset staged attachments when switching conversations

Why:
- `selectConversation` resets run/loading/choices but not attachment staging state.
- This can leak a staged PDF into a different conversation context.

Safety:
- **High**.

Influence:
- Prevents wrong-context sends and confusing attachment behavior.

Related files:
- `next-app/hooks/useCopilotConversations.ts`
- `next-app/contexts/ProjectCopilotContext.tsx`

### 7.4 Replace `Date.now()` IDs with a collision-safe helper

Why:
- Multiple chat/timeline paths still generate IDs with millisecond time values, creating low-frequency collision risk.

Safety:
- **High** if helper behavior is deterministic for tests.

Influence:
- Removes a class of hard-to-reproduce key/correlation bugs.

Related files:
- `next-app/hooks/useCopilotStreamActions.ts`
- `next-app/app/ai/page.tsx`
- `next-app/components/PopupChat.tsx`
- `next-app/app/project/[id]/draft/page.tsx` (local IDs in draft flow)

### 7.5 Surface user-facing failures through existing notifications

Why:
- Many user-visible operations still fail silently or log only to console.
- The app already has notification infrastructure but chat flows are not consistently wired to it.

Safety:
- **High**.

Influence:
- Better user trust and easier recovery from transient failures.

Related files:
- `next-app/contexts/NotificationContext.tsx`
- `next-app/components/ui/Toast.tsx`
- `next-app/hooks/useCopilotConversations.ts`
- `next-app/hooks/useCopilotStreamActions.ts`
- `next-app/components/PopupChat.tsx`
- `next-app/app/ai/page.tsx`
- `next-app/components/copilot/TimelineRenderer.tsx`

### 7.6 Add progressive rendering for long conversation timelines

Why:
- Timeline currently maps and renders the full item list.
- As message/artifact counts grow, render cost and markdown work scale directly.

Safety:
- **Medium** (scroll/anchor behavior is sensitive).

Influence:
- More stable performance for long-running chats.

Related files:
- `next-app/components/copilot/TimelineRenderer.tsx`
- `next-app/hooks/useStableChatScroll.ts`
- `next-app/hooks/useCopilotConversations.ts`

### 7.7 Keep copilot reachable on mobile/tablet project views

Why:
- Current CSS hides the copilot panel below 900px with no equivalent in-page surface.

Safety:
- **Medium** (responsive layout behavior changes).

Influence:
- Restores AI feature access on smaller devices.

Related files:
- `next-app/components/ProjectCopilot.module.css`
- `next-app/components/ProjectCopilot.tsx`
- `next-app/components/project/ConversationMainView.tsx`

### 7.8 Reduce dual artifact state drift risk

Why:
- Artifact information is maintained in both message timeline entries and an artifacts map.
- Multi-path dual updates increase consistency risk.

Safety:
- **Medium-low** (core timeline data model touchpoint).

Influence:
- Better correctness and simpler artifact mutation logic.

Related files:
- `next-app/hooks/useCopilotConversations.ts`
- `next-app/hooks/useCopilotStreamActions.ts`
- `next-app/components/copilot/TimelineRenderer.tsx`
- `next-app/contexts/project-copilot-stream-events.ts`

### 7.9 Increase approve-all summary visibility timeout

Why:
- Current dismiss timer is 1.5s and easy to miss.

Safety:
- **High**.

Influence:
- Better accessibility/readability with minimal code change.

Related files:
- `next-app/components/copilot/TimelineRenderer.tsx`

### 7.10 PopupChat parity follow-up (still open items only)

Why:
- Popup has improved, but still differs from main copilot in ways that can produce drift.

Safety:
- **Medium**.

Influence:
- Better consistency across chat surfaces.

Related files:
- `next-app/components/PopupChat.tsx`
- `next-app/hooks/useCopilotStreamActions.ts`
- `next-app/app/actions/conversations.ts`

Open parity targets:
- Add stale-stream generation guard to popup stream loop.
- Evaluate typing-during-stream behavior parity with main copilot.
- Decide whether popup conversation persistence should remain local-only or optionally server-backed.

### 7.11 Audit claims marked fixed/stale (do not re-open as tasks)

Already fixed in current code:
- `window.prompt` conversation rename path is replaced by dialog flow in `components/ui/ConversationPicker.tsx`.
- Dead draft-page local copilot state has been removed from `app/project/[id]/draft/page.tsx`.
- Chat action visibility includes `:focus-within` in `components/copilot/TimelineMessages.module.css`.
- Popup has an explicit stop button in `components/PopupChat.tsx`.

Stale framing to avoid carrying forward:
- "40+ context values / ~1600 lines" no longer matches current `ProjectCopilotContext` size.

---

## Section 8: Practical Execution Order

0. **Mandatory loop for every fix** (see Section 9).
1. **P0**: Fix `withAction` import and restore baseline typecheck.
2. **P1**: Remove low-risk unused symbols in small atomic commits.
3. **P1 UX quick wins**:
- Reset attachment on conversation switch.
- Replace `Date.now()` IDs with safe helper.
- Increase approve-all timeout.
- Wire user-visible failures to notifications.
4. Run validation after each phase:
- `npx tsc --noEmit`
- `npx vitest run`
5. Handle unreferenced candidates explicitly:
- Remove likely-legacy files first.
- Defer barrel deletes unless intentional API boundary changes are approved.
6. **P2** consistency/perf improvements:
- Client-side stream batching.
- Progressive rendering strategy.
- Context split/selector strategy.
- Artifact state single-source cleanup.
7. **P3** larger refactors only with parity tests + manual UI verification:
- Provider dedup.
- Conversation-surface runtime unification.
- Delegate tool factories.

---

## Section 9: Per-Fix Execution Protocol (Mandatory)

For every fix in this tracker, execute in this order:

### 9.1 Pre-fix review (required before editing)

1. Re-scan all directly related files and call sites.
2. Re-check current behavior in live code (do not rely only on prior audit notes).
3. Confirm related tests and invariants that can be affected.
4. Choose the smallest change that resolves the issue without widening scope.

### 9.2 Implementation rule

1. Apply one focused fix at a time (small atomic commit scope).
2. Avoid opportunistic refactors unless they are required for correctness.
3. If new related risk is discovered, add it to this file before continuing.

### 9.3 Validation rule

1. Run `npx tsc --noEmit` after each fix (or tightly grouped atomic set).
2. Run `npx vitest run` for the same scope.
3. For UI-impacting fixes, perform manual desktop/mobile behavior checks.

### 9.4 Tracker update rule (required after each fix)

After each fix is merged locally, update this file immediately with:
- `Status`: `open` -> `in_progress` -> `done` (or `blocked`)
- `Date updated`
- `Files changed`
- `Validation run` (`tsc`, tests, manual checks)
- `Notes` (tradeoffs, follow-up, or residual risk)

Use this per-fix log format:

`[Fix-ID] | status | date | files | validation | notes`

### 9.5 Per-Fix Log

`[P0-WITHACTION-IMPORT] | done | 2026-03-02 | next-app/app/actions/memory.ts, docs/reports/diagnosis-03-02.md | tsc: pass; vitest: 2 failing tests in lib/server/__tests__/ai-service-reasoning-policy.test.ts (DB env issue, unrelated to import fix) | Added missing withAction import only; no runtime logic change.`

`[P1-CLEANUP-WAVE1] | done | 2026-03-02 | next-app/app/actions/extraction.ts, next-app/app/actions/onboarding.ts, next-app/components/CommandPalette.tsx, next-app/contexts/ProjectMemoryContext.tsx, next-app/lib/schemas/memory.ts, next-app/lib/seedLocalStorage.ts, next-app/lib/server/activity.ts, next-app/lib/server/ai/tools/bulk-screening.ts, next-app/lib/server/ai/tools/update-criteria.ts, next-app/lib/server/ai/tools/update-protocol.ts, next-app/lib/server/drafts.ts, next-app/lib/server/files.ts, next-app/lib/server/ledger.ts, next-app/lib/server/onboarding.ts, next-app/lib/server/projectCopilot.ts, next-app/lib/server/projects.ts, next-app/lib/server/protocols.ts, docs/reports/diagnosis-03-02.md | strict-unused counts: TS6133 61->48, TS6196 12->6; tsc: pass; vitest: unchanged 2 failing tests in lib/server/__tests__/ai-service-reasoning-policy.test.ts due missing local DB | Low-risk import/unused cleanup only; high-churn copilot runtime files intentionally deferred.`

`[P1-CLEANUP-WAVE2A] | done | 2026-03-02 | next-app/app/project/[id]/draft/draft-helpers.ts, next-app/app/project/[id]/draft/useDraftCopilot.ts, next-app/app/project/[id]/draft/useDraftSections.ts, next-app/components/EditableChips.tsx, next-app/components/EditableList.tsx, next-app/lib/agent/__tests__/compaction.test.ts, next-app/lib/agent/__tests__/router.test.ts, next-app/lib/server/__tests__/memory-maintenance.test.ts, next-app/lib/server/__tests__/normalize.test.ts, next-app/lib/server/__tests__/pdf-extraction.test.ts, next-app/lib/server/__tests__/planner-validation.test.ts, next-app/lib/server/__tests__/protocol-sync.test.ts, next-app/lib/server/__tests__/tracing.test.ts, docs/reports/diagnosis-03-02.md | strict-unused counts: TS6133 48->29, TS6196 6->6; tsc: pass; vitest: unchanged 2 failing tests in lib/server/__tests__/ai-service-reasoning-policy.test.ts due missing local DB | Allowlist-only cleanup; removed unused imports/locals without runtime behavior changes; deferred high-churn/runtime-sensitive files.`

`[P1-CLEANUP-WAVE2B] | done | 2026-03-02 | next-app/app/project/[id]/draft/page.tsx, next-app/app/project/[id]/onboarding/page.tsx, next-app/lib/server/ledger.ts, docs/reports/diagnosis-03-02.md | strict-unused counts: TS6133 29->27, TS6196 7->6; tsc: pass; vitest: pass (148 files, 1154 tests; 11 skipped) | Allowlist-only leaf cleanup; removed unused imports/types and deferred high-churn /ai + copilot-context files to a follow-up micro-wave.`

`[P1-CLEANUP-WAVE2C] | done | 2026-03-02 | next-app/app/actions/memory.ts, docs/reports/diagnosis-03-02.md | strict-unused counts: TS6133 28->14, TS6196 6->6; tsc: pass; vitest: pass (150 files, 1160 tests; 11 skipped) | Removed only dead schema/id imports from memory actions; no action signatures or runtime behavior changed.`

`[R0-TRACK1-BASELINE] | done | 2026-03-02 | docs/reports/diagnosis-03-02.md | strict-unused counts: TS6133=14, TS6196=6; tsc: pass; vitest: pass (153 files, 1169 tests; 11 skipped) | Baseline captured after syncing cleanup worktree main to origin/main and regenerating Prisma client locally.`

`[R1A-LOW-RISK-STRICT-UNUSED] | done | 2026-03-02 | next-app/components/copilot/TimelineRenderer.tsx, next-app/components/project/ConversationMainView.tsx, next-app/components/ProjectCopilot.tsx, next-app/hooks/useCopilotStreamActions.ts, docs/reports/diagnosis-03-02.md | strict-unused counts: TS6133 14->8, TS6196 6->3; tsc: pass; vitest: pass (153 files, 1169 tests; 11 skipped) | Removed only unused type imports/destructured values in low-risk UI/hook files; no behavior or signature changes.`

`[R1B-HIGH-RISK-STRICT-UNUSED] | done | 2026-03-02 | next-app/lib/server/agent/artifacts.ts, next-app/lib/server/ai/ai-service.ts, docs/reports/diagnosis-03-02.md | strict-unused counts: TS6133 8->1, TS6196 3->0; tsc: pass; vitest: pass (153 files, 1169 tests; 11 skipped) | Removed only unused imports/types/local destructured value in high-churn server modules; no runtime logic changes.`

`[R1C-AI-PAGE-STRICT-UNUSED] | done | 2026-03-02 | next-app/app/ai/page.tsx, docs/reports/diagnosis-03-02.md | strict-unused counts: TS6133 1->0, TS6196 0->0; tsc: pass; vitest: pass (153 files, 1169 tests; 11 skipped) | Removed only unused state variable in ai page while keeping setter and behavior unchanged.`

`[R2A-DEADFILE-TEST-DB] | done | 2026-03-02 | next-app/lib/server/test-db.ts, docs/reports/diagnosis-03-02.md | strict-unused counts: TS6133 0->0, TS6196 0->0; tsc: pass; vitest: pass (153 files, 1169 tests; 11 skipped) | Deleted unreferenced legacy DB smoke helper (`testConnection`) after global reference scan showed no imports/usages.`

---

## Section 10: Final Position

The corrected framing is:
- Keep "safe removals" wording only for items proven behavior-neutral.
- Label everything else as "unreferenced candidates" or "refactor candidates" with explicit risk.
- For imported external audits, keep only cross-checked open items and explicitly mark fixed/stale claims to prevent backlog noise.

This is the cross-checked, safety-prioritized diagnosis to execute from.

---

## Section 11: `codebase-audit-final.md` Relevance (Deep Cross-Check, 2026-03-02)

Source reviewed:
- `docs/reports/codebase-audit-final.md`

Cross-check method:
- Re-validated each major claim against current code in `next-app/`.
- Marked each item as `open`, `partial`, or `outdated`.
- Kept only still-relevant items as active cleanup targets.

### 11.1 Keep as Active Cleanup Targets (`open`)

`[CAF-C1]` Replace in-memory extraction locks with DB-backed locking  
Why keep:
- `app/actions/extraction.ts` still uses `EXTRACTION_LOCKS = new Set<string>()`, which is not cross-instance safe in serverless.
Safety:
- **Medium** (requires schema + action updates).
Influence:
- Prevents duplicate extraction/deep-analysis work and AI cost spikes under concurrent requests.
Related files to adapt:
- `next-app/app/actions/extraction.ts`
- `next-app/prisma/schema.prisma`
- Any UI status indicators that should surface extraction progress.

`[CAF-C2]` Remove check-then-create race in `upsertStudy`  
Why keep:
- `lib/server/ledger.ts` still does `findFirst` then `update/create` in separate operations.
Safety:
- **Medium-high** (localized data-layer change).
Influence:
- Prevents duplicate/failed writes under concurrent study imports or mentions.
Related files to adapt:
- `next-app/lib/server/ledger.ts`
- `next-app/prisma/schema.prisma` only if a new compound unique/index strategy is chosen.

`[CAF-C3]` Add explicit empty-list guard in `replaceStudies`  
Why keep:
- Empty incoming IDs still trigger soft-delete of all studies in a project.
Safety:
- **High** (small guard + caller intent flag).
Influence:
- Reduces blast radius from caller bugs; turns silent data purge into explicit behavior.
Related files to adapt:
- `next-app/lib/server/ledger.ts`
- Callers in `next-app/app/actions/ledger.ts` and any sync/import code paths.

`[CAF-C4]` Persist idempotency cache beyond process memory  
Why keep:
- Tool idempotency middleware still uses in-memory `Map` only.
Safety:
- **Medium** (new DB table + middleware reads/writes).
Influence:
- Makes duplicate tool-call protection reliable across cold starts and retries.
Related files to adapt:
- `next-app/lib/server/ai/tool-middleware.ts`
- `next-app/prisma/schema.prisma`

`[CAF-C6]` Reduce server action body limit (`100mb`)  
Why keep:
- `next.config.ts` still sets `serverActions.bodySizeLimit` to `100mb`.
Safety:
- **High** (config-only with targeted upload exceptions).
Influence:
- Lowers DoS surface and memory pressure risk.
Related files to adapt:
- `next-app/next.config.ts`
- File-upload routes/actions if larger payloads are truly required.

`[CAF-C7]` Add root error boundaries  
Why keep:
- `app/error.tsx` and `app/global-error.tsx` are still missing.
Safety:
- **High** (isolated UI resilience layer).
Influence:
- Prevents full-app crashes on uncaught root errors; improves recoverability.
Related files to adapt:
- `next-app/app/error.tsx`
- `next-app/app/global-error.tsx`
- `next-app/components/ErrorFallback.tsx` reuse.

`[CAF-H1]` Make run-event sequence assignment atomic  
Why keep:
- `lib/server/agent/events.ts` still does read-max + retry loop.
Safety:
- **Medium** (data consistency path).
Influence:
- Prevents dropped events under burst concurrency.
Related files to adapt:
- `next-app/lib/server/agent/events.ts`
- Potential tests around sequence conflicts.

`[CAF-H2]` Add optimistic locking to artifact review  
Why keep:
- Artifact `version` exists in schema but review flow updates without version check.
Safety:
- **Medium**.
Influence:
- Prevents silent last-write-wins in concurrent review/edit flows.
Related files to adapt:
- `next-app/lib/server/agent/artifacts.ts`
- Artifact review action error handling.

`[CAF-H3]` Make snapshot requirement explicit before apply/undo semantics  
Why keep:
- Snapshot capture failure is still warn-and-continue; undo reliability depends on snapshot.
Safety:
- **Medium**.
Influence:
- Prevents false "applied + undoable" state when no reliable snapshot exists.
Related files to adapt:
- `next-app/lib/server/agent/artifacts.ts`
- Timeline/UI undo controls in copilot views.

`[CAF-H4]` Replace fire-and-forget memory extraction with tracked retries  
Why keep:
- Run completion and decision extraction still use `.catch(console.error)` fire-and-forget paths.
Safety:
- **Medium**.
Influence:
- Prevents silent memory-loss drift over time.
Related files to adapt:
- `next-app/lib/server/agent/run.ts`
- `next-app/lib/server/agent/artifacts.ts`
- Possibly `AgentRun` schema fields for retry status.

`[CAF-H5]` Extend per-action rate limiting to extraction/transcription  
Why keep:
- Extraction and transcribe paths still lack explicit per-action limiter checks.
Safety:
- **High**.
Influence:
- Better cost control and abuse resistance for expensive endpoints.
Related files to adapt:
- `next-app/app/actions/extraction.ts`
- `next-app/app/api/ai/transcribe/route.ts`
- `next-app/lib/server/ai/rate-limiter.ts`

`[CAF-H6]` Add security headers middleware  
Why keep:
- No `next-app/middleware.ts`; existing `proxy.ts` handles auth redirect only.
Safety:
- **Medium** (needs route matcher care).
Influence:
- Improves baseline browser hardening (nosniff/frame/referrer/HSTS/CSP-report-only).
Related files to adapt:
- `next-app/middleware.ts` (new)
- Existing `next-app/proxy.ts` behavior must remain intact.

`[CAF-H7]` Replace project-wide scan in `addMentionedStudy`  
Why keep:
- Code still loads all project studies then loops in JS for identifier matching.
Safety:
- **Medium**.
Influence:
- Improves performance/scalability and reduces latency on larger projects.
Related files to adapt:
- `next-app/lib/server/ledger.ts`
- Any mention-ingestion tests.

`[CAF-H10]` Continue service-layer consolidation for action files  
Why keep:
- Multiple action files still import `prisma` directly.
Safety:
- **Medium-low** (broad touch area; do in slices).
Influence:
- Centralizes auth/query logic and reduces data-access drift.
Related files to adapt:
- `next-app/app/actions/{conversations,notes,usage,memory,stats,ai-assistant,summarize-conversation,agent}.ts`
- New/expanded services under `next-app/lib/server/`.

`[CAF-H11]` Harden prompt/context sanitization for adversarial input variants  
Why keep:
- Current sanitization strips basic patterns but is still light for whitespace/entity/homoglyph variants.
Safety:
- **Medium**.
Influence:
- Reduces injection/control-channel leakage risk in prompt assembly.
Related files to adapt:
- `next-app/lib/ai/prompts/copilot-prompts.ts`
- Prompt/context composition call sites.

`[CAF-M1]` Add missing high-value DB indexes (partial gap remains)  
Why keep:
- Study and AIConversation still miss some query-shape composite indexes from audit.
Safety:
- **High** (migration-only if query shapes are confirmed).
Influence:
- Better filter/list performance as data grows.
Related files to adapt:
- `next-app/prisma/schema.prisma`
- Migration + query-profile checks.

`[CAF-M2]` Remove unbounded study queries where still present  
Why keep:
- `listStudies()` and some post-import reads still fetch all rows.
Safety:
- **Medium**.
Influence:
- Avoids memory spikes and long response times on large ledgers.
Related files to adapt:
- `next-app/lib/server/ledger.ts`
- Callers expecting full-list behavior.

`[CAF-M3]` Continue dynamic import strategy for heavy UI chunks  
Why keep:
- Timeline artifact cards remain statically imported; draft editor stack remains heavy.
Safety:
- **Medium**.
Influence:
- Better initial load performance and bundle characteristics.
Related files to adapt:
- `next-app/components/copilot/TimelineRenderer.tsx`
- `next-app/app/project/[id]/draft/page.tsx`

`[CAF-M4]` Improve doom-loop detection beyond consecutive repeats  
Why keep:
- Loop controller still only tracks strictly consecutive identical calls.
Safety:
- **Medium**.
Influence:
- Better protection from oscillating A→B→A→B tool loops.
Related files to adapt:
- `next-app/lib/agent/loop-controller.ts`
- Loop-controller tests.

`[CAF-M5]` Add structured outcomes to sub-agent results  
Why keep:
- `SubAgentResult` still returns free-form `summary` plus minimal tool log.
Safety:
- **Medium**.
Influence:
- Easier parent-agent reasoning, telemetry, and downstream automation.
Related files to adapt:
- `next-app/lib/server/ai/sub-agent.ts`
- `next-app/types/agent.ts` (or relevant shared type file).

`[CAF-M8]` Add branded root `not-found.tsx`  
Why keep:
- Root `app/not-found.tsx` is still absent.
Safety:
- **High**.
Influence:
- Better route-failure UX consistency.
Related files to adapt:
- `next-app/app/not-found.tsx` (new).

`[CAF-M9]` Complete focus-visible audit for `outline: none` usage  
Why keep:
- Many CSS rules still remove outlines; replacement focus styles are not guaranteed per-instance.
Safety:
- **Medium**.
Influence:
- Accessibility and keyboard-navigation reliability.
Related files to adapt:
- CSS modules across `next-app/app/`, `next-app/components/`, `next-app/styles/`.

`[CAF-M10]` Add short-lived caching for read-heavy server paths  
Why keep:
- No `unstable_cache`/tag strategy detected for read-only action/service paths.
Safety:
- **Medium**.
Influence:
- Reduced repeated DB load for frequent list/read requests.
Related files to adapt:
- Read-heavy services in `next-app/lib/server/`.
- Associated mutation paths for revalidation.

`[CAF-M11]` Reduce `exhaustive-deps` disable footprint in core hooks  
Why keep:
- Multiple disables remain in copilot conversation/stream hooks.
Safety:
- **Medium-low** (reactivity behavior sensitive).
Influence:
- Lower stale-closure risk and clearer hook semantics.
Related files to adapt:
- `next-app/hooks/useCopilotConversations.ts`
- `next-app/hooks/useCopilotStreamActions.ts`
- `next-app/components/copilot/CopilotInputCore.tsx`

`[CAF-M12]` Add magic-byte upload validation + stricter storage path guard  
Why keep:
- Validation still relies on extension/MIME; storage path split is permissive.
Safety:
- **High**.
Influence:
- Stronger file-upload trust boundaries and safer storage operations.
Related files to adapt:
- `next-app/lib/server/files.ts`
- Existing security report follow-up: stricter storage prefix validation.

`[CAF-M13]` Remove redundant in-memory claim dedup `Set`  
Why keep:
- `claimedUsers` in-memory gate still exists despite DB advisory lock serialization.
Safety:
- **High**.
Influence:
- Removes false-confidence concurrency path and simplifies claim logic.
Related files to adapt:
- `next-app/lib/server/auth/claim.ts`

`[CAF-L10]` Add startup env validation module  
Why keep:
- Missing-key failures still surface lazily at runtime in feature code paths.
Safety:
- **High**.
Influence:
- Faster fail-fast diagnostics and clearer deployment readiness.
Related files to adapt:
- `next-app/lib/env.ts` (new)
- Early import points in auth/storage/AI initialization.

`[CAF-L11]` Introduce structured audit/security logging baseline  
Why keep:
- Important operations still rely on plain console logging without normalized event schema.
Safety:
- **Medium**.
Influence:
- Better incident triage, auditability, and production observability.
Related files to adapt:
- `next-app/lib/server/**` high-value mutation/auth/AI paths first.

### 11.2 Keep, but Re-Scope (`partial`)

`[CAF-C5]` "No input validation on server actions" is outdated as phrased.  
Current state:
- Most actions now use `withValidatedAction` and/or Zod parsing.
- Remaining work is consistency and coverage hardening, not a zero-validation baseline.
Carry-forward scope:
- Enforce a uniform validation contract and verify any remaining edge actions/routes.

`[CAF-M6]` "Tool compaction loses context" is partially addressed.  
Current state:
- Compaction now includes `_truncated`, `_originalCount`, and `_note`.
Carry-forward scope:
- Improve summary metadata quality (what was omitted, range/shape hints), not a full redesign.

`[CAF-M7]` "Widespread `as any`" remains relevant but lower blast radius than originally framed.  
Current state:
- Casts still exist in production-critical paths (ledger/provider/action files), but this is no longer a blanket emergency.
Carry-forward scope:
- Remove casts in data-write and tool-parsing paths first.

`[CAF-M14]` "No stream abort cleanup" is largely addressed and should be downgraded.  
Current state:
- `request.signal` is propagated through stream route and provider SDK calls.
Carry-forward scope:
- Monitor for provider-specific resource cleanup gaps; do not prioritize as top-tier fix now.

### 11.3 Mark as Outdated in Backlog (`outdated`)

- Do not carry the original "all actions lack runtime validation" claim.
- Do not treat stream abort handling as a missing foundation control at this stage.
- Keep these as historical context only in the source audit, not as active blocker items.

---

## Section 12: Final Consolidation Coverage (Single Canonical Diagnosis File)

Goal:
- This section closes remaining coverage gaps so this file can replace all legacy diagnosis/quality reports.

### 12.1 Additional `codebase-audit-final.md` items (still relevant, previously implicit)

`[CAF-H8]` Continue decomposition of `ai-service.ts` god object  
Why keep:
- `next-app/lib/server/ai/ai-service.ts` remains large and multi-responsibility.
Safety:
- **Medium-low** (high regression surface).
Influence:
- Better maintainability, lower feature-drift risk, clearer testing seams.
Related files to adapt:
- `next-app/lib/server/ai/ai-service.ts`
- New extracted modules under `next-app/lib/server/ai/`.

`[CAF-H9]` Continue decomposition of `app/ai/page.tsx` god page  
Why keep:
- `next-app/app/ai/page.tsx` still bundles conversation orchestration, timeline flow, and input logic in one large component.
Safety:
- **Medium-low**.
Influence:
- Better UI reliability and safer future iteration speed.
Related files to adapt:
- `next-app/app/ai/page.tsx`
- New hooks/components in `next-app/app/ai/`.

`[CAF-L1]` Add few-shot/tool-sequencing examples in prompts where ambiguity remains  
Why keep:
- Prompt layer still lacks concrete worked examples for complex mode/tool behavior.
Safety:
- **High**.
Influence:
- Better tool selection reliability and fewer avoidable agent misfires.
Related files to adapt:
- `next-app/lib/ai/prompts/copilot-prompts.ts`

`[CAF-L2]` Re-check muted-text contrast token against body background  
Why keep:
- `--text-muted` remains a likely weak-contrast token candidate on the light body surface.
Safety:
- **High**.
Influence:
- Accessibility/readability improvement with low implementation risk.
Related files to adapt:
- `next-app/styles/tokens.css`

`[CAF-L3]` Document and centralize retrieval tuning constants  
Why keep:
- Memory retrieval constants remain hardcoded without in-file rationale or config-level provenance.
Safety:
- **High** (docs/config improvement first).
Influence:
- Easier tuning, safer future adjustment, improved debuggability.
Related files to adapt:
- `next-app/lib/server/memory/memory-retrieval.ts`

`[CAF-L4]` Centralize hardcoded extraction model selection  
Why keep:
- PDF extraction still hardcodes model IDs directly in service code.
Safety:
- **High**.
Influence:
- Better model governance and rollout control.
Related files to adapt:
- `next-app/lib/server/pdf-extraction.ts`
- `next-app/lib/ai/config.ts`

`[CAF-L5]` Make undo window configurable  
Why keep:
- Artifact undo TTL remains a fixed 5-minute literal.
Safety:
- **High**.
Influence:
- Better UX flexibility for long-running review workflows.
Related files to adapt:
- `next-app/lib/server/agent/artifacts.ts`
- Config surface (env/config module).

`[CAF-L6]` Reduce wildcard export surface in memory index  
Why keep:
- `export *` broadens dependency coupling and weakens import boundary clarity.
Safety:
- **High**.
Influence:
- Cleaner module boundaries and easier dependency reasoning.
Related files to adapt:
- `next-app/lib/server/memory/index.ts`
- Importers of memory modules.

`[CAF-L7]` Expand structured logging migration beyond security-only events  
Why keep:
- Console-based logs still dominate server paths.
Safety:
- **Medium** (touches many call sites).
Influence:
- Stronger production observability and easier issue triage.
Related files to adapt:
- `next-app/lib/server/**`

`[CAF-L8]` Split large context providers with mixed concerns  
Why keep:
- `ProtocolContext` and `ProjectCopilotContext` still combine broad state + effects + derived logic.
Safety:
- **Medium-low**.
Influence:
- Lower re-render pressure and clearer ownership boundaries.
Related files to adapt:
- `next-app/contexts/ProtocolContext.tsx`
- `next-app/contexts/ProjectCopilotContext.tsx`

`[CAF-L9]` Normalize Prisma AI model naming ergonomics (`aIConversation` etc.)  
Why keep:
- Current model naming remains awkward and leaks into many call sites.
Safety:
- **Medium-low** (schema + migration + broad refactor).
Influence:
- Better consistency and reduced cognitive overhead in data layer.
Related files to adapt:
- `next-app/prisma/schema.prisma`
- All call sites using `prisma.aIConversation` / `prisma.aIMessage` / `prisma.aIUsage`.

### 12.2 UX + Cross-Audit Full Coverage Mapping

Canonical mapping for `chatbot-ux-audit-claude.md` Issue `#1-#14` and `codex-feedback-claude.md`:

- `UX-01` mega-context re-render risk -> **open** (`Section 7.2`)
- `UX-02` missing client chunk throttling -> **open** (`Section 7.1`)
- `UX-03` popup parity gaps -> **open** (`Section 7.10`)
- `UX-04` silent failures -> **open** (`Section 7.5`)
- `UX-05` no progressive rendering -> **open** (`Section 7.6`)
- `UX-06` `Date.now()` collisions -> **open** (`Section 7.4`)
- `UX-07` mode pill layout shift -> **open** (added below)
- `UX-08` mobile copilot reachability -> **open** (`Section 7.7`)
- `UX-09` dual artifact state drift -> **open** (`Section 7.8`)
- `UX-10` pending attachment survives conversation switch -> **open** (`Section 7.3`)
- `UX-11` keyboard focus gap for chat actions -> **fixed** (`Section 7.11`)
- `UX-12` approve-all timeout too short -> **open** (`Section 7.9`)
- `UX-13` dead draft copilot state -> **fixed** (`Section 7.11`)
- `UX-14` `window.prompt` rename flow -> **fixed** (`Section 7.11`)

`[UX-07]` Reserve stable vertical space for mode indicator to avoid first-keystroke layout jump  
Why keep:
- Mode indicator still mounts conditionally (`input.trim()`), which can shift textarea layout on first input.
Safety:
- **High**.
Influence:
- Removes visible input jank with minimal behavioral risk.
Related files to adapt:
- `next-app/components/copilot/CopilotInputCore.tsx`
- `next-app/components/copilot/CopilotInput.module.css`

Cross-audit prioritization notes kept from `codex-feedback-claude.md`:
- Runtime unification remains desirable, but should follow immediate smoothness fixes.
- De-prioritize advanced resumable-run/SLO-gate work until baseline UX/perf and telemetry foundations are stable.

### 12.3 `QUALITY_REPORT.md` Coverage Mapping

Canonical mapping for Quality Report findings:

- `Q-01` unauthenticated AI/data endpoints -> **outdated/resolved** (session guards now present in primary AI routes/actions).
- `Q-02` `single-user` vs `local-user` identity split -> **outdated/resolved** in runtime paths; historical migration references remain.
- `Q-03` DB TLS no-verify risk -> **partial** (now guarded; still an explicit emergency override path).
- `Q-04` conversation ownership checks missing -> **largely resolved** (scoped by `userId`/`workspaceId` in conversation actions).
- `Q-05` memory actions trust client scope -> **largely resolved** (auth-derived access assertions in current actions).
- `Q-06` rate-limit bypass via project-only keying -> **partial** (identity-aware rate limit exists in AI service; per-action non-chat endpoints remain tracked under `[CAF-H5]`).
- `Q-07` denormalized `workspaceId` not populated -> **resolved in current write paths** for key study/file flows.
- `Q-08` dual conversation persistence semantics -> **partial/open** (alignment still needed with broader service-layer/runtime consolidation).

### 12.4 Canonical-File Rule

- `docs/reports/diagnosis-03-02.md` is now the single canonical diagnosis/quality tracker.
- Legacy diagnosis/quality files are retired after this consolidation and should not be reintroduced.
