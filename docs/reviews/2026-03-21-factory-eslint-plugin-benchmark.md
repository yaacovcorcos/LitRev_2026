# Factory ESLint Plugin Benchmark

Review date: 2026-03-21
Reviewer: Codex
External benchmark: [Factory-AI/eslint-plugin](https://github.com/Factory-AI/eslint-plugin)
Purpose: Extract reusable patterns for LitRev lint governance, agent behavior, and architecture enforcement.

## Executive Summary

Factory's `eslint-plugin` repo is valuable mostly as a packaging and governance pattern, not as a drop-in dependency. The strongest ideas are:

- every convention becomes a named rule;
- every rule has machine-readable docs and tests;
- rules are grouped into layered configs by surface area;
- CI validates both the rule set and example consumer projects.

The repo is weak where it becomes overly org-specific or globally prescriptive. Some rules are too blunt for LitRev and would create false positives if copied directly.

The correct move for LitRev is to build a small repo-local lint rule set inspired by Factory's structure, but tuned to LitRev's actual architecture, exceptions, and current test layout.

## What Factory Gets Right

### 1. Rule-per-convention packaging

The repo has 23 custom rules, each exposed individually from `rules/index.js` and packaged as its own folder with:

- `README.md`
- `index.js`
- `index.test.js`

This is the most important pattern in the whole repo. It makes each convention:

- discoverable for humans,
- parseable for agents,
- testable in isolation,
- safe to evolve incrementally.

For LitRev, this is much more valuable than any single rule implementation.

### 2. Layered config hierarchy

Factory does not dump all rules into one flat preset. It uses:

- `base`
- `recommended`
- `frontend`
- `backend`

That matters because it lets them enforce different constraints by execution surface instead of pretending every file should obey the same rules.

LitRev needs this badly. Right now [next-app/eslint.config.mjs](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/next-app/eslint.config.mjs) is mostly stock Next/TS config plus one narrow warning-only rule.

### 3. Rules are tied to real architecture, not style trivia

The most useful Factory rules are not cosmetic. They encode:

- file placement,
- export shape,
- route middleware requirements,
- schema strictness,
- logging/error policy,
- test presence and location.

That is the correct level. They are using lint to enforce architecture and operability, not formatting taste.

### 4. Rule docs are written for adaptation, not only enforcement

Their README explicitly says not to import the plugin blindly and instead adapt the ideas. That is the right posture.

The rule READMEs are short and concrete. This is exactly what agents need:

- rationale,
- scope,
- incorrect examples,
- correct examples,
- exceptions.

LitRev should adopt this documentation shape for every custom rule.

### 5. The plugin tests itself and example consumers

Factory's CI runs:

- plugin tests;
- lint against example projects.

That is an important lesson: custom lint is product code. It needs test coverage and consumer validation, not just a checked-in rule file.

## What Not To Copy Directly

### 1. The rules are often intentionally blunt

Factory's frontend config bans:

- `useEffect`
- `useLayoutEffect`
- `useMemo`
- `useCallback`
- `Promise.then`
- `Promise.catch`
- direct `fetch`
- direct anchor tags without a specific contract

That kind of blanket policy may fit their environment, but it does not fit LitRev as-is.

LitRev already allows explicit external synchronization hooks and has real framework exceptions documented in [AGENTS.md](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/AGENTS.md). A copied global ban would create noise and encourage waivers.

### 2. Several rules assume Factory-specific APIs

Examples:

- `structured-logging` assumes `logError`, `logException`, `MetaError`
- `require-route-middleware` assumes `handle*Middleware`
- `require-v0-strict-schemas` assumes a `/api/v0/` contract

These are useful as patterns, not implementations. LitRev must encode its own wrappers and contracts instead.

### 3. Their test placement rules conflict with LitRev's current structure

Factory enforces strict colocated `*.test.ts(x)` files and bans `__tests__` directories.

LitRev currently has many `__tests__` directories across `app`, `components`, `contexts`, `hooks`, and `lib`. Copying Factory's rule literally would create a huge migration blast radius before we even decided whether that structure is desirable.

The lesson to steal is deterministic test policy, not their exact colocated convention.

### 4. Some implementations are intentionally simple

The rules are small and practical, but several rely on:

- filename matching heuristics,
- AST pattern matching without type context,
- direct `fs.existsSync` checks,
- hard-coded path assumptions.

That simplicity is mostly a strength, but it means we should review false-positive risk before adopting any rule shape.

## What This Means For LitRev

## Current LitRev Gaps

Compared with Factory's approach, LitRev currently has these gaps:

- [next-app/eslint.config.mjs](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/next-app/eslint.config.mjs) has almost no repo-specific executable architecture rules.
- [next-app/package.json](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/next-app/package.json#L10) defines lint, but [CI](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/.github/workflows/ci.yml#L98) does not run it.
- Repo architecture rules are mostly carried in [AGENTS.md](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/AGENTS.md) and custom scripts like [check-chat-stream-architecture.mjs](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/next-app/scripts/check-chat-stream-architecture.mjs), not in a coherent lint rule family.
- Core agent/runtime hotspots still rely on effect-heavy orchestration, for example [ProjectCopilotContext.tsx](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/next-app/contexts/ProjectCopilotContext.tsx), [project layout](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/next-app/app/project/[id]/layout.tsx), and [HomeClient.tsx](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/next-app/app/HomeClient.tsx).
- Searchability conventions are inconsistent: avoidable default exports still exist, and non-test parent relative imports are common.
- Logging/error semantics are inconsistent across client, action, and server layers.

## What LitRev Should Steal First

### 1. The packaging model

Create a repo-local LitRev lint rule set with:

- one folder per rule,
- one short README per rule,
- one test file per rule,
- one central registry,
- one flat-config integration layer.

Suggested location:

- `next-app/eslint-rules/` for a repo-local first step, or
- a small workspace package later if we want versioned reuse.

Suggested rule folder layout:

```text
next-app/eslint-rules/
  no-nonframework-default-exports/
    README.md
    index.ts
    index.test.ts
  require-action-wrapper/
    README.md
    index.ts
    index.test.ts
```

### 2. Layered LitRev configs

Instead of one monolithic config, define LitRev rule groups by surface:

- `litrev/base`
  Core searchability and import/export rules.
- `litrev/frontend`
  UI rules, effect discipline, shell/page constraints, accessibility contract helpers.
- `litrev/server`
  Actions, route handlers, validation wrappers, logging and auth enforcement.
- `litrev/runtime`
  Agent/runtime/chat-specific rules where we already use focused scripts today.

This mirrors Factory's best structural idea without copying their actual opinions.

### 3. Rule docs that map directly to AGENTS.md

Each LitRev custom rule should have:

- Rule ID
- Why the rule exists
- What it enforces
- Allowed exceptions
- Incorrect examples
- Correct examples
- Whether it is `warn` or `error`
- Whether it has autofix

Then [AGENTS.md](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/AGENTS.md) should reference those Rule IDs instead of carrying only prose.

## LitRev Rules To Build First

These are the highest-value candidates after reviewing both the Factory repo and LitRev's current codebase.

### Tier 1: Start here

#### `litrev/no-nonframework-default-exports`

Goal:

- ban default exports outside framework-required files such as Next `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`, and config files.

Why:

- improves grep-ability and refactorability;
- directly addresses avoidable defaults in LitRev client modules.

Factory inspiration:

- `import/no-default-export`
- `filename-match-export`

#### `litrev/no-parent-import-across-feature-boundaries`

Goal:

- ban parent-directory relative imports when crossing module boundaries; require `@/` imports instead.

Why:

- deterministic provenance;
- safer scripted refactors;
- clearer architectural boundaries.

Factory inspiration:

- backend use of `no-relative-import-paths`

#### `litrev/no-catch-console-error`

Goal:

- ban `.catch(console.error)` and similar discard-style patterns.

Why:

- these calls lose context and normalize weak error handling in agent-written code.

Factory inspiration:

- `structured-logging`
- `no-log-exception-with-throw`

#### `litrev/require-action-wrapper`

Goal:

- require `app/actions/**` exports to go through sanctioned wrappers such as `withAction` / `withValidatedAction`, and require auth wrappers where appropriate.

Why:

- this is one of LitRev's actual server-entrypoint contracts.

Factory inspiration:

- `require-route-middleware`
- `require-v0-strict-schemas`

### Tier 2: Next wave

#### `litrev/require-route-auth-or-policy-wrapper`

Goal:

- require `app/api/**` routes to use sanctioned session/admin/policy wrappers based on route class.

Examples:

- `requireApiSession`
- `requirePlatformAdminApi`
- shared telemetry/request policy helpers

#### `litrev/require-zod-validated-entrypoints`

Goal:

- require Zod validation for action and API request inputs, either inline or via approved wrapper.

This should be LitRev-specific, not a copy of Factory's `/api/v0/` schema rule.

#### `litrev/effect-discipline-hotspots`

Goal:

- turn today's warning-only hotspot rule into a real path-scoped architecture rule with explicit exemptions.

Important:

- do not copy Factory's blanket `no-use-effect-in-hooks` or global frontend ban;
- encode LitRev's real rule: effects are allowed for explicit external synchronization, not for ordinary orchestration.

#### `litrev/require-runtime-tests-for-new-server-tools`

Goal:

- require tests for new `lib/server/ai/tools/*.ts` files and new `app/actions/*.ts` files.

Important:

- preserve LitRev's current `__tests__` layout at first;
- do not force a repo-wide test-location migration unless we choose that explicitly.

Factory inspiration:

- `require-test-files`
- `test-file-location`

### Tier 3: Good candidates after baseline cleanup

- `litrev/filename-match-export` for selected component domains only
- `litrev/no-log-and-throw-same-block`
- `litrev/require-shell-embedding-for-project-routes`
- `litrev/no-literal-route-construction` if route helper usage becomes a recurring issue
- `litrev/no-ad-hoc-feature-flag-reads` if env/flag access should be centralized further

## Best LitRev Adaptation Strategy

### 1. Do not import `@factory/eslint-plugin`

Reasons:

- the repo is explicitly shared for inspiration rather than maintenance;
- several rules are org-specific and would encode the wrong contracts;
- LitRev needs flat-config ESLint 9 integration and repo-specific exceptions.

### 2. Copy the method, not the code

What to emulate:

- folder structure,
- README style,
- test-per-rule discipline,
- config layering,
- CI validation of the rule set,
- machine-readable architecture constraints.

What not to emulate blindly:

- Airbnb-heavy defaults,
- their React blanket bans,
- their test placement convention,
- their error/logging API assumptions.

### 3. Use small custom rules plus focused scripts

Factory shows that many useful rules can stay small.

For LitRev:

- use ESLint rules for AST-local or path-local checks;
- keep focused scripts for cross-file or cross-subsystem constraints.

The existing [check-chat-stream-architecture.mjs](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/next-app/scripts/check-chat-stream-architecture.mjs) is already the right pattern for the second category.

### 4. Roll rules out gradually

Recommended rollout:

1. write the rule and docs;
2. add rule tests;
3. run in `warn` mode;
4. clean current violations in the targeted domain;
5. promote to `error`;
6. add `npm run lint` to CI once the first-wave baseline is viable.

### 5. Treat custom lint as product code

Adopt Factory's discipline here:

- rules should have tests;
- rules should have examples;
- rules should be reviewed for false positives;
- CI should validate both rule tests and real consumer code.

## Concrete Next Actions For LitRev

If we continue this line of work, the next best execution sequence is:

1. Create `next-app/eslint-rules/` and move the first LitRev rule into a tested, documented structure.
2. Implement `litrev/no-nonframework-default-exports`.
3. Implement `litrev/no-catch-console-error`.
4. Implement `litrev/require-action-wrapper`.
5. Expand the current hotspot effect rule in [next-app/eslint.config.mjs](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/next-app/eslint.config.mjs) into a real LitRev rule with explicit exemptions.
6. After the first wave is clean, add lint to [CI](/Users/yaacovcorcos/LitRev_2026/.worktrees/frontend-ui-specialist-governance/.github/workflows/ci.yml#L98).

## Final Judgment

Factory's repo is worth studying because it proves an important point:

- custom lint rules do not need to be huge or magical to meaningfully direct agents.

The repo is not worth copying directly because:

- its strongest value is structural, not substantive;
- several rules would be the wrong law for LitRev.

The correct LitRev takeaway is:

- build our own small, documented, tested lint lawbook;
- aim the first rules at our real recurring drift;
- keep AGENTS as intent and custom lint/scripts as the guarantee.
