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

### 2026-04-02 - Study-processing cron ingress and internal dispatch stay on separate auth boundaries

- Decision: Keep study-processing cron ingress on `GET /api/cron/study-processing` authenticated only by `CRON_SECRET`, and keep internal self-dispatch on `POST /api/internal/study-processing` authenticated only by `STUDY_PROCESSING_INTERNAL_TOKEN`.
- Why it was made: Study-processing runs privileged background work, so platform-identifying request metadata such as `x-vercel-cron`, user agents, or request origins must never be treated as proof of identity. Splitting cron ingress from internal dispatch also removes auth ambiguity and prevents internal token leakage to origin-derived targets.
- Constraints or assumptions: Vercel cron requests are ordinary HTTP requests and must be authenticated by the shared secret in `Authorization`. Internal best-effort kicks still need an HTTP hop in this architecture, but they must always target the configured trusted base URL.
- What would invalidate it: A future queue/runtime architecture that removes the self-HTTP dispatcher entirely or introduces a different platform-authenticated primitive with a stronger trust contract.

### 2026-03-07 - Repo-wide review artifacts are first-class governance docs

- Decision: Keep a durable review system in `docs/reviews/` with one living summary and dated deep-review snapshots.
- Why it was made: Repo-wide analysis needs durable comparison points to spot regressions and repeated mistakes across sessions.
- Constraints or assumptions: The review system only stays useful if reruns update the living summary and create dated snapshots instead of relying on chat memory.
- What would invalidate it: If the team adopts a different canonical review artifact system that provides equally durable comparison history.
