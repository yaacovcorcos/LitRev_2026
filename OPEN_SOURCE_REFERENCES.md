# Open Source References

Last reviewed: 2026-04-16

This file is the active registry of upstream GitHub repositories that current LitRev owner docs or retained review artifacts still cite for direct adaptation or benchmark comparison.

Use this file to answer:
- which upstream repos are still active inputs to LitRev-local planning or governance
- where each upstream is currently used in the repo

Do not use this file as:
- a dump of every external product, website, or paper mentioned anywhere in the repo
- a historical list of previously mirrored local folders
- a policy owner; use `docs/runbooks/external-pattern-intake.md` for adoption procedure and `docs/architecture/decision-log.md` for durable governance decisions

All GitHub URLs below were checked with HTTP `200` on 2026-04-16.

## Active Upstream Repositories

### Agent Runtime and Interaction

| Upstream repo | Current LitRev role | Current owner docs |
|---|---|---|
| [openai/codex](https://github.com/openai/codex) | Interaction and testing-execution reference for structured user-input flows, local test-lane ergonomics, and reusable skill/request patterns | `docs/plans/agent-runtime-remediation/ask-user-v2-design-direction.md`; `docs/plans/plan-testing-execution.md`; `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) | Runtime and testing-execution comparison input for queueing, failover, QA-lab discipline, lane taxonomy, and changed-scope execution | `docs/plans/plan-testing-execution.md`; `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [anomalyco/opencode](https://github.com/anomalyco/opencode) | Runtime and testing-execution comparison input for plan-versus-build separation, session boundaries, CI ownership, and artifact discipline | `docs/plans/plan-testing-execution.md`; `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | Optional runtime comparison input for pause/resume, durable execution, and explicit state-transition ideas | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md`; `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) | Optional runtime comparison input for preserving useful intermediate work across interruptions | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` |
| [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) | Optional runtime comparison input for typed tool/result boundaries, structured failures, and durable execution posture | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md`; `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [openai/openai-agents-python](https://github.com/openai/openai-agents-python) | Optional runtime comparison input for tool and handoff ergonomics, guardrails, and traceable sessions | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md`; `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [letta-ai/letta](https://github.com/letta-ai/letta) | Optional secondary runtime comparison input for workflow/state ideas | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` |
| [mastra-ai/mastra](https://github.com/mastra-ai/mastra) | Optional secondary runtime comparison input for workflow/state ideas | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` |
| [microsoft/autogen](https://github.com/microsoft/autogen) | Optional secondary runtime comparison input for workflow/state ideas | `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` |
| [vercel/ai](https://github.com/vercel/ai) | TypeScript runtime comparison input for loop control, subagents, tool approval, structured error streams, and deterministic mock/test helpers | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template) | Operational comparison input for sandbox-backed coding-agent execution, task timeouts, keep-alive policy, and branch lifecycle management | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [vercel-labs/mcp-to-ai-sdk](https://github.com/vercel-labs/mcp-to-ai-sdk) | Tool-boundary comparison input for generating narrowed local wrappers around remote MCP tools to reduce drift and prompt-injection risk | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) | Agent-harness comparison input for built-in planning tools, filesystem context surfaces, and isolated subagent delegation | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [aaif-goose/goose](https://github.com/aaif-goose/goose) | Extensible agent-platform comparison input for CLI/desktop/API surfaces and MCP-based extension packaging | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [coder/agentapi](https://github.com/coder/agentapi) | Adapter comparison input for normalizing heterogeneous coding-agent surfaces behind one API without adopting any single vendor runtime | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [huggingface/smolagents](https://github.com/huggingface/smolagents) | Reference input for code-agent versus tool-calling-agent separation and explicit sandbox posture around generated code execution | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |

### UI and Context Capture

| Upstream repo | Current LitRev role | Current owner docs |
|---|---|---|
| [aidenybai/react-grab](https://github.com/aidenybai/react-grab) | Interaction-model inspiration for semantic context capture, target/action contracts, recent history, and anchored follow-up affordances | `docs/plans/plan-context-capture.md` |

### Drafting and Scientific Authoring

| Upstream repo | Current LitRev role | Current owner docs |
|---|---|---|
| [TypeCellOS/BlockNote](https://github.com/TypeCellOS/BlockNote) | Block-editor interaction benchmark for slash menus, block-side actions, comments, and customizable editor UX | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [umodoc/editor](https://github.com/umodoc/editor) | Tiptap-based document-editor benchmark for pagination, Word-like writing ergonomics, comments, and collaboration patterns | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [fiduswriter/fiduswriter](https://github.com/fiduswriter/fiduswriter) | Academic-writing benchmark for cross-references, tracked changes, offline merge behavior, and scholarly editor expectations | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [stencila/stencila](https://github.com/stencila/stencila) | Scholarly document-schema benchmark for citations, tables, figures, suggestions, provenance, and canonical format conversion | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [quarto-dev/quarto-cli](https://github.com/quarto-dev/quarto-cli) | Manuscript/citation/export benchmark for cross-references, scientific objects, and multi-format publishing expectations | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [jupyter-book/mystmd](https://github.com/jupyter-book/mystmd) | Scientific markdown and cross-reference benchmark for authoring/publishing semantics | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [typst/typst](https://github.com/typst/typst) | Typesetting and reference-quality benchmark for bibliography, figure/table referencing, and final-output ambition | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [citation-style-language/styles](https://github.com/citation-style-language/styles) | Citation-style breadth benchmark for CSL-compatible journal/profile rendering and style-distribution expectations | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js) | Semantic DOCX intake benchmark for headings, lists, tables, images, notes, comments, and honest import downgrade handling | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [toeverything/blocksuite](https://github.com/toeverything/blocksuite) | Headless collaborative editor benchmark for CRDT-first architecture and editor component composition | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [toeverything/AFFiNE](https://github.com/toeverything/AFFiNE) | Local-first document/workspace benchmark for linked-block and editor-surface patterns | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) | Block/tree editor and local-first collaboration benchmark for editor architecture and data-structure tradeoffs | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |
| [outline/outline](https://github.com/outline/outline) | Product benchmark for comments, revision history, find/replace, calm editor UX, and large-document performance discipline | `docs/plans/plan-drafting-experience.md`; `docs/plans/plan-draft-authoring-platform.md` |

### Evidence Synthesis and Ledger

| Upstream repo | Current LitRev role | Current owner docs |
|---|---|---|
| [asreview/asreview](https://github.com/asreview/asreview) | Screening-workflow comparison input for explicit decision states, progress framing, and reviewer-oriented evidence triage patterns | `docs/plans/plan-ledger.md` |
| [asreview/asreview-datatools](https://github.com/asreview/asreview-datatools) | Evidence-ingest comparison input for dedupe discipline, import normalization, and snowballing-style expansion utilities | `docs/plans/plan-ledger.md` |
| [IEBH/SRA2](https://github.com/IEBH/SRA2) | Workflow-separation comparison input for staged evidence-synthesis modules such as search, dedupe, screening, and full-text review | `docs/plans/plan-ledger.md` |
| [mjwestgate/revtools](https://github.com/mjwestgate/revtools) | Ledger-UX comparison input for modular duplicate review and title/abstract screening surfaces | `docs/plans/plan-ledger.md` |
| [aurumz-rgb/ReviewAid](https://github.com/aurumz-rgb/ReviewAid) | Extraction-review comparison input for schema-driven outputs, review dashboards, and confidence-aware evidence extraction UX | `docs/plans/plan-ledger.md` |
| [extralit/extralit](https://github.com/extralit/extralit) | Extraction-pipeline comparison input for validation, human-in-the-loop extraction review, and structured evidence outputs | `docs/plans/plan-ledger.md` |
| [ijmarshall/robotreviewer](https://github.com/ijmarshall/robotreviewer) | Bounded PDF-analysis comparison input for constrained evidence summaries and reviewable automation output shape | `docs/plans/plan-ledger.md` |
| [matheus-rech/clinical-extraction-system](https://github.com/matheus-rech/clinical-extraction-system) | Provenance comparison input for annotation, source-linking, and audit-trail treatment of extracted evidence | `docs/plans/plan-ledger.md` |
| [nealhaddaway/CitationChaser](https://github.com/nealhaddaway/CitationChaser) | Evidence-expansion comparison input for forward/backward citation chasing workflows | `docs/plans/plan-ledger.md` |
| [Future-House/paper-qa](https://github.com/Future-House/paper-qa) | Research-answer benchmark input for staged search/evidence/answer flows, citation-grounded responses, and explicit evidence/source budgeting | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [Future-House/aviary](https://github.com/Future-House/aviary) | Scientific-agent benchmark input for environment-based evaluation and LitQA-style task harnessing | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [AkariAsai/OpenScholar](https://github.com/AkariAsai/OpenScholar) | Retrieval-and-attribution comparison input for passage caps, citation-aware answer generation, and paper-quality filters | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [stanford-oval/storm](https://github.com/stanford-oval/storm) | Knowledge-curation comparison input for staged research-versus-writing flows, outline generation, and collaborative report synthesis | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |

### Governance and Tooling

| Upstream repo | Current LitRev role | Current owner docs |
|---|---|---|
| [Factory-AI/eslint-plugin](https://github.com/Factory-AI/eslint-plugin) | Structural benchmark for repo-local lint governance: rule packaging, layered configs, docs/tests discipline, and CI validation shape | `docs/plans/plan-lint-governance.md`; `docs/reviews/2026-03-21-factory-eslint-plugin-benchmark.md`; `docs/runbooks/external-pattern-intake.md` |
| [continuedev/continue](https://github.com/continuedev/continue) | Testing-execution comparison input for source-controlled AI checks and PR-status gating that live inside the repo | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) | Eval and adversarial-testing comparison input for CI-integrated regression checks, red teaming, and LLM-app vulnerability scanning | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |
| [UKGovernmentBEIS/inspect_ai](https://github.com/UKGovernmentBEIS/inspect_ai) | Evaluation-harness comparison input for task datasets, scorers, agent bridges, sandboxed runs, and replayable per-sample logs | `docs/reviews/2026-04-16-agentic-open-source-benchmark.md` |

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
