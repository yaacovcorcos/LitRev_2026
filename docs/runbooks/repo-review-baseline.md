# Repo Review Baseline

This runbook records the current in-repo baseline for repeat deep reviews.

## Purpose

Use this document when rerunning architecture or quality reviews and you need a stable reference for:

- what the last durable repo-level findings were
- which review-driven fixes already shipped
- which review-driven gaps are still intentionally open

This is not a changelog. Keep it as a compact current-state baseline.

## Current Baseline

- Canonical agent-runtime review tracker: `docs/plans/plan-agentic.md`
- Canonical diagnosis report: `docs/reports/diagnosis-03-02.md`
- Current review-derived open work lives in `Active Fixes` inside `docs/plans/plan-agentic.md`

## Review Update Rules

When a deep repo review finds new durable issues:

1. Add or update the canonical fix entry in the relevant plan.
2. If the finding changes cross-cutting review methodology, update this runbook.
3. If a finding is only local and tactical, keep it in the PR/review thread instead of expanding this file.

## Minimum Comparison Checklist

Before claiming a review is "better than last time", compare against:

1. `docs/plans/plan-agentic.md`
2. `docs/reports/diagnosis-03-02.md`
3. This runbook

## Current Known Gaps

- Popup still does not have full timeline-style error parity with `/ai` and project copilot.
- Shared stream adapters still require ongoing consolidation so terminal failure handling does not drift per surface.
