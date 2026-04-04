# Factory ESLint Plugin Benchmark

Review date: 2026-03-21
Reviewer: Codex
External benchmark: [Factory-AI/eslint-plugin](https://github.com/Factory-AI/eslint-plugin)

## Scope and Status

This is a retained dated benchmark snapshot, not a current implementation tracker.

Its durable outcomes have already been absorbed into LitRev-local owners:
- `docs/plans/plan-lint-governance.md` for the canonical lint-governance program
- `docs/runbooks/external-pattern-intake.md` for the repo-wide adaptation procedure

Use this file only when you need the original benchmark rationale behind those decisions.

## Review-Time Conclusion

Factory's `eslint-plugin` was valuable mainly as a structural benchmark, not as a dependency or policy source to import directly.

The strongest reusable ideas were:
- one named rule per convention
- short per-rule docs with rationale, scope, examples, and exceptions
- layered configs by execution surface
- tests for both the rules and real consumer usage

The main rejection points were:
- blunt blanket bans that do not fit LitRev's nuanced frontend/runtime rules
- org-specific API assumptions that do not match LitRev wrappers or route contracts
- test-placement opinions that conflict with LitRev's actual layout
- simple heuristics that still need false-positive review before becoming governance

## Enduring Takeaways

### Keep the method, not the code

The lasting lesson from Factory is to turn repeated architecture conventions into small, documented, tested LitRev-local rules.

That means:
- rewrite rules for LitRev's stack and naming
- keep the rules close to the real repo contracts
- validate the rules as product code

### Keep governance surface-aware

Factory's layered config model was the right structural inspiration.

LitRev should keep enforcing different constraints for different surfaces instead of pretending every file should obey the same policy set.

### Keep AGENTS intent and local lint as enforcement

The benchmark supported a healthy split:
- `AGENTS.md` expresses repo intent and routing
- repo-local lint rules and scripts enforce the stable executable subset

## What LitRev Intentionally Did Not Copy

LitRev should not directly inherit:
- blanket React hook bans
- Factory-specific logging or middleware contracts
- strict colocated-test-only policy
- any rule whose false-positive behavior has not been checked against LitRev's actual codebase

## Current Canonical Owner

For current truth, use:
- `docs/plans/plan-lint-governance.md`

Do not use this review file to infer current gaps, current CI posture, or current lint architecture status.
