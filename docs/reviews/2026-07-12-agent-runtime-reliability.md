# Agent Runtime Reliability Review

Date: 2026-07-12

Scope: the shared agent runtime, provider adapters, tool execution, sub-agent orchestration, run persistence and recovery, artifacts and undo, clarification, memory/background work, telemetry, both chat surfaces (`/ai` and project chat), CI quality gates, browser tests, and the separate model-portfolio integration branch.

## Executive assessment

The pre-review runtime had broad unit coverage, but several important guarantees were either structural-only, best-effort, or split across non-atomic operations. The highest-risk defects were concurrency races, false-success terminal paths, work continuing after cancellation, destructive undo after concurrent edits, incomplete provider terminal validation, serverless fire-and-forget work, and test gates that could pass without executing the scenarios they claimed to certify.

The remediation replaces those assumptions with explicit ownership checks, compare-and-set transitions, bounded branches, atomic transactions, fail-closed validation, authenticated telemetry, and executable scenario-to-test mappings. The final verification ledger at the end of this document is intentionally evidence-based; no claim of “perfect” or failure-free behavior is made.

## Review method

- Traced the complete user-message path from both composers through the stream route, `AIService`, provider adapters, tool middleware, artifact persistence, run finalization, and recovery.
- Audited every registered agent tool for input validation, scope/actor binding, autonomy level, cancellation, idempotency, mutation behavior, and visible UI completion.
- Reviewed root and child-run ownership, plan execution, tool budgets, clarification pause/resume, background work, telemetry, and retry/deadline behavior.
- Compared quality-gate declarations with the exact Vitest files and scenario markers actually executed.
- Exercised focused failure paths while changes were made, followed by repository-wide, database, build, and browser gates listed below.
- Kept the model-portfolio work isolated and reviewed it as a separate integration candidate.

## Confirmed findings and remediation

### 1. Run and tool admission had race windows

**Confirmed defect:** active-run checks and some tool-budget checks could be observed by more than one concurrent caller before either caller persisted ownership. Batched tool calls could partially consume capacity before a later call in the same model turn was rejected. Parent lineage was not validated at every node strongly enough to prevent mismatched actor/conversation inheritance.

**Remediation:**

- Root user-message admission is serialized at the database boundary.
- Tool-call capacity is reserved for the whole batch and root lineage before any member executes.
- Parent/child project, conversation, user, root lineage, and model attribution are validated and propagated.
- Sub-agent initialization failure now cancels and finalizes the child instead of leaving it running.
- Added a real-database concurrent admission test in addition to mocked unit coverage.

### 2. Provider streams could terminate ambiguously

**Confirmed defect:** provider adapters could accept terminal combinations with neither usable text nor a complete tool call. Truncated output could enter generic retry behavior, risking repeated cost without a recoverable continuation.

**Remediation:**

- OpenAI, Anthropic, Google, and xAI adapters now validate terminal state structurally.
- Empty or malformed tool-call terminals fail closed with typed errors.
- Deterministic output truncation is classified as non-retryable unless a supported continuation path exists.
- Focused provider termination tests cover malformed deltas, missing payloads, refusal/content terminals, and tool-call completion.

### 3. Cancellation did not consistently own nested work

**Confirmed defect:** PDF analysis, bulk screening, context branches, tool work, and some persistence steps did not consistently receive or re-check the owning run signal. Late read-only results could be emitted after cancellation. Stop-then-immediate-send and stop-then-execute-plan could race the server cancellation request.

**Remediation:**

- The owning abort signal is propagated through provider, PDF, screening, context, tool, artifact, and persistence boundaries.
- Read-only late results are discarded; mutation paths are not detached.
- Quick/deep PDF calls have explicit deadlines and ignore late provider results.
- Both UI surfaces await semantic cancellation before sending replacement work, including plan execution, and pass the captured `replaceRunId` only after confirmation.
- Cancellation conflict/failure leaves the next action unsent and renders a typed recovery error.

### 4. Child delegation could report success before durable finalization

**Confirmed defect:** a child could return a successful payload even if its durable `endRun` transition failed. Ownership races around child completion were not reconciled consistently.

**Remediation:**

- Child success is conditional on durable finalization.
- Matching terminal ownership is adopted safely; conflicting terminal truth rejects success.
- Finalization is exactly-once at the runtime boundary and failed finalization is marked for recovery.

### 5. Clarification resolution was not sufficiently actor-bound

**Confirmed defect:** clarification answers and decision requests needed stronger actor/conversation compare-and-set semantics. A retried identical answer could duplicate resolution events, while a conflicting actor or answer needed a fail-closed result.

**Remediation:**

- Clarification resolution is scoped to the authenticated actor, canonical conversation, project, source run, and call.
- Identical same-actor retries are idempotent and do not duplicate `user_input_resolved`.
- Conflicting actors or answers are rejected.
- Stale UI clarification state is cleared only after the owning stream has released it.

### 6. Several tool contracts were unsafe or misleading

**Confirmed defect:** `create_project` exposed a mutation that could not satisfy the authenticated project-ownership contract. `delete_study` and `update_criteria` mixed direct mutation semantics with a review-first UI. `extract_pdf` was presented as restartable despite persistence side effects. Tool input was not uniformly parsed before handler execution.

**Remediation:**

- Removed `create_project` from the runtime, presets, policy, hard caps, tests, and quality waivers.
- `delete_study` is now a reviewable soft-deletion artifact with visible accept and undo.
- `update_criteria` returns a delta proposal; duplicate adds are no-ops with an explicit error, and removals preserve the exact canonical criterion selected at proposal time.
- `preview_study_pdf_update` provides the review-first PDF path; direct `extract_pdf` is restricted to autonomy levels 3–4.
- Registered tool input is Zod-parsed before execution, and output is sanitized through the declared schema.

### 7. PDF extraction used a check-then-act job guard

**Confirmed defect:** two callers could both pass the old processing-job read before either began extraction. A worker could also lose its lease and still write study data. Study mutation and job success were separate commits.

**Remediation:**

- Extraction claims the existing `(studyId, phase)` processing-job row atomically, including explicit expired-lease takeover.
- Queued or live leases reject duplicate execution before provider work.
- The study update and successful job settlement occur in one transaction guarded by the exact claimed `startedAt` lease identity.
- Lease loss prevents the study write; failed/cancelled work settles the job as failed without masking the primary cancellation error.

### 8. Artifact application and undo had destructive concurrency behavior

**Confirmed defect:** unsupported artifacts or missing snapshots could reach undo, and restore handlers could overwrite legitimate edits made after apply. Criteria undo risked restoring whole eligibility arrays instead of reversing only the accepted delta.

**Remediation:**

- Server allowlists are derived from registered apply/restore handlers.
- Unsupported types and missing snapshots fail closed.
- Apply snapshots record the applied state needed for a compare-and-set undo boundary.
- Undo checks the current targeted state before restoration and returns `ARTIFACT_UNDO_CONFLICT` without changing artifact status when concurrent edits exist.
- Delta criteria undo reverses only its own exact delta.

### 9. Scoping reports had an auto-apply crash window

**Confirmed defect:** the runtime created a proposed artifact, committed it, then updated it to `auto_applied` in a second operation. A crash could leave false proposed state or recovery events/checkpoints that disagreed with the live row.

**Remediation:**

- A metadata-only `createAutoAppliedArtifact` path creates the `auto_applied` row, authoritative reviewed event, and matching checkpoint in one transaction.
- The path is restricted to scoping reports, supports global scope, is actor/run/scope idempotent, and no longer performs a naked follow-up update.

### 10. UI failures could lose intent or appear successful

**Confirmed defect:** a failed first conversation bootstrap could leave the composer looking idle after discarding the attempted message. Artifact server-action promise rejection was not consistently turned into visible state. Plan execution could optimistically switch to running before prior cancellation was confirmed.

**Remediation:**

- Bootstrap failures return an explicit failure result, restore composer text, release the send lock, and render a retryable error.
- Artifact review/undo promise rejection is caught on both surfaces and leaves the artifact unchanged.
- Plan status stays proposed until the previous run cancellation is confirmed.
- Suggestion/clarification controls now have machine-readable blocked or consumed outcomes instead of visible no-ops.

### 11. Terminal and background work could be dropped by serverless teardown

**Confirmed defect:** conversation title refinement, memory-use attribution, auto-summarization, and post-run extraction used unbounded or plain fire-and-forget promises. A slow title provider could also delay or omit the visible title event.

**Remediation:**

- The first assistant-message transaction atomically claims a deterministic fallback title, which is emitted before `run_end`.
- Optional provider refinement is bounded, compare-and-set, and registered with Next.js post-response execution.
- Memory attribution and auto-summary are registered post-response with failure isolation.
- Post-run extraction receives a durable, idempotent pending marker and retry path; request post-response execution is an accelerator rather than the sole source of truth.

### 12. Usage admission and accounting were not atomic or terminal-safe

**Confirmed defect:** rate checks and usage insertion were separate operations, concurrent requests could exceed the configured request cap, limit queries were unbounded, and streaming usage was written only after the provider `done` chunk. A rejected or hanging write could retroactively fail or hang an otherwise valid response. Failed/retried provider attempts were not represented.

**Remediation:**

- Each provider attempt creates a durable usage reservation under an atomic scoped admission lock before the provider is called.
- Active reservations count against request and conservative token budgets.
- Admission has a bounded, typed retryable timeout and never calls the provider if ownership cannot be established.
- Success settles a reservation idempotently; failed/unknown attempts remain explicitly reconcilable.
- Settlement is bounded and cannot suppress provider `done`, `run_end`, or trigger a provider retry; post-response retry is safe because the reservation already exists durably.

### 13. Reliability telemetry accepted too much trust from the client

**Confirmed defect:** telemetry needed strict event schemas, authenticated actor/scope derivation, freshness bounds, and run/conversation/project relationship validation. Session counts could count rows rather than distinct sessions.

**Remediation:**

- All reliability events use discriminated schemas.
- The ingest route derives authenticated scope and verifies run, conversation, project, and actor relationships.
- Old/future timestamps and mismatched scope are rejected.
- Session queries count distinct sessions.
- Canary A3 remains explicitly uncertified because production dead-scroll detection has no evidence-producing call site yet.

### 14. The agent quality gate could certify labels without running behavior

**Confirmed defect:** the old quality gate primarily checked structure. Scenario markers could be duplicated or placed in files that were not the executable evidence for the claimed behavior. Child Vitest execution lacked strict output/time limits.

**Remediation:**

- Nine scenario IDs map exactly to six executable runtime suites.
- Each scenario requires one recognized marker and one passing scenario; duplicate recognized markers fail the gate.
- Child Vitest has a 60-second timeout, termination handling, and an 8 MiB output cap.
- Runtime-impact governance covers staged, unstaged, untracked, and deleted governed files.
- Router/artifact failures produce explicit gate errors instead of silently shrinking coverage.

### 15. Browser smoke tests could pass at the login redirect

**Confirmed defect:** the prior mobile smoke path could pass after being redirected to authentication without proving the agent page or interaction contract loaded.

**Remediation:**

- Browser foundation tests run Chromium desktop and mobile contracts.
- Authenticated agent paths fail explicitly when only the login page is reachable.
- The browser suite covers composer/bootstrap failure, stop/replacement behavior, clarification, artifact review/undo, and responsive interaction contracts.
- Mocked/intercepted stream tests are described as UI/runtime contract tests, not as live-provider end-to-end proof.

### 16. Direct production dependencies included patched security defects

**Confirmed defect:** the installed Better Auth release was below multiple patched OAuth/authorization fixes, including a critical refresh-token advisory. The directly installed XML parser and mail client were also below patched versions, and the telemetry stack retained vulnerable protobuf dependencies.

**Remediation:**

- Upgraded Better Auth, `fast-xml-parser`, Resend, and the OpenTelemetry Node SDK within supported direct dependency lines.
- Applied non-breaking transitive audit updates and regenerated the lockfile/client install.
- The production audit moved from 46 advisories (including 2 critical and 23 high) to 6 moderate advisories, with no critical or high findings.
- The remaining advisories require unsupported framework/Prisma downgrades according to npm's proposed fix and are recorded as residuals rather than “fixed” by a breaking rollback.

## Model-portfolio integration boundary

The separate model portfolio was monitored in its own worktree and was not accepted merely because its original suite was green. Independent review found pricing, attachment, availability, runtime-default, reasoning-budget, receipt, background-routing, and reservation-policy gaps. The portfolio was then integrated deliberately with reliability ownership, cancellation, provider terminal validation, title/background scheduling, and usage reservation semantics retained as the controlling contracts.

The integrated result additionally fixes Grok long-context/priority stacking, DeepSeek Flash cache pricing, creator-host-aware gateway estimates, unknown service-tier handling, xAI image MIME validation, fail-closed attachment hydration, bounded model-availability loading, runtime default-model selection, compute/visibility separation, normalized reservation sizing, abnormal-terminal receipt preservation, product/provider model-ID recovery parity, and configured-only background routing. Focused boundary tests were added before the final repository-wide gates.

## Known residual limits

- No test suite can establish perfect reliability. External providers, networks, browser engines, Vercel execution, and PostgreSQL can still fail.
- Live-provider validation requires configured credentials and may incur cost; intercepted browser streams do not prove provider behavior.
- Chromium is the automated browser baseline in this change; WebKit and Firefox are not newly certified.
- JavaScript cancellation prevents new work and discards late results, but it cannot preempt an already executing Prisma statement.
- The production dead-scroll detector/canary A3 remains blocked until real production evidence is emitted and evaluated.
- Dependency audit advisories are tracked separately; an advisory count alone is not treated as a validated exploit in the agent path.
- Six moderate production advisories remain in Next.js's nested PostCSS and Prisma CLI dependencies; npm offers only breaking framework/ORM downgrades, so they were not force-applied.

## Verification ledger

Final frozen-tree verification completed on 2026-07-13:

- Focused runtime, provider, pricing, reservation, cancellation, recovery, and integration suites passed after repairing stale pre-integration test harnesses.
- Full Vitest: 443 files passed, 3 skipped; 2,940 tests passed, 18 skipped.
- Real PostgreSQL lane with `RUN_DB_TESTS=1`: 4 files passed; 15 tests passed, 4 intentionally skipped.
- TypeScript and ESLint passed. Style lint completed with 0 errors and 19 pre-existing warnings; no new warning class was introduced.
- `governance:ci-required`, agent-quality, and runtime-test-impact gates passed. The agent-quality gate executed all 9 catalog scenarios through 6 deterministic runtime suites and observed 58 runtime signals.
- Credential-free GitHub CI exposed screening, summarization, and conversation-extraction fixtures that had implicitly relied on locally configured provider keys. Those suites now supply their background-model dependency explicitly and assert the requested work class, preserving production's fail-closed routing while allowing the complete quality and Vitest gates to run with all provider credentials blank.
- Prisma schema validation, migration deploy/status, and DB diagnosis passed against loopback PostgreSQL with all 36 migrations applied and required indexes present. CI then exposed a PostgreSQL 63-byte index-name truncation; an explicit mapped name and follow-up rename migration removed that drift while preserving the known pgvector-only exception.
- Production `next build` passed and generated 26 application pages/routes.
- Browser foundation passed all 21 Chromium desktop/mobile scenarios. One parallel desktop primer transiently failed once, then passed three consecutive isolated repetitions and the complete rerun; it is recorded as a test-environment flake rather than hidden.
- A separate headed Playwright CLI pass verified login, `/ai`, all seven model choices, setup-disabled routes, Terra selection, paid-priority state, 390×844 responsive layout, and the mobile AI-options dialog with zero browser errors. Screenshots were retained only as local verification artifacts, not product assets.
- Model-portfolio integration passed its focused policy/UI/runtime tests and the complete frozen-tree gates above.
