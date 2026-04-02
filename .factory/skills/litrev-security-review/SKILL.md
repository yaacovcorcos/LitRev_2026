---
name: litrev-security-review
description: Review LitRev backend trust boundaries for security findings using repo-owned backend and admin contracts. Advisory only and non-blocking. Use for auth, platform-admin, uploads/storage, route/API/server-action, and backend validation reviews.
---
# LitRev Security Review

Perform a focused, evidence-backed security review of LitRev backend trust boundaries.

This skill is advisory only.
It complements tests, typecheck, release gates, and normal code review.

## Read First

Before reviewing, read:
- `AGENTS.md`
- `docs/plans/plan-backend.md`
- `docs/runbooks/admin-access.md`
- `docs/reviews/repo-health.md`

If the review touches DB semantics or migration-driven access controls, also read:
- `docs/runbooks/db-architecture.md`
- `docs/runbooks/db-ops.md`

## Use this skill when

- Reviewing auth and authorization boundaries.
- Reviewing platform-admin routes, actions, APIs, or mutations.
- Reviewing upload, file-asset, or storage path handling.
- Reviewing route handlers or server actions for validation, tenancy, or privilege issues.
- Reviewing backend AI entrypoints where the risk is backend-owned trust, not runtime orchestration.

## Do not use this skill for

- Agent-runtime orchestration, delegation, recovery, or tool-envelope reviews.
  Use `litrev-runtime-boundary-review` instead.
- Humor/readability/dead-code scans.
  Use `cursed-lite-*` instead.
- External repo intake decisions.
  Use `docs/runbooks/external-pattern-intake.md`.

## Review workflow

1. Identify the concrete trust boundary and the owning backend/admin docs.
2. Read the touched files and nearby tests before making claims.
3. Check for:
   - missing or inconsistent auth/authorization enforcement
   - scope or tenant breaks (`ownerId`, `workspaceId`, project access, admin-only guards)
   - unsafe client-controlled identifiers or storage paths
   - weak input validation or schema enforcement at route/action boundaries
   - unsafe file handling, upload assumptions, or service-role misuse
   - missing auditability on admin mutations
   - secret/env misuse without opening `.env` files
   - unsafe network or command execution paths owned by the backend
4. Compare findings against current repo truth so you do not restate an already-fixed or already-tracked issue as new.
5. Report only concrete findings with file evidence or explicitly say no findings were discovered.

## Output contract

Return markdown in this order:

### Security Review: <scope>

#### Findings
- Ordered by severity.
- Each finding must include:
  - severity
  - file reference(s)
  - why the boundary is unsafe or brittle
  - the likely exploit/regression shape
  - the smallest credible remediation direction

#### Open Questions / Assumptions
- Only include unresolved items that materially affect confidence.

#### Promotion Targets
- If a finding keeps recurring, name the right durable home:
  - backend/admin runbook update
  - `plan-backend.md`
  - focused test coverage
  - repo-local lint/governance rule if justified

If no findings are discovered, say so explicitly and note any residual testing or review gaps.

## Guardrails

- Never read or quote `.env`, `.env.*`, credentials, tokens, or private keys.
- Never treat this skill as a merge or deploy gate.
- Never invent an exploit path without file-level evidence.
- Keep findings about code and contracts, not people.
- Prefer the service/action/API boundary actually used in LitRev over generic web-app checklists.

## Final line

End with:

`Advisory only: promote repeated security findings into tests, rules, runbooks, or owner-plan updates.`
