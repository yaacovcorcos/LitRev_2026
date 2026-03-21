# litrev/no-promise-chain-side-effects

In UI/runtime code, promise-chain callbacks that set state, log, or navigate hide control flow. Prefer an explicit `async` function with `try` / `catch`.
