# Worktree Cleanup Manifest - 2026-03-08

This manifest records the current worktree inventory before any cleanup or re-homing.

| Worktree path | Branch / HEAD | Status | Decision | Notes |
|---|---|---|---|---|
| `/Users/yaacovcorcos/LitRev_2026` | `main` @ `d3ff2fb` | active | keep | Canonical clean `main` at repo root. |
| `/Users/yaacovcorcos/.codex/worktrees/protocol-update-validation-fix` | `backup/stale-main-20260306` @ `8917e96` | stale | review | Old backup snapshot. Inspect before delete. |
| `/Users/yaacovcorcos/.codex/worktrees/rescue-context-capture-prompt-guard` | `YY/rescue-context-capture-prompt-guard` @ `6c4bebb` | stale | deleted | Commit was already contained on `main`; upstream was gone, so the rescue worktree and branch were removed on 2026-03-08. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/agentic-plan-consolidation` | `YY/codex-agentic-plan-consolidation` @ `8fcc357` | active | review | Branch exists locally but upstream is gone. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/fix-007-protocol-mutation` | `YY/fix-007-protocol-mutation` @ `b02ca18` | active | review | Branch exists locally but upstream is gone. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main` | detached `d3ff2fb` | stale | deleted | Transitional container retired on 2026-03-08 after child worktrees were re-homed. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main/.worktrees/fix-007-followup-hardening` | `YY/fix-007-followup-hardening` @ `e0eb36e` | active | rehomed | Moved to `/Users/yaacovcorcos/LitRev_2026/.worktrees/fix-007-followup-hardening`. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main/.worktrees/fix-010-model-capability-policy` | `YY/fix-010-model-capability-policy` @ `017372c` | active | rehomed | Moved to `/Users/yaacovcorcos/LitRev_2026/.worktrees/fix-010-model-capability-policy`. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main/.worktrees/fix-shared-failure-dedup` | `YY/fix-shared-failure-dedup` @ `85dfb61` | active | rehomed | Moved to `/Users/yaacovcorcos/LitRev_2026/.worktrees/fix-shared-failure-dedup`. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main/.worktrees/fix-shared-failure-followup` | `YY/fix-shared-failure-followup` @ `e4160eb` | active | rehomed | Moved to `/Users/yaacovcorcos/LitRev_2026/.worktrees/fix-shared-failure-followup`. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main/.worktrees/review-system` | `YY/codex-review-system` @ `bb77dbe` | stale | deleted | PR `#195` was merged to `main` on 2026-03-08 and the local worktree/branch were removed. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/fix-007-followup-hardening` | `YY/fix-007-followup-hardening` @ `e0eb36e` | active | review | Re-homed from the retired `.worktrees/main` container; upstream is gone and content is not on `main`. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/fix-010-model-capability-policy` | `YY/fix-010-model-capability-policy` @ `017372c` | active | review | Re-homed from the retired `.worktrees/main` container; upstream is gone and content is not on `main`. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/fix-shared-failure-dedup` | `YY/fix-shared-failure-dedup` @ `85dfb61` | active | review | Re-homed from the retired `.worktrees/main` container; upstream is gone and content is not on `main`. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/fix-shared-failure-followup` | `YY/fix-shared-failure-followup` @ `e4160eb` | active | review | Re-homed from the retired `.worktrees/main` container; upstream is gone and content is not on `main`. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/hide-ai-model-options` | `YY/hide-ai-model-options` @ `6363482` | stale | deleted | PR `#211` was merged to `main` on 2026-03-08 and the local worktree/branch were removed. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/root-rescue-20260308` | `codex/root-rescue-20260308` @ `4f2a227` | rescue | keep | Preserved root worktree with local modifications. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/spd-005-baseline` | detached `31d4503` | stale | deleted | Detached worktree head was already contained on `main`, so the worktree was removed on 2026-03-08. |
| `/Users/yaacovcorcos/LitRev_2026_worktrees/reasoning-capability-single-error` | `codex/reasoning-capability-single-error` @ `32df888` | stale | deleted | PR `#210` was merged to `main` on 2026-03-08 and the worktree was removed during merge cleanup. |

## Current Open PRs

- None.

## Immediate Cleanup Constraints

- Do not delete rescue worktrees until their contents are explicitly reviewed and either promoted or archived.
