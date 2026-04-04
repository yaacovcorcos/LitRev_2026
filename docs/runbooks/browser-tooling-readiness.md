# Browser Tooling Readiness Runbook

## Scope
This runbook defines the local-machine readiness path for LitRev's browser tooling.

It covers:
- Playwright setup and local verification for checked-in browser tests
- `agent-browser` setup and local verification for interactive browser automation
- the expected division of responsibility between the two tools

It does not replace:
- `docs/agents/testing-agent-contract.md` for repo-wide testing strategy
- `docs/runbooks/testing-ci-strategy.md` for shared CI lane meaning, local reproduction, and promotion rules
- `docs/runbooks/responsive-foundation-certification.md` for required responsive Playwright certification gates

## Tool roles

Use Playwright for:
- checked-in end-to-end coverage
- CI-backed regression detection
- repeatable route, auth, shell, and navigation scenarios
- browser-truth verification that must remain durable after the current session ends

Use `agent-browser` for:
- live local verification against a running dev server
- quick exploratory checks before or after implementation
- screenshots, snapshots, and interactive browser inspection by an agent
- debugging flows where immediate browser feedback is more valuable than a committed spec

Rule:
- Playwright is the durable browser-test backbone for this repo.
- `agent-browser` complements Playwright; it does not replace checked-in regression coverage.

## Machine readiness checklist

From repo root:

1. Install repo dependencies:

```bash
cd next-app
npm ci
```

2. Confirm Playwright is available:

```bash
cd next-app
npx playwright --version
```

3. If Chromium is missing on first local use, install it:

```bash
cd next-app
npx playwright install chromium
```

4. Install `agent-browser` on macOS:

```bash
brew install agent-browser
agent-browser install
```

Alternative supported install path:

```bash
npm install -g agent-browser
agent-browser install
```

`agent-browser install` downloads Chrome for Testing on first use if an existing supported browser is not already detected.

## LitRev local defaults

Playwright config lives at `next-app/playwright.config.ts`.

Important defaults:
- Playwright default port is `3101`
- base URL defaults to `http://127.0.0.1:3101`
- Playwright starts its own Next dev server through `webServer`
- the web server command sets `NEXT_PUBLIC_E2E_TEST_MODE=1` and `E2E_TEST_MODE=1`

Implication:
- if no other Next dev server is already running for this repo, let Playwright manage its own server on `3101`
- if you already have a LitRev dev server running on another port, either stop it before running Playwright or explicitly point Playwright at the existing port

Example for reusing an already-running dev server on `3000`:

```bash
cd next-app
PLAYWRIGHT_PORT=3000 npx playwright test --project=mobile-chromium --workers=1 mobile-login-smoke.spec.ts
```

## Readiness verification

### Playwright

Fast config sanity check:

```bash
cd next-app
npx playwright test --list
```

Recommended smoke check on a new machine:

```bash
cd next-app
npx playwright test --project=mobile-chromium --workers=1 mobile-login-smoke.spec.ts
```

If that fails because another Next dev server is already running in `next-app`, either stop that server or reuse it with `PLAYWRIGHT_PORT=<port>`.

### agent-browser

Fast binary sanity check:

```bash
agent-browser --version
```

Local dev-server verification example:

```bash
agent-browser open http://127.0.0.1:3000/login
agent-browser wait --load networkidle
agent-browser get title
agent-browser snapshot -i
agent-browser close
```

Expected result:
- the page opens successfully
- the title resolves
- the snapshot returns refs for real interactive controls

## Recommended local workflow

For implementation work:
1. use `agent-browser` to quickly verify the page loads, renders, and remains interactive
2. use Playwright when the behavior should become durable regression coverage
3. keep Playwright scenarios small and route-focused; do not replace missing lower-layer tests with broad browser scripts

For machine migration or first-run setup:
1. `npm ci` in `next-app/`
2. verify `npx playwright --version`
3. run `npx playwright test --list`
4. install `agent-browser`
5. run `agent-browser --version`
6. verify one real local route such as `/login`

## Failure interpretation

If Playwright fails before tests start:
- check whether another Next dev server is already running in `next-app`
- check whether the configured browser is installed locally
- prefer reusing an existing dev server with `PLAYWRIGHT_PORT=<port>` only when that server is known-good for the scenario

If `agent-browser` fails:
- confirm the binary is on `PATH`
- run `agent-browser install` again if Chrome for Testing was not fully installed
- confirm the target dev server responds before debugging browser automation itself

The expected steady-state posture is:
- Playwright available in `next-app/`
- `agent-browser` installed as a machine-level CLI
- Playwright used for durable checked-in tests
- `agent-browser` used for interactive local verification and debugging
