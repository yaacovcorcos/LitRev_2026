# litrev/no-log-and-throw-same-block

Logging an error and then throwing it in the same block usually duplicates error reporting and obscures which layer is responsible for handling the failure.

Scope:
- enforced on the governed app surface
- also enforced on `scripts/**`

Ownership:
- report only when `console.error(...)` and `throw` share the same catch body or direct block ownership
- nested callbacks, nested functions, and deferred async handlers establish a new ownership boundary and are not paired with outer throws
