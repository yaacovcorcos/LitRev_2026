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
- `npm run lint:governance:audit`
- `npm run test:eslint-rules`
- `npm run test:governance-tooling`

Contracts:
- governance tooling must import only direct devDependencies declared in `next-app/package.json`
- the governance audit baseline is generated from shared JS file enumeration under the governance lint surface, not shell-specific `find` or `rg` composition
