# litrev/require-tests-for-runtime-files

Runtime and orchestration code in the finalized Phase 4 domains should have nearby tests or an explicit one-file waiver that points to accepted central or integration coverage.

Phase 4 governed domains:
- `lib/agent/**`
- `lib/server/agent/**`
- `lib/server/ai/tools/**`

This rule is intentionally narrow and complements the changed-files runtime test-impact guard.

Stable verification commands:
- `npm run lint:governance:phase4-tests`
- `npm run check:runtime-test-impact`
