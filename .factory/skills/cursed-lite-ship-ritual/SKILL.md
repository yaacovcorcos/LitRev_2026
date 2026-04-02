---
name: cursed-lite-ship-ritual
description: Pre-deploy narrative risk scan for the current repository. Humor-only and explicitly non-blocking.
version: 1.0.0
---

# Cursed Lite: Ship Ritual

Perform a short, solemn pre-deploy ritual based on real repository signals.

## Guardrails

- This is a non-blocking narrative check. It does not replace tests, lint, typecheck, security, or release gates.
- Never read or reference `.env` files, `.env.*`, credentials, tokens, private keys, or secrets.
- Keep the tone respectful and repo-focused. Never target people.

## Steps

1. Run a quick risk scan with:
   - `git log --oneline -10`
   - `git diff --stat HEAD~5..HEAD` (fallback to `git diff --stat` if needed)
2. Inspect changed files for risk markers:
   - `TODO`, `FIXME`, `HACK`, disabled tests, broad catch blocks, large untested surface changes.
3. Select 1-3 concrete risks with file-level references.
4. Write one short blessing paragraph and one short warning paragraph.

## Output Format

Return markdown with this shape:

### Deployment Blessing: <repo-name>

> "<single-line pull quote>"

<1 short blessing paragraph>

<1 short warning paragraph with concrete risk references>

## Final Line

End with:

`This ritual is advisory only. Merge decisions follow LitRev release gates.`
