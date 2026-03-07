# `/ai` Closeout Check - 2026-03-07

## Scope
- Task: `SPD-005`
- Baseline commit: `31d45033696c3c54d9b223bb6576fc933e22bc4c`
- Head commit measured: `93ed71896d46b119f272bac422095220d1534d2f`

## Procedure
- Build command for both sides:
  - `BETTER_AUTH_SECRET=<fixed value> npx next build`
- Bundle artifact source:
  - `npm run perf:ai-bundle-report`
- Readiness capture:
  - `npm run perf:ai-closeout-capture -- --app-root <next-app> --skip-build --output <json>`
- Comparison:
  - `npm run perf:ai-closeout-compare -- --baseline <baseline-json> --head <head-json>`

## Closeout Thresholds
- Bundle bytes:
  - improve by at least `5%` or `50 KB`, whichever is larger
- Empty `/ai` `composer-ready`:
  - improve by at least `10%` or `75 ms`, whichever is larger
- Populated `/ai` `timeline-ready`:
  - improve by at least `15%` or `150 ms`, whichever is larger

## Results
- Bundle bytes:
  - `1,435,355 -> 1,433,928`
  - delta: `-1,427` (`-0.1%`)
- Empty `/ai` composer-ready:
  - `358 ms -> 469 ms`
  - delta: `+111 ms` (`+31.0%`)
- Populated `/ai` timeline-ready:
  - `70 ms -> 123 ms`
  - delta: `+53 ms` (`+75.7%`)

## Notes
- Closeout result: `FAIL`
- The empty-route `composerReady` route marker stayed `null`, so the external scripted timer remained the authoritative composer metric for this run.
- The populated fixture still lands on `50` initially rendered messages, so the `/ai`-only timeline windowing path does not materially improve the first populated open path in this measurement.
- Shared non-regression checks remained green through:
  - full `npx vitest run`
  - `TimelineRenderer.windowing-defaults.test.tsx`
  - existing project copilot and project conversation tests already in the suite

## Conclusion
`SPD-005` should remain open. The first `/ai` reduction wave established useful instrumentation and safe shared-surface guards, but it did not meet the closeout thresholds.

## Next Narrow Follow-up
- Keep the shared composer and shared timeline contracts as they are.
- Focus the next `/ai` wave on the still-expensive initial route path:
  - empty-route composer readiness
  - conversation history/sidebar data and hydration cost on `/ai`
- Treat any additional timeline work as out of scope unless a new populated-route measurement shows the populated open path, not the sidebar/history path, is the dominant remaining cost.
