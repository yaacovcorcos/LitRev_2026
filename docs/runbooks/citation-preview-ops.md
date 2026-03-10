# Citation Preview Ops

Use this runbook after shipping citation-provider changes or when citation hover counts appear unreliable.

## Provider Compatibility Smoke

Run from `next-app/`:

```bash
RUN_CITATION_PROVIDER_TESTS=1 npm run citation:smoke
```

Notes:
- This is an opt-in compatibility smoke, not a correctness proof.
- Override default fixtures with environment variables when needed:
  - `CITATION_SMOKE_PUBMED_URL`
  - `CITATION_SMOKE_PUBMED_WITH_DOI_URL`
  - `CITATION_SMOKE_DOI_URL`
- The smoke passes when resolver output is stable enough to classify and render bibliography without crashing. It does not require exact citation counts or an exact provider branch.

## Single-URL Diagnosis

If a specific hover is loading bibliography but never shows a citation count, inspect the real resolver outcome directly:

```bash
npm run citation:diagnose -- https://pubmed.ncbi.nlm.nih.gov/31452104/
```

You can pass multiple URLs:

```bash
npm run citation:diagnose -- https://pubmed.ncbi.nlm.nih.gov/31452104/ https://pubmed.ncbi.nlm.nih.gov/2553535/
```

The script prints one JSON line per URL with:
- `citationCount`
- `citationCountSource`
- `resolutionPath`
- `reason`
- `resolvedWithCitationCount`
- `hadDoiFallbackCandidate`

Use this when manual UI testing shows bibliography but no count, especially for PubMed links.

## Canary Report

Run from `next-app/`:

```bash
npm run citation:report -- --since=2026-03-10T00:00:00.000Z
```

Optional window override:

```bash
npm run citation:report -- --since=2026-03-10T00:00:00.000Z --until=2026-03-11T00:00:00.000Z
```

Optional workspace/project scope:

```bash
npm run citation:report -- --since=2026-03-10T00:00:00.000Z --workspaceIds=workspace-1 --projectIds=project-1,project-2
```

The report prints:
- total completed citation fetches
- PubMed vs DOI breakdown
- resolution-path counts
- reason counts
- count-bearing success rate
- uncached latency p50/p95
- percentage of PubMed DOI-bearing lookups that ended bibliography-only

Storage notes:
- Citation preview telemetry reuses `ChatUnificationMetric` as a pragmatic v1 storage home to avoid a schema change.
- Only terminal citation events are persisted in this version:
  - `citation_preview.metadata_request_completed`
  - `citation_preview.metadata_request_failed`
- Non-terminal hover/prefetch/open/start events may still exist in the client event model, but they are not stored in the database.

## First Triage

1. Run the canary report and check whether failures cluster in:
   - `icite_timeout`
   - `crossref_timeout`
   - `budget_exhausted`
   - `provider_error`
2. If provider errors spike, run the compatibility smoke to detect gross upstream drift or outages.
3. If bibliography-only outcomes rise mainly from timeout/budget reasons, consider a follow-up continuation path before changing the bibliography-first UI contract.
4. If outcomes are mostly `crossref_no_count` or `no_doi_fallback`, the issue is likely data availability rather than transport reliability.
