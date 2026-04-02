# Security Policy

This repository is private and collaborator-managed.

## Supported Branch

The only supported security baseline is the current `main` branch.
Feature branches, task worktrees, historical snapshots, and local transfer artifacts are not supported release surfaces.

## Reporting A Vulnerability

Do not disclose vulnerabilities in normal GitHub issues, pull requests, review comments, chat threads, or shared project notes.

Use a private reporting path instead:

1. Prefer a GitHub draft security advisory if you have the permissions to create one for this repository.
2. Otherwise, report directly to the repository owner or maintainers through an existing private channel.
3. If you do not already have a private channel, make a minimal contact request first and do not include exploit details in any public-facing outreach.

Include as much of the following as you can:

- affected branch, commit, or deployment
- clear reproduction steps
- impact and likely blast radius
- whether auth is required
- whether real user, workspace, project, or file data was accessed
- relevant logs or request samples with secrets and personal data removed
- any proposed mitigation or containment idea

## Report Acceptance Gate

For fastest triage, include all of the following:

- exact file, function, route, workflow, or config path involved
- tested branch, commit SHA, and deployment target if relevant
- reproducible steps against current `main` or the exact deployed target
- the specific boundary crossed:
  - authentication
  - workspace / project / study / file / memory authorization
  - platform-admin access
  - internal job or cron ingress
  - service-role-backed database or storage access
  - AI tool or agent runtime scope
  - CI or supply-chain surface
- demonstrated impact and likely blast radius
- whether authentication was required
- whether real user, workspace, project, study, or file data was accessed
- whether the issue depends on local-only config, unsupported branch state, or transfer artifacts rather than current `main` or a deployed environment

## Testing Expectations

Please keep testing non-destructive and tightly scoped.

Do not:

- exfiltrate real user data beyond what is strictly needed to prove the issue
- modify, delete, or corrupt production data unless explicitly coordinated
- rotate, revoke, or publish secrets yourself
- use public disclosure before maintainers confirm remediation posture

## Response Expectations

Maintainers aim to:

- acknowledge a private report within 5 business days
- validate severity and affected surface before discussing remediation timelines
- coordinate a fix, mitigation, or containment path before broader disclosure

For collaborator-handled fixes, update the canonical finding tracker in [`docs/reports/security-review-2026-03-01.md`](docs/reports/security-review-2026-03-01.md) when a vulnerability is opened or closed.

## Scope

In-scope repository surfaces include:

- Next.js routes, server actions, and server-side services
- auth and platform-admin boundaries
- workspace, project, and study tenancy enforcement
- Supabase storage and service-role-backed file reads
- AI tools, agent runtime boundaries, and memory access
- background jobs, internal routes, and cron ingress
- Prisma/database access patterns and raw SQL usage
- GitHub Actions, secrets handling, and dependency/supply-chain exposure

## Trust Model

LitRev is a multi-user, multi-tenant web application.

Authenticated users are not trusted operators. A valid session proves identity, not authorization.

Primary security boundaries in this repository include:

- user and session identity
- workspace, project, study, file, and memory authorization
- platform-admin access
- cron ingress and internal background dispatch
- service-role-backed database and storage reads
- AI tool execution inside validated actor and project scope

Important: route names, request headers, request origins, preview/prod hostnames, project IDs in URLs, file IDs, study IDs, conversation IDs, and model/tool outputs are not authorization boundaries by themselves.

## Not A Security Bug By Itself

The following are not security vulnerabilities on their own unless they cross a real server-enforced boundary:

- prompt injection without a demonstrated authorization, tool-scope, tenancy, or internal-boundary bypass
- client-side-only restrictions when the server still enforces authorization correctly
- local-only development shortcuts that are not enabled in preview or production
- findings that depend on trusted maintainer, infrastructure, or database access without showing an untrusted path to obtain that access
- reports against unsupported local transfer artifacts, stale worktrees, or old feature branches rather than current `main` or the affected deployed environment
- missing secrecy of identifiers alone (`projectId`, `studyId`, `fileId`, conversation IDs) when the server correctly enforces ownership checks

## Internal Security Baseline

Collaborators implementing or reviewing security-sensitive work should load:

- [`docs/runbooks/security-baseline.md`](docs/runbooks/security-baseline.md)
- [`docs/reports/security-review-2026-03-01.md`](docs/reports/security-review-2026-03-01.md)
- the owner docs for the touched subsystem
