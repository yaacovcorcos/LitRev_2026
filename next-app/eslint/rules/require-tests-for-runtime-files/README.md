# litrev/require-tests-for-runtime-files

Runtime and orchestration code in the finalized Phase 4 domains should have nearby tests or an explicit one-file waiver that points to accepted central or integration coverage.

Phase 4 governed domains:
- `lib/agent/**`
- `lib/server/agent/**`
- `lib/server/ai/tools/**`
- `lib/server/ai/ai-service.ts`
- critical provider implementations and stream-termination policy
- `lib/server/ai/tool-middleware.ts`
- `app/actions/agent.ts`
- `app/api/ai/stream/route.ts`

The companion changed-file check evaluates committed branch diff, staged changes, unstaged changes, and untracked files. Central test-family mappings and one-file waivers establish where accepted integration coverage lives; they do not exempt a runtime edit from changing a mapped test.

This rule is intentionally narrow and complements the changed-files runtime test-impact guard.

Stable verification commands:
- `npm run lint:governance:phase4-tests`
- `npm run check:runtime-test-impact`
