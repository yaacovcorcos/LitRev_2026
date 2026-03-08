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
  - `1,435,355 -> 1,440,956`
  - delta: `+5,601` (`+0.4%`)
- Empty `/ai` composer-ready:
  - `358 ms -> 342 ms`
  - delta: `-16 ms` (`-4.5%`)
- Populated `/ai` timeline-ready:
  - `70 ms -> 58 ms`
  - delta: `-12 ms` (`-17.1%`)

## Notes
- Closeout result: `FAIL`
- The follow-up route-local wave deferred history/sidebar chrome and export helpers out of the initial `/ai` chunk, moved global workspace context behind composer-ready idle time, and restored populated closeout performance by preloading the conversation list after composer-ready.
- The external empty-route composer metric is now back near baseline, but the canonical bundle artifact still fails the pinned closeout threshold.
- Shared non-regression checks remained green through:
  - full `npx vitest run`
  - `TimelineRenderer.windowing-defaults.test.tsx`
  - existing project copilot and project conversation tests already in the suite

## Conclusion
`SPD-005` should remain open. The latest `/ai` route-local wave fixed the populated-conversation regression and nearly recovered the empty-route readiness path, but the canonical bundle metric still fails the pinned closeout bar.

## Next Narrow Follow-up
- Keep the shared composer and shared timeline contracts as they are.
- Focus the next `/ai` wave on shared composer bundle trimming:
  - still-eager optional input features on the `/ai` entry path
  - especially features that can become lazy islands without forking the shared composer contract
- Treat additional timeline work as out of scope unless a later populated-route measurement shows a new regression there.
