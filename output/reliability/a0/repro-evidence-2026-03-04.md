# Reliability A0 Repro Evidence

- Date: 2026-03-04
- Commit: 33a1f4b
- Tester: Codex (automated runner)

## Executed required checks
- `npx tsc --noEmit`: pass
- `npx vitest run`: pass (165 files, 1230 tests passed, 11 skipped)
- `npx playwright test e2e/mobile-ai-entry-smoke.spec.ts e2e/mobile-login-smoke.spec.ts`: pass (2/2)

## Repro #1: Dead-scroll
- Surface: pending full manual matrix (`/project/[id]` conversation and view-copilot, `/ai`, popup)
- Flag combo: pending explicit runs
- Device/network profile: pending normal/Fast3G/Slow3G/offline-restore matrix
- Steps run: scripted checks only (no deterministic manual dead-scroll capture yet)
- Observed outcome: no failure captured in current automated smoke
- Failure signature met (`yes|no`): no (not yet executed in full repro matrix)
- Evidence: n/a (pending manual capture)

## Repro #2: Stuck stream state
- Surface: pending full manual matrix (`/project/[id]` and `/ai` first)
- Flag combo: pending explicit runs
- Device/network profile: pending offline mid-stream interruption runs
- Steps run: scripted checks only (login/entry smoke)
- Observed outcome: no stuck-loading capture in current automated smoke
- Failure signature met (`yes|no`): no (not yet executed in full repro matrix)
- Evidence: n/a (pending interruption capture)

## Environment notes
- Initial Playwright attempt failed due Next dev lock at `.next/dev/lock` when trying to start its own web server.
- Resolved by reusing existing local dev server (`PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000`).

## Gap to close before A0 exit
1. Run deterministic repro scripts for dead-scroll and interrupted-stream with explicit evidence artifacts.
2. Run required network and flag combinations.
3. Populate quantitative metrics and pass/fail against thresholds.
