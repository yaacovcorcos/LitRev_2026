# `litrev/no-server-runtime-console`

Server/runtime logging must go through the shared helper in `@/lib/server/logging`.

This rule governs:
- `lib/server/**`
- `app/actions/**`
- `app/api/**`

This rule ignores:
- tests
- fixtures
- generated files
- `lib/server/logging.ts`

## Invalid

```ts
console.error("[ai-service] failed", error);
```

```ts
console.warn("timed out");
```

## Valid

```ts
import { logServerError } from "@/lib/server/logging";

logServerError("ai-service", "Failed to finalize run", { runId }, error);
```

```ts
import { logServerWarn } from "@/lib/server/logging";

logServerWarn("grobid", "Header extraction timed out");
```
