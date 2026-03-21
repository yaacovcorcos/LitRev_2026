# litrev/no-catch-console-error

`catch(console.error)` hides intent and makes it easy to swallow failures without choosing a real fallback, retry, or surfaced error path.

Use an explicit callback and decide what should happen on failure.
