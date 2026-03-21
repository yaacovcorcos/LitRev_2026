# litrev/no-new-exhaustive-deps-disable

Hot-spot chat and copilot files should not grow new `react-hooks/exhaustive-deps` suppressions. These suppressions hide unstable control flow in the exact runtime surfaces LitRev is trying to stabilize.

The completed Phase 2 hot-spot contract keeps this strict in:
- `/ai`
- copilot components
- `ProjectCopilotContext`
- `useCopilotConversations`
- `useCopilotStreamActions`

If a dependency list is hard to express cleanly, refactor the ownership boundary instead of suppressing the rule.
