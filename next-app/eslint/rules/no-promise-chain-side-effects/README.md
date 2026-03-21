# litrev/no-promise-chain-side-effects

In UI/runtime code, promise-chain callbacks that set state, log, or navigate hide control flow. Prefer an explicit `async` function with `try` / `catch`.

Phase 4 scope:
- `app/**`
- `components/**`
- `contexts/**`
- `hooks/**`
- excluding `app/actions/**` and `app/api/**`

Use the stable verifier:
- `npm run lint:governance:phase4-async`
