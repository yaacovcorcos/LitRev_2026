# litrev/no-default-export-except-framework

Default exports are reserved for framework-required files such as Next.js `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, and generated code.

LitRev prefers named exports elsewhere for grepability, rename safety, and agent searchability.

Scope:
- enforced on the governed app surface: `app`, `components`, `contexts`, `hooks`, and `lib`
- not enforced on `scripts/**`
