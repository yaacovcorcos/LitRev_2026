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

## Canary Report

Run from `next-app/`:

```bash
npm run citation:report -- --since=2026-03-10T00:00:00.000Z
```

Optional window override:

```bash
npm run citation:report -- --since=2026-03-10T00:00:00.000Z --until=2026-03-11T00:00:00.000Z
```

The report prints:
- total completed citation fetches
- PubMed vs DOI breakdown
- resolution-path counts
- reason counts
- count-bearing success rate
- uncached latency p50/p95
- percentage of PubMed DOI-bearing lookups that ended bibliography-only

## First Triage

1. Run the canary report and check whether failures cluster in:
   - `icite_timeout`
   - `crossref_timeout`
   - `budget_exhausted`
   - `provider_error`
2. If provider errors spike, run the compatibility smoke to detect gross upstream drift or outages.
3. If bibliography-only outcomes rise mainly from timeout/budget reasons, consider a follow-up continuation path before changing the bibliography-first UI contract.
4. If outcomes are mostly `crossref_no_count` or `no_doi_fallback`, the issue is likely data availability rather than transport reliability.
