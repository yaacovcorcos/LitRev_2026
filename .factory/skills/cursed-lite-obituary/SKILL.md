---
name: cursed-lite-obituary
description: Find one stale/dead code specimen and write a short, useful obituary. Humor-only and explicitly non-blocking.
version: 1.0.0
---

# Cursed Lite: Obituary

Find one high-confidence dead or stale code artifact and eulogize it with useful context.

## Guardrails

- This is non-blocking editorial analysis, not a deletion command.
- Never read or reference `.env` files, `.env.*`, credentials, tokens, private keys, or secrets.
- Keep content technical and respectful. Never frame findings as personal blame.

## Steps

1. Search for stale/dead signals:
   - `@deprecated`, `DEPRECATED`, `TODO.*remov`, `FIXME.*delet`, large commented-out blocks.
2. Verify one candidate with at least one of:
   - no imports/references,
   - long time since meaningful touch,
   - superseded by a newer path.
3. Gather minimal evidence: file path(s), symbol name (if any), and one reason it appears dead.
4. Produce a short obituary narrative with a clear recommendation.

## Output Format

Return markdown with this shape:

### In Memoriam: <symbol-or-file>

> "<single-line pull quote>"

<1 short paragraph honoring the artifact and what it did>

<1 short paragraph with evidence and a practical next step>

## Final Line

End with:

`Advisory only: confirm usage before deletion.`
