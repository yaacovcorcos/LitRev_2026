# Deep Review Template

Review date: YYYY-MM-DD
Reviewer: Codex
Scope: Whole repo
Comparison baseline: `docs/reviews/repo-health.md` and previous dated review

## Executive Summary

- State the top 1-3 repo risks in plain language.

## Findings

List findings first, ordered by severity. For each finding include:

- Severity
- Title
- Why it matters
- Evidence with file references
- Whether it is new, recurring, or a regression
- Required fix or containment

## Category Review

### Correctness and Regressions

- Current issues:
- Improvements:

### Architecture Drift

- Current issues:
- Improvements:

### Database and Migration Safety

- Current issues:
- Improvements:

### Auth and Permissions

- Current issues:
- Improvements:

### UI Behavior Regressions

- Current issues:
- Improvements:

### Test Coverage Gaps

- Current issues:
- Improvements:

### Dead Code and Duplication

- Current issues:
- Improvements:

### Docs Drift

- Current issues:
- Improvements:

### Deployment and Operational Risk

- Current issues:
- Improvements:

## Repeated Mistakes

- Capture patterns that recur across files, PRs, or subsystems.

## Regressions Since Last Review

- Capture what got worse, not just what is broken.

## Intentional Tradeoffs to Preserve

- Move validated intentional decisions into `docs/architecture/decision-log.md` if they are not already recorded there.

## Validation Run

- Commands executed:
- Commands not executed and why:

## Follow-Up

- Immediate fixes:
- Medium-term cleanup:
- Docs to update:
