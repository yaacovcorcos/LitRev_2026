# litrev/no-cross-boundary-parent-imports

Across `app`, `components`, `contexts`, and `hooks`, LitRev prefers `@/` imports for cross-boundary references.

Policy:
- same-folder relative imports are allowed
- parent-directory climbs are not
- the rule covers:
  - `import "../x"`
  - `export { x } from "../x"`
  - `export * from "../x"`
  - string-literal `import("../x")`
- computed dynamic imports stay out of scope for this rule
