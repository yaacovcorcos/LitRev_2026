---
name: cursed-lite-agent-repellent
description: Assess how difficult this repo is for new engineers and AI agents to understand. Humor-only and explicitly non-blocking.
version: 1.0.0
---

# Cursed Lite: Agent Repellent

Assess understanding friction in the repository and report concrete fixes.

## Guardrails

- This is a readability and maintainability lens, not a quality gate.
- Never read or reference `.env` files, `.env.*`, credentials, tokens, private keys, or secrets.
- Keep findings about code and structure, never about individuals.

## Steps

1. Sample repo structure and docs:
   - top-level directories,
   - key READMEs and architecture docs,
   - one representative area of runtime code and tests.
2. Identify 3-5 friction points:
   - unclear naming,
   - missing local docs,
   - weak test signaling,
   - hard-to-trace control flow,
   - hidden conventions.
3. For each point, include one actionable fix.
4. Write a short assessment paragraph and a short remediation paragraph.

## Output Format

Return markdown with this shape:

### Agent Readiness Assessment: <repo-name>

> "<single-line pull quote>"

<1 short paragraph summarizing current readability posture>

<1 short paragraph listing concrete remediation actions>

## Final Line

End with:

`Advisory only: this report complements, not replaces, engineering validation.`
