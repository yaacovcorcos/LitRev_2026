# litrev/no-improper-direct-effects

In LitRev hot-spot runtime files, direct effects should be reserved for explicit external synchronization. This rule warns on effect shapes that usually indicate loading/orchestration logic or latest-value mirror effects.

Examples that should stay valid:
- DOM/layout synchronization such as textarea auto-resize or scroll anchoring in shared hooks
- explicit browser/event synchronization
- low-level render-time ref assignment for imperative infrastructure

Examples that should be refactored away:
- watcher effects that dispatch queued follow-ups when a group of flags becomes "ready"
- latest-value mirror effects whose only job is keeping refs in sync with props or state
- project/conversation reset choreography that can be owned by keyed remounts or explicit transition handlers
