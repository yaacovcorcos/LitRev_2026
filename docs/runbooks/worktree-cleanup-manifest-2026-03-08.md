# Worktree Cleanup Manifest - 2026-03-08

This manifest records the current worktree inventory before any cleanup or re-homing.

| Worktree path | Branch / HEAD | Status | Decision | Notes |
|---|---|---|---|---|
| `/Users/yaacovcorcos/LitRev_2026` | `main` @ `d3ff2fb` | active | keep | Canonical clean `main` at repo root. |
| `/Users/yaacovcorcos/.codex/worktrees/protocol-update-validation-fix` | `backup/stale-main-20260306` @ `8917e96` | stale | review | Old backup snapshot. Inspect before delete. |
| `/Users/yaacovcorcos/.codex/worktrees/rescue-context-capture-prompt-guard` | `YY/rescue-context-capture-prompt-guard` @ `6c4bebb` | rescue | keep | Explicit rescue branch. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/agentic-plan-consolidation` | `YY/codex-agentic-plan-consolidation` @ `8fcc357` | active | review | Branch exists locally but upstream is gone. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/fix-007-protocol-mutation` | `YY/fix-007-protocol-mutation` @ `b02ca18` | active | review | Branch exists locally but upstream is gone. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main` | detached `d3ff2fb` | stale | rehome | Transitional container only. Do not remove until nested child worktrees are moved or closed. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main/.worktrees/fix-007-followup-hardening` | `YY/fix-007-followup-hardening` @ `e0eb36e` | active | review | Nested under transitional container; upstream is gone. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main/.worktrees/fix-010-model-capability-policy` | `YY/fix-010-model-capability-policy` @ `017372c` | active | review | Nested under transitional container; upstream is gone. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main/.worktrees/fix-shared-failure-dedup` | `YY/fix-shared-failure-dedup` @ `85dfb61` | active | review | Nested under transitional container; upstream is gone. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main/.worktrees/fix-shared-failure-followup` | `YY/fix-shared-failure-followup` @ `e4160eb` | active | review | Nested under transitional container; upstream is gone. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/main/.worktrees/review-system` | `YY/codex-review-system` @ `ea816e5` | active | keep | Open PR `#195` to `main`. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/root-rescue-20260308` | `codex/root-rescue-20260308` @ `4f2a227` | rescue | keep | Preserved root worktree with local modifications. |
| `/Users/yaacovcorcos/LitRev_2026/.worktrees/spd-005-baseline` | detached `31d4503` | unknown | review | Detached non-canonical worktree. Inspect before delete. |
| `/Users/yaacovcorcos/LitRev_2026_worktrees/reasoning-capability-single-error` | `codex/reasoning-capability-single-error` @ `d3ff2fb` | active | review | External sibling worktree outside repo-root `.worktrees/`. |

## Current Open PRs

- `#195` `YY/codex-review-system -> main`

## Immediate Cleanup Constraints

- Do not delete `/Users/yaacovcorcos/LitRev_2026/.worktrees/main` until all nested child worktrees under it are either removed or re-homed.
- Do not delete rescue worktrees until their contents are explicitly reviewed and either promoted or archived.
