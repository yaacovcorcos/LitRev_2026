# Architecture Decision Log

This file records intentional technical tradeoffs so future repo-wide reviews can distinguish deliberate decisions from accidental drift.

## How To Use

Add an entry when a reviewer or implementer concludes that a controversial or non-obvious choice is intentional and should be preserved unless its assumptions change.

Each entry should stay short and include:

- Date
- Decision
- Why it was made
- Constraints or assumptions
- What would invalidate it

## Entries

### 2026-04-02 - External repo patterns and adapted skill packs remain reference inputs until rewritten into LitRev-local owners

- Decision: Treat external repositories, vendor examples, and internally adapted skill packs as reference inputs only. They do not become LitRev policy until the repo rewrites them into local code, tests, runbooks, or owner-plan updates.
- Why it was made: LitRev already has canonical owner docs and executable governance. Importing outside patterns directly would create split ownership, policy drift, and tone-heavy recommendations that look stronger than their evidence.
- Constraints or assumptions: External ideas are still useful. We can adapt them as local rules, procedures, or advisory skills, but repeated findings must be promoted into normal LitRev engineering controls or docs.
- What would invalidate it: A future governance system that intentionally centralizes external pattern adoption under a different canonical owner with equal or better local enforcement.

### 2026-04-02 - Study-processing deployed dispatch keeps separate auth boundaries, while local development may fall back in-process

- Decision: Keep study-processing cron ingress on `GET /api/cron/study-processing` authenticated only by `CRON_SECRET`, and keep deployed internal self-dispatch on `POST /api/internal/study-processing` authenticated only by `STUDY_PROCESSING_INTERNAL_TOKEN`. Local non-deployed development may fall back to a direct in-process one-job kick when dispatch config is incomplete.
- Why it was made: Study-processing runs privileged background work, so platform-identifying request metadata such as `x-vercel-cron`, user agents, or request origins must never be treated as proof of identity. Splitting cron ingress from internal dispatch removes auth ambiguity and prevents internal token leakage to origin-derived targets, while the local in-process fallback closes the remaining developer-only queue gap without weakening deployed auth boundaries.
- Constraints or assumptions: Vercel cron requests are ordinary HTTP requests and must be authenticated by the shared secret in `Authorization`. Deployed internal best-effort kicks still use the configured trusted base URL plus `STUDY_PROCESSING_INTERNAL_TOKEN`. Preview and production stay on those authenticated deployed paths, while local development is the only environment allowed to bypass the HTTP hop when config is incomplete.
- What would invalidate it: A future queue/runtime architecture that removes the self-HTTP dispatcher entirely or introduces a different platform-authenticated primitive with a stronger trust contract.

### 2026-03-07 - Repo-wide review artifacts are first-class governance docs

- Decision: Keep a durable review system in `docs/reviews/` with one living summary and dated deep-review snapshots.
- Why it was made: Repo-wide analysis needs durable comparison points to spot regressions and repeated mistakes across sessions.
- Constraints or assumptions: The review system only stays useful if reruns update the living summary and create dated snapshots instead of relying on chat memory.
- What would invalidate it: If the team adopts a different canonical review artifact system that provides equally durable comparison history.
