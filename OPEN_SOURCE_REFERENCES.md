# Open Source References

Last reviewed: 2026-04-05

This file is the active registry of upstream GitHub repositories that current LitRev owner docs or retained review artifacts still cite for direct adaptation or benchmark comparison.

Use this file to answer:
- which upstream repos are still active inputs to LitRev-local planning or governance
- where each upstream is currently used in the repo

Do not use this file as:
- a dump of every external product, website, or paper mentioned anywhere in the repo
- a historical list of previously mirrored local folders
- a policy owner; use `docs/runbooks/external-pattern-intake.md` for adoption procedure and `docs/architecture/decision-log.md` for durable governance decisions

All GitHub URLs below were checked with HTTP `200` on 2026-04-05.

## Active Upstream Repositories

### Agent Runtime and Interaction

| Upstream repo | Current LitRev role | Current owner docs |
|---|---|---|
| [openai/codex](https://github.com/openai/codex) | Interaction and testing-execution reference for structured user-input flows and local test-lane ergonomics | `docs/plans/agent-runtime-remediation/ask-user-v2-design-direction.md`; `docs/plans/plan-testing-execution.md` |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | Testing-execution comparison input for lane taxonomy and changed-scope discipline | `docs/plans/plan-testing-execution.md` |
| [anomalyco/opencode](https://github.com/anomalyco/opencode) | Testing-execution comparison input for CI ownership and artifact discipline | `docs/plans/plan-testing-execution.md` |
| [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | Optional runtime comparison input for pause/resume and explicit state-transition ideas | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` |
| [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) | Optional runtime comparison input for preserving useful intermediate work across interruptions | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` |
| [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) | Optional runtime comparison input for typed tool/result boundaries and structured failures | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` |
| [openai/openai-agents-python](https://github.com/openai/openai-agents-python) | Optional runtime comparison input for tool and handoff ergonomics | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` |
| [letta-ai/letta](https://github.com/letta-ai/letta) | Optional secondary runtime comparison input for workflow/state ideas | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` |
| [mastra-ai/mastra](https://github.com/mastra-ai/mastra) | Optional secondary runtime comparison input for workflow/state ideas | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` |
| [microsoft/autogen](https://github.com/microsoft/autogen) | Optional secondary runtime comparison input for workflow/state ideas | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` |

### UI and Context Capture

| Upstream repo | Current LitRev role | Current owner docs |
|---|---|---|
| [aidenybai/react-grab](https://github.com/aidenybai/react-grab) | Interaction-model inspiration for semantic context capture, target/action contracts, recent history, and anchored follow-up affordances | `docs/plans/plan-context-capture.md` |

### Governance and Tooling

| Upstream repo | Current LitRev role | Current owner docs |
|---|---|---|
| [Factory-AI/eslint-plugin](https://github.com/Factory-AI/eslint-plugin) | Structural benchmark for repo-local lint governance: rule packaging, layered configs, docs/tests discipline, and CI validation shape | `docs/plans/plan-lint-governance.md`; `docs/reviews/2026-03-21-factory-eslint-plugin-benchmark.md`; `docs/runbooks/external-pattern-intake.md` |

## Scope Boundaries

This registry intentionally excludes:
- repos that were only mirrored locally in the past but are no longer cited by current owner docs or retained review artifacts
- external products or documentation sites that are mentioned for product inspiration but are not being tracked as active repository-level adaptation inputs
- vague named systems without a stable repo dependency in current docs unless a current owner doc now relies on that exact upstream

When a current owner doc or retained review artifact starts depending on a specific upstream repository, add or refresh the entry here in the same task.

## Refresh Procedure

Use this check before future cleanup or onboarding updates:

```bash
rg -o 'https://github.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+' OPEN_SOURCE_REFERENCES.md \
  | sort -u \
  | while read -r url; do
      curl -L --max-time 12 -s -o /dev/null -w "%{http_code} %{url_effective}\n" "$url"
    done
```
