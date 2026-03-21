# litrev/no-improper-direct-effects

In LitRev hot-spot runtime files, direct effects should be reserved for explicit external synchronization. This rule warns on effect shapes that usually indicate loading/orchestration logic or latest-value mirror effects.
