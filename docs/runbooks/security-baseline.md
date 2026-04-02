# Security Baseline

This runbook is the repo-local security operating baseline for LitRev.

Use it when:

- reviewing security-sensitive changes
- triaging a new vulnerability
- deciding whether a boundary is safe enough to ship
- onboarding a collaborator who will own security work in this repository

This document does not replace owner docs, tests, or release gates.
It exists so security decisions are grounded in one LitRev-local baseline instead of scattered chat memory.

## Retrieve Before Security Work

Load these repo-local sources first:

1. [`SECURITY.md`](../../SECURITY.md)
2. [`docs/reports/security-review-2026-03-01.md`](../reports/security-review-2026-03-01.md)
3. [`docs/runbooks/internal-advisory-reviews.md`](internal-advisory-reviews.md)
4. the owner docs for the touched subsystem:
   - backend/admin/storage/auth: [`docs/plans/plan-backend.md`](../plans/plan-backend.md), [`docs/runbooks/admin-access.md`](admin-access.md), [`docs/runbooks/db-architecture.md`](db-architecture.md)
   - agent/tool/runtime: [`docs/plans/plan-agentic.md`](../plans/plan-agentic.md), [`docs/plans/plan-memory.md`](../plans/plan-memory.md), [`docs/plans/plan-prompts.md`](../plans/plan-prompts.md)
   - repo workflow / CI / supply chain: [`docs/runbooks/github-flow.md`](github-flow.md)

## LitRev Trust Model

LitRev must be reviewed as a multi-tenant application with authenticated but mutually untrusted users.

The system must prevent unauthorized cross-user and cross-project access across:

- workspaces
- projects
- studies
- files
- AI conversations
- memory
- admin and control-plane surfaces

A valid session is not enough to read or mutate any of those surfaces. Every boundary must be enforced server-side at the point of access.

## Core Security Invariants

### 1. Treat every route and server action as a public entry point

Server Actions, route handlers, cron routes, and internal callbacks must be safe against direct caller control.
Do not rely on hidden UI controls, client assumptions, or “this route is internal” naming.

Primary references:
- Next.js Data Security
- Next.js Authentication guide

### 2. Authentication is not authorization

A valid session, token, or runtime actor is never enough on its own.
Project, workspace, study, file, and platform-admin access must be checked explicitly at the boundary that performs the read or mutation.

This repo has already had real IDOR-style findings in project and file flows. Default to deny-by-default and explicit ownership checks.

Primary references:
- OWASP Authorization Cheat Sheet
- OWASP IDOR Prevention Cheat Sheet

### 3. Request metadata is never proof of identity

Headers, origins, forwarded host values, user agents, and route naming are context only.
They are not authentication.

For LitRev specifically:
- `x-vercel-cron` or similar metadata must never be treated as auth
- request `Origin` must never choose a privileged internal target
- preview/prod hostnames are not authorization

Primary references:
- Vercel cron job docs
- OWASP SSRF Prevention Cheat Sheet

### 4. Service-role credentials turn app-layer validation into the real security boundary

Supabase service-role reads bypass RLS.
Whenever code uses service-role-backed DB or storage access, the application layer must fully validate ownership, namespace, and intended scope before the privileged read happens.

For LitRev specifically:
- storage identity must be server-owned
- raw storage paths are not a client contract
- file reads must start from validated project-owned records

Primary references:
- Supabase secure-data docs
- Supabase storage access-control docs
- [`docs/plans/plan-backend.md`](../plans/plan-backend.md)

### 5. Better Auth is the identity authority; Supabase Auth is not

This repository uses Better Auth for sessions and identity.
Supabase is a database and storage provider here, not the user-auth source of truth.
Any auth design that assumes Supabase Auth semantics is wrong for this repo.

Primary references:
- [`docs/plans/plan-backend.md`](../plans/plan-backend.md)
- Better Auth security docs

### 6. Admin and background privileges need separate guard rails

Platform-admin access, cron ingress, internal background execution, and user-facing session auth are separate trust boundaries.
Do not merge them into one permissive guard.

For LitRev specifically:
- `/admin/**` must use platform-admin guard paths
- cron ingress uses a cron-specific secret boundary
- internal dispatch uses its own secret boundary
- local development exceptions must stay clearly scoped to non-deployed environments

Primary references:
- [`docs/runbooks/admin-access.md`](admin-access.md)
- [`docs/plans/plan-backend.md`](../plans/plan-backend.md)

### 7. AI tools do not get to widen authority

Prompt output, model suggestions, and tool-call requests are untrusted inputs.
The model does not decide scope; the server does.
Every AI tool must operate only inside validated actor and project context.

For LitRev specifically, review:
- tool exposure
- memory read/write scope
- file read scope
- protocol / ledger mutation scope
- prompt-injection resistance at tool boundaries

Primary references:
- OWASP Top 10 for LLM Applications
- OpenAI agent safety guidance
- [`docs/plans/plan-agentic.md`](../plans/plan-agentic.md)

### 8. Unknown data should stay unknown

Security and trust both degrade when the system silently invents authoritative values.
If source metadata is missing, preserve that uncertainty unless there is an explicitly justified canonical fallback.

This is a correctness rule with security value because false certainty hides real fault boundaries and weakens reviewability.

### 9. Secrets must be treated as production material even in local workflows

Never commit secrets.
Never paste them into docs unless the file is already an approved local-only secret artifact outside tracked repo policy.
If a secret is loaded into an unsafe surface, assume rotation may be required.

Primary references:
- OWASP Secrets Management Cheat Sheet
- GitHub secret scanning docs

### 10. Security findings are only durable when promoted into repo owners

A security review in chat is not enough.
Repeated findings must become one of:

- a focused test
- a repo-local rule
- a runbook update
- a plan update
- a decision-log entry
- a canonical tracked finding in the security review doc

Primary references:
- [`docs/runbooks/internal-advisory-reviews.md`](internal-advisory-reviews.md)
- [`docs/reports/security-review-2026-03-01.md`](../reports/security-review-2026-03-01.md)

## Things That Are Not Authorization Boundaries

Do not treat any of the following as proof of access:

- `projectId`, `studyId`, `fileId`, or conversation IDs from the client
- request metadata such as `Origin`, `Referer`, `Host`, `x-vercel-cron`, or user agent
- route naming such as `/internal/**`
- hidden UI controls
- client-submitted storage paths or URLs
- model-generated tool calls, prompt content, or AI-produced identifiers
- possession of a URL without a corresponding server-side ownership check

## Security Fix Regression Rule

Every security-sensitive bug fix should add at least one adversarial regression test.

Prefer tests that prove rejection of:

- cross-tenant ID injection
- client-authored privileged paths or URLs
- metadata spoofing
- admin or internal-route misuse by non-admin callers
- local-only or dev-only bypasses outside local development
- service-role-backed reads against poisoned or mismatched records

If a fix cannot reasonably add a test in the same task, the PR should explain why and point to the next owner artifact that will carry the guarantee.

## Review Priority For Security Work

When triaging a security-sensitive change, ask these questions in order:

1. What server-enforced boundary is supposed to protect this surface?
2. Can the caller choose the scope identifier or privileged pointer?
3. Does any service-role or privileged runtime bypass a lower layer of protection?
4. Is the boundary tested with an adversarial case, not only a happy path?
5. If this issue has repeated before, where is the durable promotion:
   - test
   - runbook
   - plan
   - decision log
   - canonical finding

## LitRev Security Review Checklist

### Auth and session boundaries

Check:
- session validation at every route/action/API boundary
- trusted-origin / CSRF posture where applicable
- cookie and token handling
- rate limiting on auth-sensitive surfaces
- non-production auth shortcuts blocked outside local/dev expectations

Primary repo files:
- `next-app/lib/server/auth/**`
- `next-app/app/api/auth/**`

### Authorization and tenancy

Check:
- project/workspace ownership checks before every read/write
- study/file access scoped through project ownership
- admin-only reads and mutations guarded server-side
- no client-controlled IDs becoming privileged scope without validation

Primary repo files:
- `next-app/app/actions/**`
- `next-app/lib/server/**`
- `next-app/app/api/**`

### Files and storage

Check:
- server-owned storage identity
- canonical namespace validation before privileged reads
- file upload validation and content-type handling
- explicit handling for public vs private/downloadable assets
- no raw client-authored storage pointers

Primary repo files:
- `next-app/lib/server/files.ts`
- `next-app/lib/server/file-storage.ts`
- `next-app/lib/server/pdf-extraction.ts`

### Background jobs, cron, and internal routes

Check:
- secret-backed auth only
- no metadata-based trust
- idempotency / duplicate-delivery safety
- no origin-derived privileged targets
- clear separation between deployed and local-dev exceptions

Primary repo files:
- `next-app/app/api/cron/**`
- `next-app/app/api/internal/**`
- `next-app/lib/server/study-processing*.ts`

### AI runtime and tool boundaries

Check:
- actor/project context validation before tool execution
- tool-specific least privilege
- prompt injection resistance at the tool boundary
- no direct model-controlled access to cross-project data
- memory operations scoped and auditable

Primary repo files:
- `next-app/lib/server/ai/**`
- `next-app/lib/server/agent/**`
- `next-app/lib/server/memory/**`

### Database and query safety

Check:
- Prisma and raw query safety
- migration/release ordering for security-sensitive schema changes
- no production code depending on not-yet-applied columns
- direct privileged queries remain scoped and reviewed

Primary repo files:
- `next-app/lib/server/**`
- `next-app/prisma/**`
- `next-app/scripts/**`

### Logging, telemetry, and privacy

Check:
- no secret leakage in logs
- no unbounded PII capture in telemetry
- anonymous/public ingest remains intentionally narrow
- failure reporting stays informative without exposing internals

Primary repo files:
- telemetry routes and metrics helpers
- auth / storage / AI error handling surfaces

### CI, GitHub, and supply chain

Check:
- least-privilege GitHub Actions posture
- dependency and secret scanning visibility
- non-interactive, reviewable PR flow
- release gates remain intact
- external code/pattern intake goes through repo-local rewrite rules

Primary repo files:
- `.github/**`
- [`docs/runbooks/github-flow.md`](github-flow.md)
- [`docs/runbooks/external-pattern-intake.md`](external-pattern-intake.md)

## External Canon

Use primary sources first.

### Baseline application security

- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP IDOR Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

### Stack-specific

- [Next.js Data Security](https://nextjs.org/docs/app/guides/data-security)
- [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication)
- [Next.js serverActions config](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)
- [Better Auth security docs](https://www.better-auth.com/docs/reference/security)
- [Supabase secure data](https://supabase.com/docs/guides/database/secure-data)
- [Supabase storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Vercel managing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel deployment protection](https://vercel.com/docs/security/deployment-protection)
- [Vercel WAF](https://vercel.com/docs/vercel-firewall/vercel-waf)
- [Prisma raw queries](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries)

### AI and agent security

- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [OpenAI agent safety guidance](https://platform.openai.com/docs/guides/agent-builder-safety)
- [OpenAI safety best practices](https://platform.openai.com/docs/guides/safety-best-practices/understand-and-communicate-limitations%3F.pdf)

### Repository and CI security

- [GitHub quickstart for securing your repository](https://docs.github.com/en/code-security/getting-started/quickstart-for-securing-your-repository)
- [GitHub secret scanning](https://docs.github.com/github/administering-a-repository/about-secret-scanning)
- [GitHub Actions security hardening](https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/security-hardening-for-github-actions)

## Promotion Rule

When a new security lesson is learned twice, promote it out of chat and into one of:

- a focused test
- `docs/reports/security-review-2026-03-01.md`
- an owner runbook or plan
- `docs/architecture/decision-log.md`
- a repo-local lint rule or validation script

Security posture improves only when repeated lessons become normal repo machinery.
