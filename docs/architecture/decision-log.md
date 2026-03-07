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

### 2026-03-07 - Repo-wide review artifacts are first-class governance docs

- Decision: Keep a durable review system in `docs/reviews/` with one living summary and dated deep-review snapshots.
- Why it was made: Repo-wide analysis needs durable comparison points to spot regressions and repeated mistakes across sessions.
- Constraints or assumptions: The review system only stays useful if reruns update the living summary and create dated snapshots instead of relying on chat memory.
- What would invalidate it: If the team adopts a different canonical review artifact system that provides equally durable comparison history.
