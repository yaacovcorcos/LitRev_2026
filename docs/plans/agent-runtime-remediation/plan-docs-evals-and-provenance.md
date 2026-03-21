# Plan: Executable Evals and Search Provenance

> Supporting historical note only. Canonical status, priority, and completion rules live in [../plan-agentic.md](../plan-agentic.md).
>
> Supported fix: `FIX-005b`
>
> Status: complete
>
> Retirement rule: this file may be deleted or folded into a shorter archive note once no one needs the implementation summary below.

## Shipped Outcome

`FIX-005b` shipped as an extension of the existing shared search receipt path, not as a new provenance event system.

Delivered behavior:
- executable runtime evals now exercise the live chat/orchestration path through `AIService.streamChatWithArtifacts()`
- the eval suite covers direct, delegated, zero-result, and failed search scenarios
- the existing `tool_activity` receipt path now carries compact search provenance for the core search tools:
  - `search_pubmed`
  - `search_openalex`
  - `search_semantic_scholar`
- the shared receipt metadata now preserves, where grounded:
  - source label
  - query preview
  - returned count
  - total count
  - compact result identifiers
- `/ai`, sidebar copilot, and the main project conversation preserve that richer receipt meaning through the current shared reducer and project message bridge
- final assistant answers remain clean narrative prose; no answer-level `Based on` footer was added in this slice

## Deliberate Non-Goals

The completed slice did not:
- add a new top-level `source_receipt` stream event
- move provenance into checkpoints
- change popup into a full provenance-receipt surface
- change final answer formatting
- broaden provenance to all tool families

## Remaining Follow-Through

Remaining work moved back to the canonical plans:
- [transparencyUI.md](../transparencyUI.md)
  - `Phase V2.2` for receipt expansion beyond the core search tools
  - `Phase V2.5` for provenance carry-forward and answer/read alignment follow-through
- [plan-agentic.md](../plan-agentic.md)
  - `FIX-011` for the remaining popup/failure parity work

This file should not be used as an active tracker again.
