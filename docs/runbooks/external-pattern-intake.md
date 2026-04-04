# External Pattern Intake

This runbook defines how LitRev evaluates and adapts ideas from external repositories, vendor examples, and agent skill packs.

## Purpose

Use this procedure when a repo review, experiment, or outside recommendation suggests "we should use that here."

The goal is to learn quickly without importing unclear ownership, weakly-tested abstractions, or external policy drift into LitRev.

When a current owner doc or retained review artifact depends on a specific upstream GitHub repository, record or refresh that upstream in `OPEN_SOURCE_REFERENCES.md` in the same task.

## Core Rule

External material is reference input, not repo truth.

LitRev only adopts an external pattern after we:

1. verify license and usage posture
2. compare it to current LitRev contracts
3. rewrite it for this stack and naming
4. add tests or executable checks when the idea becomes normative
5. update the actual owner docs for the surface that changed

## Intake Workflow

1. Identify the candidate pattern.
   - Example sources: Factory AI repos, vendor docs, open-source example apps, third-party skill packs.
2. Check legal and operational fit.
   - prefer MIT, Apache-2.0, or similarly clear permissive licensing
   - do not copy source verbatim
   - treat unclear or missing licensing as reference-only until clarified
3. Benchmark against current LitRev truth.
   - read the relevant owner docs first
   - decide whether the repo already has a stronger local contract
   - if LitRev already has the contract, prefer strengthening local enforcement over importing a new abstraction
4. Decide the adoption shape.
   - pattern-only inspiration
   - local rewrite into code/tests
   - advisory internal skill
   - runbook/procedure only
5. Land the adaptation in the right owner.
   - lint/test-governance changes -> `docs/plans/plan-lint-governance.md`
   - backend/auth/admin/upload changes -> `docs/plans/plan-backend.md` and relevant runbooks
   - runtime/tool-boundary changes -> `docs/plans/plan-agentic.md`
   - cross-cutting intentional tradeoffs -> `docs/architecture/decision-log.md`
6. Validate locally before calling the pattern adopted.
   - run the route-required commands from `AGENTS.md`
   - add or update tests if the change affects behavior, trust boundaries, or enforceable contracts

## Factory AI Specific Guidance

Treat Factory AI repos as a useful upstream pattern library in three lanes only:

1. `eslint-plugin`
   - mine rule ideas and packaging patterns
   - rewrite locally under `next-app/eslint/**`
2. `skills` and `factory-plugins`
   - mine skill ergonomics, review flows, and operator checklists
   - keep LitRev-local skills advisory unless they are converted into executable repo rules
3. `examples` and automation repos
   - mine architecture and workflow ideas
   - do not import their operational assumptions as LitRev policy without owner review

## Advisory Skill Rule

Internal skills adapted from external packs must stay advisory unless they are deliberately promoted into executable repo governance.

That means:

- no merge gating
- no deploy gating
- no replacing tests, typecheck, security review, or release gates
- repeated findings must be promoted into one of:
  - a lint rule
  - a test
  - a runbook update
  - an owner-plan update
  - a decision-log entry
  - a concise `repo-health` update

## `cursed-lite` Usage

If the internal `cursed-lite` skills are present in this repo, use them only for:

- readability/searchability smell detection
- dead-code candidate review
- narrative pre-merge risk scanning

They are never evidence on their own. Any repeated useful finding must be converted into normal LitRev engineering controls or docs.
