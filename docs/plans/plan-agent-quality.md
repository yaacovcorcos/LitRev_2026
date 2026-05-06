# Agent Quality Plan

## Authority and Scope

This is the canonical plan for the agent-quality program.

It owns the work required to make LitRev's agent:
- reliable
- secure
- testable
- observable
- rollout-safe
- fast and efficient enough to scale

It owns:
- executable evals and regression harnesses
- rollout and canary discipline
- incident playbooks and SLOs
- agent-specific security hardening
- agent-specific performance and efficiency targets
- open-source benchmark refresh discipline

It does not own:
- runtime product architecture
  - use [`plan-agentic.md`](./plan-agentic.md)
- memory and prompting internals
  - use [`plan-memory.md`](./plan-memory.md)
- broad repo-wide CI naming and execution ergonomics
  - use [`plan-testing-execution.md`](./plan-testing-execution.md)

## Quality Standard

For a product used by millions of scientists, "good enough" is not the bar.

The bar is:
- failures are rare
- failures are honest
- dangerous actions are bounded
- regressions are caught before release
- incidents are debuggable
- the agent is fast enough to stay in flow
- the cost of quality does not become an excuse for lower standards

## Quality Pillars

### 1. Correctness and Regression Resistance

The agent must keep its promises under:
- normal success paths
- empty and weak-result paths
- blocked/clarification paths
- retry and recovery paths
- malformed tool and provider responses

### 2. Security and Trust Boundaries

The agent must never widen authority because:
- the prompt asked for it
- the model suggested it
- a tool description drifted
- a remote MCP server changed shape

### 3. Reliability and Operability

The team must be able to answer:
- what failed
- where it failed
- whether user-visible truth stayed honest
- whether the agent should retry, continue, pause, or stop

### 4. Speed and Efficiency

The agent must be fast enough to feel premium and efficient enough to scale:
- lower unnecessary step counts
- lower context waste
- faster first useful process signal
- faster first visible answer content
- bounded token and tool spend

### 5. Continuous External Benchmarking

LitRev should learn aggressively from the best external systems without drifting into imitation or dependency.

## Current Architecture

- Typed tool-boundary failures already survive provider -> runtime -> UI as structured errors.
- Shared recovery and continuation are materially stronger than before.
- The repo already has:
  - durable testing doctrine in [`docs/agents/testing-agent-contract.md`](../agents/testing-agent-contract.md)
  - shared CI strategy in [`docs/runbooks/testing-ci-strategy.md`](../runbooks/testing-ci-strategy.md)
  - security baseline in [`docs/runbooks/security-baseline.md`](../runbooks/security-baseline.md)
  - performance certification in [`plan-speed-performance.md`](./plan-speed-performance.md)
  - burn-in runbook for shared chat/runtime canaries
- The protected `check` CI gate now includes `npm run check:agent-quality`, a deterministic agent-quality gate that validates the core eval scenario catalog, runtime-signal fixture coverage, and strict U1.6 burn-in metric/threshold contract.
- The remaining agent-quality debt is to broaden this spine into adversarial security packs, richer live eval artifacts, SLO dashboards, incident playbooks, and explicit efficiency budgets.

## Open-Source Position

Primary external references for this plan:
- `continuedev/continue`
- `promptfoo/promptfoo`
- `UKGovernmentBEIS/inspect_ai`
- `openclaw/openclaw`
- `vercel/ai`
- `pydantic/pydantic-ai`
- `vercel-labs/mcp-to-ai-sdk`

Reference artifact:
- [`docs/reviews/2026-04-16-agentic-open-source-benchmark.md`](../reviews/2026-04-16-agentic-open-source-benchmark.md)

The lesson to keep:
- the best systems do not just "have tests"
- they have explicit eval tasks, replayable logs, adversarial checks, canaries, and operational runbooks

## Workstreams

### Workstream Q1 — Eval Spine and Regression Harness

- [x] `Q1-001` Ship the first `CAG-021` executable scenario eval harness.
  - current contract:
    - deterministic scenario catalog validation
    - runtime-observable signal coverage from replayable stream fixtures
    - clear pass/fail criteria through `npm run check:agent-quality`

- [ ] `Q1-002` Broaden deterministic fixture libraries for:
  - stream lifecycle
  - tool success/failure
  - blocked clarification
  - retry/continue/recover
  - malformed provider/tool payloads
  - current regression coverage already includes cancelled terminal truth, terminal `run_end` reconciliation after ownership loss, no-answer failure truth, pending decision requests, phase-drifted pending-decision admission, delegated search traces, OpenAlex receipt traces, idempotency failure/abort release and stale-lease recovery, bounded Crossref enrichment, and interrupted-tool continuation policy coverage

- [ ] `Q1-003` Add adversarial regression coverage for agent-specific trust boundaries.
  - examples:
    - cross-project identifier injection
    - prompt-injection into tool boundaries
    - remote tool shape drift
    - hidden authority widening through tool metadata

### Workstream Q2 — Rollout, Burn-In, and Operational Safety

- [ ] `Q2-001` Ship `CAG-022` staged rollout templates for agent features.
  - each rollout must define:
    - the change
    - the rollback lever
    - the evidence required to promote

- [ ] `Q2-002` Finish `U1.6` burn-in as the runtime sign-off gate on current production truth.
  - outcome:
    - `FIX-011b` closes with evidence, not optimism
  - current support:
    - `npm run check:agent-quality` prevents accidental weakening of the burn-in metric set, surface set, and strict threshold floor before runtime changes merge

- [ ] `Q2-003` Ship `CAG-023` run SLO dashboards and alert thresholds.
  - minimum targets:
    - success rate
    - interruption rate
    - blocked clarification rate
    - no-forward-progress rate
    - average recovery success

- [ ] `Q2-004` Ship `CAG-024` incident playbooks for provider, tool, runtime, and continuation failures.

- [ ] `Q2-005` Ship `CAG-025` recurring architecture-pruning review.
  - outcome:
    - stale tools, stale policies, and stale complexity do not linger forever

### Workstream Q3 — Security and Trust Hardening

- [ ] `Q3-001` Promote the current security baseline into explicit agent release criteria.
  - source:
    - [`docs/runbooks/security-baseline.md`](../runbooks/security-baseline.md)

- [ ] `Q3-002` Define agent-specific secure-tooling rules.
  - required areas:
    - idempotent mutations
    - actor/project-scoped tool validation
    - narrowed MCP wrappers for high-risk external tools
    - explicit service-role and file-read boundaries

- [ ] `Q3-003` Add security regression packs to the agent eval spine, not only to one-off reviews.

### Workstream Q4 — Speed, Efficiency, and Cost Discipline

- [ ] `Q4-001` Define agent-specific performance and efficiency metrics in coordination with [`plan-speed-performance.md`](./plan-speed-performance.md).
  - minimum metrics:
    - first useful process signal
    - first visible assistant content
    - average step count per successful run
    - tool success rate
    - continuation reuse rate
    - token budget burn by mode

- [ ] `Q4-002` Define target budgets for:
  - long-running research tasks
  - search-heavy tasks
  - clarification-heavy tasks
  - degraded and recovery paths

- [ ] `Q4-003` Add efficiency regression review to release confidence so "more capable" does not quietly mean "wasteful."

### Workstream Q5 — Benchmark and Upstream Intake Discipline

- [ ] `Q5-001` Refresh the open-source benchmark when a major upstream meaningfully shifts LitRev-relevant practice.
  - minimum cadence:
    - quarterly
    - or sooner for major runtime/eval/tooling shifts

- [ ] `Q5-002` Promote repeated upstream lessons into local tests, runbooks, and plan updates instead of leaving them in benchmark notes.

## Execution Order

1. Build the eval spine.
2. Close rollout and burn-in discipline.
3. Harden security and trust boundaries.
4. Add speed and efficiency budgets.
5. Keep the benchmark loop alive so the plan does not fossilize.

## Dependencies

- Test design doctrine:
  - [`docs/agents/testing-agent-contract.md`](../agents/testing-agent-contract.md)
- Shared CI and execution model:
  - [`docs/runbooks/testing-ci-strategy.md`](../runbooks/testing-ci-strategy.md)
- Security baseline:
  - [`docs/runbooks/security-baseline.md`](../runbooks/security-baseline.md)
- App-wide speed/performance contract:
  - [`plan-speed-performance.md`](./plan-speed-performance.md)
- Runtime platform owner:
  - [`plan-agentic.md`](./plan-agentic.md)

## Completion Rule

An agent feature is not done because:
- the code path exists
- a happy-path test passed
- a demo looked good once

It is done when:
- the behavior is testable
- the failure modes are explicit
- the rollout path is safe
- the recovery path is honest
- the relevant security boundaries are defended
- the feature is efficient enough to scale without regret
