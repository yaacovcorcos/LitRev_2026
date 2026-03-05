# Universal Planning Meta-Prompt (v1)

Use this prompt when a user asks for a plan to implement any LitRev feature, fix, or refactor.

This prompt is intentionally outcome-constrained, not workflow-constrained. Do not force a fixed reasoning flow or fixed output template.

## Canonical Prompt Text

```md
You are creating an implementation plan for the LitRev repository.

Produce a decision-complete plan that another engineer/agent can execute without making major design decisions.

Constraints:
- Use repo evidence: ground decisions in concrete files/functions/current behavior, not generic assumptions.
- Follow LitRev governance in `AGENTS.md`: route by changed paths/intent, load required Tier 2 specialist and Tier 3 docs.
- Optimize for the smallest reversible change that satisfies the objective.
- Reuse existing modules/contracts where possible; justify any new abstraction.
- Keep long-term enterprise quality explicit: maintainability, scalability, reliability, operability, and security/compliance (when relevant).
- Do not prescribe a rigid output shape. Choose the clearest format for this task (paragraphs, bullets, numbered lists, tables, ASCII diagrams/wireframes as needed).

Required plan content:
1. Overall goal:
   - Begin the plan with a clear narrative explanation of the general purpose and intended end state.

2. Goal + scope:
   - Problem statement
   - Intended outcome
   - In-scope and out-of-scope

3. Governance and repo grounding:
   - AGENTS trigger mapping by touched paths/intent
   - Required Tier 2/Tier 3 retrieval
   - Current-state evidence references (files/functions/behavior)

4. Documentation impact and updates:
   - State whether documentation updates are required for this plan.
   - If yes, list exact docs/files to update and what should change.
   - If any work is intentionally deferred, specify where that future work is documented (plan file, runbook, backlog doc) and the exact entry to add/update.
   - Include documentation updates in execution slices, not as optional follow-up.

5. Minimal-sufficient strategy:
   - Why this is the smallest reversible approach that solves the goal

6. Reuse vs new:
   - What existing components/contracts are reused
   - What is new and why it is necessary

7. Decision-complete implementation design:
   - Touched paths/components/services
   - Interface/API/type/data-contract changes
   - Edge cases and failure behaviors
   - Practical impact translation:
     - User experience
     - Runtime/system behavior
     - Operational/support/deploy impact

8. Long-term quality and scalability:
   - Maintainability, scalability, reliability, operability
   - Security/compliance implications when relevant
   - Explicit tradeoffs and rationale

9. Execution slicing:
   - PR/phase slices with rollback-safe boundaries
   - Blast-radius notes per slice
   - For medium/high-risk or multi-slice work: include complexity budget and alternatives considered (chosen vs rejected)

10. Risk + rollback:
   - Primary failure modes
   - Detection signals
   - Fallback/rollback path

11. Verification strategy:
   - Test matrix:
     - Happy path
     - Edge cases
     - Regression scenarios
   - Relevant test layers (unit/integration/e2e/contract)
   - Acceptance signals

12. Validation mapping:
   - Validation intent
   - Required command gates where AGENTS mandates them
   - For each gate, state which correctness risk it catches

13. Debuggability + triage:
   - Failure surface signals (UI/logs/telemetry/alerts)
   - Fast reproduction path
   - First triage steps and probable fault boundaries
   - For high-risk plans: first owner and escalation boundary

14. Assumptions/defaults:
   - Unresolved ambiguities
   - Explicit defaults chosen

Clarification policy:
- Ask only material blocker questions.
- If unanswered, proceed with explicit assumptions/defaults.
- Do not ask questions that can be answered from repo evidence.
```

## Notes

- This is the canonical v1 text. Update this file when the planning contract changes.
- Keep this prompt aligned with `AGENTS.md` and `docs/agents/cold-memory-index.md`.
