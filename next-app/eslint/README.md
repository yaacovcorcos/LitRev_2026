# LitRev Lint Governance

Repo-local lint governance for LitRev.

Principles:
- encode architecture, not style trivia
- keep rules repo-specific and documented
- pair new rules with tests and real code cleanup
- prefer targeted rollout over noisy repo-wide bans

Structure:
- `plugin.mjs`: local ESLint plugin export
- `configs/`: layered internal flat-config slices
- `rules/`: one rule per convention
- `fixtures/`: optional shared lint fixtures
- `test-utils.ts`: shared RuleTester helpers

Commands:
- `npm run lint:governance`
- `npm run lint:governance:phase1`
- `npm run lint:governance:phase2-hotspots`
- `npm run lint:governance:phase3-searchability`
- `npm run lint:governance:phase4-async`
- `npm run lint:governance:phase4-tests`
- `npm run lint:governance:phase4-policy`
- `npm run check:runtime-test-impact`
- `npm run governance:ci-required`
- `npm run governance:ci-informational`
- `npm run lint:governance:audit`
- `npm run test:eslint-rules`
- `npm run test:governance-tooling`

Contracts:
- governance tooling must import only direct devDependencies declared in `next-app/package.json`
- the governance audit baseline is generated from shared JS file enumeration under the governance lint surface, not shell-specific `find` or `rg` composition
- `npm run lint:governance:phase1` is the stable verification command for the completed Phase 1 contract
- `npm run lint:governance:phase2-hotspots` is the stable verification command for the completed Phase 2 hot-spot surface only:
  - `app/ai/**`
  - `components/copilot/**`
  - `contexts/ProjectCopilotContext.tsx`
  - `hooks/useCopilotConversations.ts`
  - `hooks/useCopilotStreamActions.ts`
  - `app/project/[id]/layout.tsx`
- `npm run lint:governance:phase3-searchability` is the stable verification command for the completed Phase 3 searchability contract on the UI surface only:
  - `app/**`
  - `components/**`
  - `contexts/**`
  - `hooks/**`
  - excluding `app/actions/**` and `app/api/**`
- `npm run lint:governance:phase4-async` is the stable verification command for the completed Phase 4 async-policy surface only:
  - `app/**`
  - `components/**`
  - `contexts/**`
  - `hooks/**`
  - excluding `app/actions/**` and `app/api/**`
  - enforcing:
    - `litrev/prefer-async-await-in-ui-runtime`
    - `litrev/no-promise-chain-side-effects`
    - `litrev/no-window-location-navigation`
- `npm run lint:governance:phase4-tests` is the stable verification command for the completed Phase 4 runtime test-governance surface only:
  - `litrev/require-tests-for-runtime-files`
    - `lib/agent/**`
    - `lib/server/agent/**`
    - `lib/server/ai/tools/**`
  - `litrev/prefer-colocated-tests-in-selected-domains`
    - `lib/agent/**`
- `npm run lint:governance:phase4-policy` is the stable umbrella verifier for the completed Phase 4 policy surface:
  - it runs `npm run lint:governance:phase4-async`
  - it runs `npm run lint:governance:phase4-tests`
- `npm run check:runtime-test-impact` is the stable changed-file companion to the Phase 4 test-governance contract:
  - it consumes the same governed domains and waiver file as the two lint rules
  - it does not carry parallel domain logic
  - it accepts only one-file waivers with concrete test paths
- `npm run governance:ci-required` is the permanent local reproduction command for the required governance portion of GitHub `check`:
  - `npm run governance:check`
  - `npm run test:eslint-rules`
  - `npm run test:governance-tooling`
  - `npm run lint:governance:phase1`
  - `npm run lint:governance:phase2-hotspots`
  - `npm run lint:governance:phase3-searchability`
  - `npm run lint:governance:phase4-policy`
  - `npm run check:runtime-test-impact`
- `npm run governance:ci-informational` is the permanent local reproduction command for the non-blocking governance reporting portion of GitHub `check`:
  - it always runs broad `npm run lint:governance`
  - it always runs `npm run lint:governance:audit`
  - it writes `governance-audit.json` for artifact upload and local inspection
- GitHub `check` now wires these commands directly:
  - `governance:ci-required` is the blocking governance gate
  - `governance:ci-informational` always runs as non-blocking reporting
- additions to the required governance inventory are phase-owned:
  - do not add broad `lint:governance`, audit reporting, or unrelated checks to `governance:ci-required`
  - update the canonical lint-governance plan and governance docs in the same task when the required inventory changes
- Phase 4 selective strictness decisions are explicit and durable:
  - raw UI `fetch()` restrictions: rejected for now
  - broader `window.location` restrictions beyond navigation mutation: rejected
  - UI `console.*` restrictions: deferred to the separate logging-governance track
  - blanket restrictions on `style`, `className`, `useMemo`, or raw anchors: rejected for now
- the Phase 2 hot-spot verifier intentionally bundles the current async-cleanup rules for that same surface only; it confirms the completed hot-spot cleanup contract and does not imply broader Phase 4 completion
- `scripts/**` is intentionally included only for the Phase 1 logging rules (`litrev/no-catch-console-error` and `litrev/no-log-and-throw-same-block`)
- the governance audit baseline still excludes `scripts/**` by design; audit roots and lint-enforcement scope are not identical
