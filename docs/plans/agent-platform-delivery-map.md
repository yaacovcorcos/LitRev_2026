# Agent Platform Delivery Map

## Status

This is a supporting execution map, not a new canonical owner.

Use:
- [`plan-agentic.md`](./plan-agentic.md) for runtime architecture, orchestration, tool boundaries, decisioning, and research-agent roadmap
- [`plan-agent-quality.md`](./plan-agent-quality.md) for reliability, evals, rollout, observability, security, and efficiency
- [`plan-memory.md`](./plan-memory.md) for grounding, retrieval, memory, and prompt-library quality
- [`plan-testing-execution.md`](./plan-testing-execution.md) for shared testing entrypoints, CI lane taxonomy, and cross-cutting execution ergonomics

Use this file when the team needs one cross-owner dependency map for:
- what must happen first
- what can run in parallel
- what evidence each slice must produce
- which upstream references should inform each slice

## Purpose

LitRev should become the most trustworthy scientific copilot in its category.
That requires a delivery program with one strict rule:

the agent does not become more autonomous, broader, or more ambitious until it is first more truthful, more testable, more observable, more secure, and more efficient.

This map turns the open agentic backlog into one ordered program for:
- runtime truth
- regression resistance
- rollout safety
- security and authority boundaries
- performance and cost discipline
- research-quality differentiation

## Source Of Truth Inputs

This map is grounded in:
- [`docs/agents/testing-agent-contract.md`](../agents/testing-agent-contract.md)
- [`docs/runbooks/testing-ci-strategy.md`](../runbooks/testing-ci-strategy.md)
- [`docs/runbooks/security-baseline.md`](../runbooks/security-baseline.md)
- [`docs/runbooks/chat-runtime-burn-in.md`](../runbooks/chat-runtime-burn-in.md)
- [`docs/reviews/2026-04-16-agentic-open-source-benchmark.md`](../reviews/2026-04-16-agentic-open-source-benchmark.md)
- [`docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md`](./agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md)
- [`docs/plans/agent-runtime-remediation/ask-user-v2-design-direction.md`](./agent-runtime-remediation/ask-user-v2-design-direction.md)

## Non-Negotiable Program Rules

1. `A-001` closes before `U1.6` resumes as a sign-off lane.
2. Every runtime defect fix ships with the exact regression test for the triggering condition.
3. No autonomy widening ships before tool boundaries and idempotent mutations are explicit.
4. No rollout or benchmark claim counts without replayable evidence.
5. Security fixes must become durable tests or owner-doc rules, not chat memory.
6. Performance and cost are first-class release criteria, not cleanup work.
7. Research quality must stay staged: retrieve -> gather evidence -> rank/filter -> answer.

## Current A-001 Coverage Snapshot

The current `FIX-011b` delta already has partial regression proof in repo:

| Delta area | Current proof | Status |
|---|---|---|
| Cancelled terminal truth parity, including blocked-card dismissal | [`next-app/app/ai/__tests__/page.clarification.test.tsx`](../../next-app/app/ai/__tests__/page.clarification.test.tsx), [`next-app/lib/server/__tests__/run-recovery.test.ts`](../../next-app/lib/server/__tests__/run-recovery.test.ts) | materially covered |
| Long-lineage clarification hydration must use the newest relevant window | [`next-app/lib/server/__tests__/clarification-controller-hydration.test.ts`](../../next-app/lib/server/__tests__/clarification-controller-hydration.test.ts) | covered |
| Post-answer auxiliary work must stay degrade-only | [`next-app/lib/server/__tests__/ai-service-run-finalization.test.ts`](../../next-app/lib/server/__tests__/ai-service-run-finalization.test.ts) | covered |
| Stale-writer exclusion after replace/cancel and ownership loss | shared write-helper coverage is still weaker than needed | active gap |

That means the first runtime slice should not be a broad rewrite.
It should lock the stale-writer/ownership boundary first, then rerun the existing delta pack.

## Dependency Rules

### Rule 1: Runtime truth before sign-off

`A-001` -> `Q2-002` (`U1.6`) -> `A-002`

Do not reopen legacy cleanup before the shared runtime is proven under current truth.

### Rule 2: Eval spine starts early, but sign-off uses real runtime proof

`Q1-002` should begin alongside `A-001` because deterministic fixtures improve fix velocity.
`Q1-001` becomes authoritative only after the runtime delta is represented in executable scenario packs.

### Rule 3: Tool safety before autonomy widening

`B-001` -> `B-003` -> `B-004`

Idempotency envelopes and narrowed tool contracts must exist before the delegation matrix or portfolio expansion becomes a serious product surface.

### Rule 4: Structured parts before prompt cleanup closeout

`C-003` -> `K3-002`

The hidden `MENTIONED_STUDIES` prompt contract can only retire once structured message parts are canonical.

### Rule 5: Decision memory unification before overlap cleanup

`K2-001` -> `K2-002` / `K2-003` -> `K2-004`

Do not try to resolve summary-vs-memory overlap before one decision-grade schema exists.

### Rule 6: Context efficiency before large task-graph ambition

`D-001` + `D-003` -> `D-004`

Dependency-aware task graphs are much safer once context loading and budget policy are already explicit.

### Rule 7: Security and observability are release gates, not side programs

`Q3-*` and `Q2-003` / `Q2-004` must gate any major expansion of tools, delegation, or multi-step execution.

## Wave Plan

### Wave 0 - Runtime Closeout And Regression Foundation

Goal:
- make the shared runtime trustworthy under interruption, replacement, cancellation, and post-answer cleanup

| Item | Owner | Depends on | Must prove | Primary evidence |
|---|---|---|---|---|
| `A-001` close `FIX-011b` | `plan-agentic.md` | none | stale writers cannot persist truth after ownership loss; cancelled truth converges; clarification hydration stays newest-window correct; auxiliary work is degrade-only | targeted Vitest regression pack plus updated runtime contract docs |
| `Q1-002` deterministic fixture libraries | `plan-agent-quality.md` | none | stream lifecycle, tool success/failure, blocked clarification, retry/recover, malformed payloads can be replayed deterministically | fixture library and scenario helpers in runtime tests |
| testing taxonomy task 1 | `plan-testing-execution.md` | none | shared test lanes become easier to run without adding a second truth source | explicit script or wrapper decision |
| testing taxonomy task 2 | `plan-testing-execution.md` | none | stable shared naming for unit/integration/e2e/governance surfaces | `next-app/package.json` taxonomy update |

Upstream inputs:
- `openclaw/openclaw`
- `langchain-ai/langgraph`
- `vercel/ai`
- `pydantic/pydantic-ai`

### Wave 1 - Runtime Sign-Off And Legacy Retirement

Goal:
- prove the runtime under canary conditions, then remove remaining drift magnets

| Item | Owner | Depends on | Must prove | Primary evidence |
|---|---|---|---|---|
| `Q1-001` executable scenario eval harness | `plan-agent-quality.md` | `Q1-002`, enough of `A-001` to encode real scenarios | deterministic scenario packs with replayable artifacts and pass/fail rules | executable eval runner plus retained artifacts |
| `Q2-002` finish `U1.6` burn-in | `plan-agent-quality.md` | `A-001` | runtime sign-off is based on evidence, not optimism | [`chat-runtime-burn-in.md`](../runbooks/chat-runtime-burn-in.md) evidence window |
| `A-002` complete `U4` cleanup | `plan-agentic.md` | `Q2-002` | no duplicate runtime paths or legacy drift branches remain | code deletion plus parity tests |

Upstream inputs:
- `openclaw/openclaw`
- `inspect_ai`
- `promptfoo/promptfoo`

### Wave 2 - Durable Execution, Tool Boundaries, And Release Safety

Goal:
- make long-running work, retries, tool mutations, and release operations safe enough to scale

| Item | Owner | Depends on | Must prove | Primary evidence |
|---|---|---|---|---|
| `A-003` crash-safe long-loop continuation | `plan-agentic.md` | `A-001` | long work can pause, recover, or stop honestly without fake progress | continuation and no-forward-progress tests |
| `B-001` idempotency envelopes | `plan-agentic.md` | `A-001` | mutating retries are safe and duplicate side effects are bounded | tool boundary tests |
| `B-002` narrow `general` mode | `plan-agentic.md` | `B-001` recommended | `general` coordinates rather than acting as a superuser | routing/tool-access tests |
| `B-003` delegation policy matrix | `plan-agentic.md` | `B-001`, `B-002` | ask/suggest/auto-apply/delegate rules are explicit by mode and risk | policy tests + docs |
| `B-004` tool telemetry and pruning | `plan-agentic.md` | `B-001`, `B-003` | unused/confusing tools can be retired with evidence | telemetry review and pruning rules |
| `Q2-001` staged rollout templates | `plan-agent-quality.md` | `Q1-001` | every agent feature defines change, rollback lever, and promotion evidence | rollout templates in docs/runbooks |
| `Q2-003` run SLO dashboards | `plan-agent-quality.md` | `A-001`, `Q1-001` | run success, interruption, blocked, no-forward-progress, and recovery rates are measurable | telemetry dashboards and thresholds |
| `Q2-004` incident playbooks | `plan-agent-quality.md` | `Q2-003` recommended | provider/tool/runtime/continuation failures are triageable | runbooks |
| `Q2-005` recurring architecture pruning | `plan-agent-quality.md` | none | stale tools and stale complexity are reviewed on a schedule | recurring review cadence |
| `Q3-001` security baseline as release criteria | `plan-agent-quality.md` | none | agent release gating includes explicit security checks | release criteria doc update |
| `Q3-002` secure-tooling rules | `plan-agent-quality.md` | `B-001` | idempotent mutations, scoped tools, narrowed MCP wrappers, and file/service-role boundaries are explicit | tool governance tests + docs |
| `Q3-003` security regression packs | `plan-agent-quality.md` | `Q1-001`, `Q3-002` | adversarial cases are part of evals, not one-off reviews | adversarial scenario pack |

Upstream inputs:
- `vercel-labs/mcp-to-ai-sdk`
- `openai/openai-agents-python`
- `pydantic/pydantic-ai`
- `continuedev/continue`

### Wave 3 - User Decisioning, Structured Output, And Memory Coherence

Goal:
- make high-impact user decisions durable, legible, and reusable without prompt hacks

| Item | Owner | Depends on | Must prove | Primary evidence |
|---|---|---|---|---|
| `C-001` `ask_user` decision system | `plan-agentic.md` | `A-001` | blocking decisions become structured, bounded, and reusable | contract tests + UI parity |
| `C-002` run board | `plan-agentic.md` | `A-001`, `Q2-003` recommended | users can see tasks, blockers, and clarifications honestly | UI/runtime parity tests |
| `C-003` structured message parts | `plan-agentic.md` | `A-001` | visible text and structured payloads replace hidden markup contracts | renderer/runtime tests |
| `C-004` optional reasoning transparency | `plan-agentic.md` | `C-003` recommended | `off` / `summary` / `full` stay honest across providers | provider/surface contract tests |
| `K2-001` unify decision-memory schema | `plan-memory.md` | `C-001` recommended | one decision-grade memory contract exists | extraction/schema tests |
| `K2-002` negative-memory extraction | `plan-memory.md` | `K2-001` | rejected directions become retrievable without pretending they were accepted | memory regression tests |
| `K2-003` improve implicit-decision extraction | `plan-memory.md` | `K2-001` | implied vs stated vs rejected decisions are distinguishable | extraction evals |
| `K2-004` resolve summary-vs-memory overlap | `plan-memory.md` | `K2-001` through `K2-003` | summaries explain context while memory stores durable facts | overlap regression pack |
| `K3-001` visible-answer hygiene | `plan-memory.md` | `C-003` recommended | grounded prose stays clean under runtime-led transparency | answer-quality tests |
| `K3-002` retire hidden `MENTIONED_STUDIES` contract | `plan-memory.md` | `C-003` | hidden metadata is no longer required for cited-study rendering | prompt/runtime/renderer proof |
| `K3-003` stronger prompt-pack contracts | `plan-memory.md` | `K3-001` | high-value retrieval and explanation modes use explicit prompt contracts | prompt-pack tests |

Upstream inputs:
- `openai/codex`
- `anomalyco/opencode`
- `openai/openai-agents-python`

### Wave 4 - Research Intelligence, Efficiency, And Benchmark Discipline

Goal:
- make LitRev materially better at scientific work while keeping it fast and affordable at scale

| Item | Owner | Depends on | Must prove | Primary evidence |
|---|---|---|---|---|
| `D-001` lazy context loading | `plan-agentic.md` | `A-001`, `Q4-001` recommended | context waste drops without harming correctness | latency and token evidence |
| `D-002` structured query planning | `plan-agentic.md` | `K1-002`, `K1-003` recommended | search decomposition improves and weak redundant searches fall | retrieval eval pack |
| `D-003` centralized context budget policy | `plan-agentic.md` | `Q4-001` | context usage becomes explicit and measurable | budget policy tests |
| `D-004` dependency-aware `AgentTask` graph | `plan-agentic.md` | `D-001`, `D-003`, `B-003` | multi-step work becomes explicit rather than ad hoc narration | task-graph tests + run board integration |
| `K1-001` pgvector rollout validation | `plan-memory.md` | none | every active environment is known-good or known-bad for retrieval stack | rollout report |
| `K1-002` retrieval guidance with Boolean/MeSH/query rewrite | `plan-memory.md` | `K1-001` recommended | search mode finds better evidence | retrieval evals |
| `K1-003` staged evidence-use contract | `plan-memory.md` | `K1-001` | answer generation is staged and reviewable | answer/evidence contract tests |
| `Q4-001` agent performance metrics | `plan-agent-quality.md` | `A-001` | first useful signal, first visible content, step count, tool success, continuation reuse, and token burn are measurable | metrics contract |
| `Q4-002` target budgets by task class | `plan-agent-quality.md` | `Q4-001` | task classes have explicit latency/cost budgets | budget tables and checks |
| `Q4-003` efficiency regression review | `plan-agent-quality.md` | `Q4-001`, `Q4-002` | capability gains cannot quietly become waste | release review evidence |
| `Q5-001` benchmark refresh cadence | `plan-agent-quality.md` | none | upstream benchmark remains live | quarterly or event-driven refresh |
| `Q5-002` promote upstream lessons into local owners | `plan-agent-quality.md` | `Q5-001` | upstream learning becomes tests, runbooks, and plan updates | owner-doc updates |

Upstream inputs:
- `Future-House/paper-qa`
- `asreview/asreview`
- `AkariAsai/OpenScholar`
- `stanford-oval/storm`
- `Future-House/aviary`
- `inspect_ai`

## Best Parallelization Strategy

Parallelize only when the work does not block the next local decision:

- in parallel with `A-001`
  - `Q1-002`
  - testing taxonomy cleanup
- in parallel after `A-001` is stable
  - `Q1-001`
  - `Q3-001`
  - `Q4-001`
- in parallel after tool boundaries harden
  - `B-004`
  - `Q2-005`
  - `Q5-001`
- in parallel after decision contracts stabilize
  - `K2-*`
  - `K3-*`

Do not parallelize:
- `A-001` with `U1.6`
- `C-003` after `K3-002`
- `D-004` before context-budget policy and delegation rules exist

## Definition Of Done For The Program

The agent platform is not "done" when:
- the happy path works
- demos look impressive
- the model appears more autonomous

It is only done when:
- runtime truth is explicit and shared across surfaces
- regressions are caught by deterministic tests and scenario evals
- dangerous actions are bounded by real server-side authority
- failures are observable and triageable
- rollout and rollback are disciplined
- performance and cost are measurable and defended
- literature-quality behavior is staged, cited, and reviewable

## Immediate Next Slice

Start here:

1. add the missing stale-writer exclusion regression coverage for `A-001`
2. tighten the shared write helpers so ownership loss fails closed
3. rerun the existing `A-001` delta tests
4. only then reopen `U1.6` as a sign-off question
