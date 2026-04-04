# Historical Note: Plan Execution Confinement and Approval Integrity

`FIX-002` is complete. Canonical runtime truth now lives in [../plan-agentic.md](../plan-agentic.md).

The shipped contract is:

- executable plan artifacts author `payload.execution` at artifact creation time
- advisory or legacy plans without `execution` fail closed in UI and runtime
- server plan execution loads artifact-bound `conversationId`, `projectId`, and `originAgentMode` before normal run setup
- executable tool exposure is the intersection of selected-step tools, stored `execution.allowedToolNames`, and current safe mode/scope tool definitions
- strict order is enforced by original selected step index against the immutable plan step array
- off-plan, out-of-order, non-executable, and now-unavailable plan steps fail through the shared structured non-retryable `plan_execution` error envelope

Historical implementation landed in:

- `next-app/lib/server/ai/ai-service.ts`
- `next-app/lib/server/agent/plan-execution.ts`
- `next-app/lib/server/agent/plan-payloads.ts`
- `next-app/hooks/useProjectConversationStreamActions.ts`
- `next-app/app/ai/page.tsx`
- `next-app/lib/ai/error-envelope.ts`
- related runtime and artifact tests
