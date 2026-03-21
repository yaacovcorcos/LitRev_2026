# litrev/no-catch-console-error

`catch(console.error)` hides intent and makes it easy to swallow failures without choosing a real fallback, retry, or surfaced error path.

Use an explicit callback and decide what should happen on failure.

Scope:
- enforced on the governed app surface
- also enforced on `scripts/**`

Ownership:
- callers must choose an explicit failure behavior such as logging intentionally, setting exit state, retrying, or surfacing the failure upstream
