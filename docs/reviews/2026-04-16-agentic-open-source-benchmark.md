# Agentic Open-Source Benchmark

Review date: 2026-04-16
Reviewer: Codex

## Scope and Status

This is a retained dated benchmark snapshot for agent runtime, evaluation, and literature-synthesis upstreams that can inform LitRev's open agentic work.

It does not change canonical plan priority by itself. It is a benchmark input for:
- `docs/plans/plan-agentic.md`
- `docs/plans/plan-agent-quality.md`
- `docs/plans/plan-testing-execution.md`
- `docs/plans/plan-memory.md`
- later ledger and retrieval work once ideas are rewritten into LitRev-local contracts

Method:
- primary sources only
- official GitHub repositories, official docs, and official vendor docs/blogs where relevant
- current as of 2026-04-16

## Review-Time Conclusion

The strongest open-source agents are not winning because they are "more autonomous." They are winning because they make the risky parts explicit:
- loop control
- approval and blocked state
- sandbox boundaries
- typed tool and error surfaces
- replayable logs and evals
- bounded subagent contracts

The highest-value net-new benchmark inputs for LitRev are:
- [vercel/ai](https://github.com/vercel/ai)
- [continuedev/continue](https://github.com/continuedev/continue)
- [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo)
- [UKGovernmentBEIS/inspect_ai](https://github.com/UKGovernmentBEIS/inspect_ai)
- [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents)
- [Future-House/paper-qa](https://github.com/Future-House/paper-qa)
- [Future-House/aviary](https://github.com/Future-House/aviary)

The most important refreshed conclusions from already-known upstreams are:
- [openclaw/openclaw](https://github.com/openclaw/openclaw) is now much more operationally useful as a runtime reference because its queueing, failover, onboarding, diagnostics, and QA surfaces are documented in detail.
- [anomalyco/opencode](https://github.com/anomalyco/opencode) is now a stronger reference for plan-vs-build separation, repo-local agent guidance, and project/session boundaries than it was in earlier passes.
- [openai/codex](https://github.com/openai/codex) remains one of the best references for structured operator instructions, request-user-input semantics, and execution-policy framing, even when its deeper product details now live mostly in official Codex docs.

The broad lesson for LitRev is simple:
- do not chase flashy multi-agent theatrics first
- do build a runtime that is typed, inspectable, interruptible, replayable, and testable

## Priority Benchmark Set

### Runtime Reliability and Control Plane

| Upstream | Why it matters now | Best reusable ideas | LitRev mapping | License posture |
|---|---|---|---|---|
| [openai/codex](https://github.com/openai/codex) | Mature operating model for repo instructions, execution policy, structured user-input, and skills | hierarchical `AGENTS.md` handling, explicit exec-policy framing, request-user-input lifecycle, skills as reusable workflow memory | `CAG-014`, `CAG-019`, `CAG-026`, testing ergonomics | Apache-2.0 |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | Best current open reference for operational agent runtime discipline | onboarding + `doctor`, lane-aware per-session queueing, explicit multi-agent isolation, auth-profile rotation, model failover, QA lab, transport-real smoke lanes | `FIX-011b`, `U1.6`, `U4`, `CAG-014`, `CAG-020`, `CAG-023`, `CAG-024` | MIT |
| [anomalyco/opencode](https://github.com/anomalyco/opencode) | Strong coding-agent reference for capability partitioning without overcomplicating the surface | `build` vs `plan` agent split, read-only planning mode, `general` subagent, project/session API shape, repo-local agent prompts | `CAG-013`, `CAG-014`, `CAG-016`, `CAG-010` | MIT |
| [vercel/ai](https://github.com/vercel/ai) plus [AI SDK 6](https://vercel.com/blog/ai-sdk-6) | Strongest TypeScript-first reference for modern agent loops | `stopWhen`, `prepareStep`, subagents, tool approval, structured stream errors, mock providers, testing helpers, MCP support | `CAG-020`, `CAG-014`, `CAG-021`, `CAG-026`, `FIX-011b` hardening | source available repo license; use as reference input only |
| [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template) | Useful operational reference for branch-owning coding agents | sandbox-backed task execution, timeout and keep-alive policy, branch lifecycle, isolated execution surface | `CAG-022`, `CAG-023`, rollout/ops discipline | source available repo license |
| [vercel-labs/mcp-to-ai-sdk](https://github.com/vercel-labs/mcp-to-ai-sdk) | Best current reference for narrowing MCP tool surfaces safely | generate local wrappers around remote MCP tools, pin tool contracts, reduce prompt-injection and tool-drift risk, narrow arguments locally | `CAG-004`, `CAG-015`, `CAG-026` | Apache-2.0 |
| [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | Still the clearest reference for durable long-running stateful execution | checkpointed durable execution, interrupts, human-in-the-loop state edits, memory, traceable state transitions | `FIX-011b`, `U1.6`, `CAG-020`, `CAG-021` | MIT |
| [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) | New high-signal harness for planning + filesystem + delegated work | built-in planning tool, file tools, subagent delegation, ready agent harness on top of LangGraph | `CAG-014`, `CAG-016`, `CAG-019` | MIT |
| [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) | Best typed-runtime reference in the set | typed deps and outputs, validation-driven retries, durable execution, MCP capability integration, OTel-friendly observability, eval hooks | `CAG-004`, `CAG-021`, `CAG-023`, `CAG-024` | MIT |
| [openai/openai-agents-python](https://github.com/openai/openai-agents-python) | Strong reference for handoffs and guarded multi-agent workflows | handoffs, sessions, guardrails, tracing, human-in-the-loop primitives | `CAG-014`, `CAG-019`, `CAG-021` | MIT |

### Secondary Still Worth Tracking

- [aaif-goose/goose](https://github.com/aaif-goose/goose): useful reference for packaging one agent across desktop, CLI, and API surfaces while staying provider-agnostic and MCP-extensible.
- [coder/agentapi](https://github.com/coder/agentapi): useful adapter reference when LitRev needs to compare or orchestrate external coding agents through one control surface; not a primary runtime model for LitRev itself.
- [huggingface/smolagents](https://github.com/huggingface/smolagents): useful reference for explicit code-agent versus tool-calling-agent separation and for its blunt warning that local code executors are not security boundaries.

### Evaluation, Testing, and Release Confidence

| Upstream | Why it matters now | Best reusable ideas | LitRev mapping | License posture |
|---|---|---|---|---|
| [continuedev/continue](https://github.com/continuedev/continue) | Best current reference for repo-native AI checks in normal Git workflows | source-controlled markdown checks, PR status integration, check surfaces that live with the repo rather than a hosted black box | `docs/plans/plan-testing-execution.md`, `CAG-021`, rollout confidence | Apache-2.0 |
| [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) | Strongest lightweight eval and adversarial-testing reference | declarative eval configs, CI/CD integration, regression comparison, red-teaming and vulnerability scanning | `CAG-021`, `CAG-022`, `CAG-024` | MIT |
| [UKGovernmentBEIS/inspect_ai](https://github.com/UKGovernmentBEIS/inspect_ai) | Best general eval harness in the set for agentic behavior | tasks, datasets, solvers, agents, scorers, sandboxes, replayable logs, per-sample transcripts, model-graded scoring, agent bridge | `CAG-021`, `CAG-023`, `CAG-024`, research-agent benchmarking | MIT |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | Worth carrying into the eval layer too | markdown QA scenarios, transport-real smoke lanes, parallel worker execution, character-eval reports, operator-facing QA lab | `U1.6`, canary discipline, live-runtime validation | MIT |
| [vercel/ai](https://github.com/vercel/ai) | Strong low-level testability reference for TypeScript agent surfaces | mock models, readable-stream simulation, explicit stream abort/error handling | `CAG-021`, `FIX-011b` regression coverage | source available repo license; use as reference input only |
| [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) | Strong reference for integrated observability + evals | eval hooks tied to tracing and cost/behavior monitoring | `CAG-021`, `CAG-023` | MIT |

### Literature and Research Workflow Quality

| Upstream | Why it matters now | Best reusable ideas | LitRev mapping | License posture |
|---|---|---|---|---|
| [Future-House/paper-qa](https://github.com/Future-House/paper-qa) | Strongest open literature-QA implementation in the set | staged `search -> gather evidence -> answer`, citation-grounded answers, metadata-aware retrieval, explicit `evidence_k` and `answer_max_sources`, fake deterministic path when a full agent is not needed | future retrieval/research work, `CAG-008b`, prompt grounding | Apache-2.0 |
| [asreview/asreview](https://github.com/asreview/asreview) | Best screening-workflow reference already in the repo ecosystem | active-learning prioritization, saved labeling decisions, duplicate discipline, simulation toolkit, explicit reviewer workflow | ledger and screening UX, dataset/eval design | Apache-2.0 |
| [AkariAsai/OpenScholar](https://github.com/AkariAsai/OpenScholar) | Useful reference for retrieval plus citation-aware answer shaping | offline retrieval + external APIs, posthoc citation attribution, `top_n` passage caps, `max_per_paper`, `min_citation` filtering | retrieval policy and answer-grounding design | Apache-2.0 |
| [stanford-oval/storm](https://github.com/stanford-oval/storm) | Best knowledge-curation reference for staged long-form synthesis | separate research and writing phases, outline-before-draft, simulated conversation for better question generation, collaborative moderator/human patterns, mind-map abstraction | long-form research assistance, clarification and report-assembly design | MIT |
| [Future-House/aviary](https://github.com/Future-House/aviary) | Most relevant benchmark harness for scientific agent tasks | environment-based agent evaluation, tool-based language-decision processes, scientific-task environments, LitQA lineage | `CAG-021`, research-agent benchmarking | Apache-2.0 |

## What LitRev Should Steal First

### 1. Typed runtime state should own blocked, retry, continuation, and approval truth

The most reliable upstreams do not leave these concerns floating in prompts or UI-only heuristics.

LitRev should keep pushing toward:
- typed blocked-request state
- typed continuation checkpoints
- typed retry/failover summaries
- typed tool-result and tool-error envelopes

Primary references:
- OpenClaw queue + failover docs
- LangGraph durable execution
- Vercel AI loop control and error handling
- Pydantic AI validation and durable execution

Best fit:
- `FIX-011b`
- `U1.6`
- `CAG-004`
- `CAG-020`
- `CAG-026`

### 2. Subagents should be bounded isolates, not free-form autonomy

The strongest subagent patterns isolate:
- context windows
- tool access
- return shape
- cancellation behavior

LitRev should prefer:
- task-specific subagents with explicit ownership
- summarized return contracts
- bounded use for context offloading or parallel research only

Primary references:
- Vercel subagents
- DeepAgents
- Codex delegation/request patterns
- OpenClaw multi-agent isolation

Best fit:
- `CAG-014`
- `CAG-016`
- `CAG-019`

### 3. Evals need to be a product surface, not a last-mile patch

The highest-quality systems treat evals as normal engineering infrastructure:
- deterministic unit tests
- transcripted scenario runs
- adversarial or red-team evals
- live canary and burn-in evidence

LitRev should combine:
- Vercel-style deterministic mock-stream tests
- Inspect-style scenario/task/eval logs
- Promptfoo-style adversarial and CI evals
- Continue-style source-controlled repo checks
- OpenClaw-style richer QA lab and canary scenarios

Best fit:
- `CAG-021`
- `CAG-022`
- `CAG-023`
- `CAG-024`
- `docs/plans/plan-testing-execution.md`

### 4. Tool and MCP boundaries should be narrowed locally

Remote tool catalogs drift. Good systems increasingly treat that as a security and quality risk.

LitRev should prefer:
- local wrappers around high-risk remote tools
- explicit allowlists and narrowed argument shapes
- idempotency envelopes for mutating calls
- stable result and error schemas

Primary references:
- `mcp-to-ai-sdk`
- Pydantic AI tool validation
- OpenAI Agents guardrails

Best fit:
- `CAG-004`
- `CAG-015`
- `CAG-026`

### 5. Research answers should be staged, cited, and reviewable

The strongest literature systems do not treat "answer generation" as one step. They stage:
- search
- evidence gathering
- ranking or filtering
- answer generation
- citation or attribution

LitRev should preserve that shape whenever research quality matters.

Primary references:
- PaperQA
- ASReview
- OpenScholar
- STORM
- Aviary

Best fit:
- future retrieval and ledger work
- `CAG-008b`
- prompt and grounding work

## What LitRev Should Not Copy

- Do not copy "trust the LLM" security posture. Some otherwise useful projects still push risk down to tool or sandbox configuration without enough product-level constraint. Borrow patterns, not the trust model.
- Do not use direct TUI scraping adapters as the primary runtime contract. [coder/agentapi](https://github.com/coder/agentapi) is useful as an adapter idea, not as the main architecture for LitRev.
- Do not copy repo code from AGPL or unclear-license projects into LitRev. Treat them as reference-only until license posture is acceptable and the idea is rewritten locally.
- Do not make multi-agent "lab conversation" the baseline product shape. Several research repos are interesting, but many are still prototype-heavy and operationally weak compared with the stronger runtime and eval references above.
- Do not treat browser-heavy or desktop-heavy coding-agent flows as the default LitRev architecture. Borrow their queueing, approval, sandbox, and replay ideas; not their whole product shape.

## Suggested LitRev Follow-Up Order

1. Build the eval spine first.
   - Focus on `CAG-021` and `docs/plans/plan-testing-execution.md`.
   - Use Inspect + Promptfoo + Continue as the main external benchmark trio.

2. Close runtime durability next.
   - Focus on `FIX-011b`, `U1.6`, and `CAG-020`.
   - Use OpenClaw + LangGraph + Vercel AI as the main runtime-control trio.

3. Harden tool boundaries before widening autonomy.
   - Focus on `CAG-004`, `CAG-015`, and `CAG-026`.
   - Use `mcp-to-ai-sdk` + Pydantic AI + OpenAI Agents as the main typed-boundary trio.

4. Only then expand delegation and task graph sophistication.
   - Focus on `CAG-014`, `CAG-016`, and `CAG-019`.
   - Use Codex + DeepAgents + OpenClaw/Vercel subagent patterns.

5. After the runtime base is stable, deepen research quality.
   - Use PaperQA + ASReview + OpenScholar + STORM + Aviary.

## Current Canonical Owners

For current LitRev truth, use:
- `docs/plans/plan-agentic.md`
- `docs/plans/plan-agent-quality.md`
- `docs/plans/plan-testing-execution.md`
- `docs/plans/plan-memory.md`

This review file is a retained benchmark artifact only. It should inform future LitRev-local code, tests, runbooks, and plan updates, but it is not policy by itself.
