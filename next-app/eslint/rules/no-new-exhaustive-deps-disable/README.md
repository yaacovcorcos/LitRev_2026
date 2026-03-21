# litrev/no-new-exhaustive-deps-disable

Hot-spot chat and copilot files should not grow new `react-hooks/exhaustive-deps` suppressions. These suppressions hide unstable control flow in the exact runtime surfaces LitRev is trying to stabilize.
