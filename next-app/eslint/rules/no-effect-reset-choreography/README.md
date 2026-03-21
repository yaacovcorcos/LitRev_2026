# litrev/no-effect-reset-choreography

Hot-spot runtime files should not reset local state through identity-change effects when keyed remounts or explicit controller transitions are clearer and safer.

Preferred replacements:
- key the owner by project, conversation, or scope identity
- clear transient state from explicit send/approval lifecycle handlers
- keep confirmation and windowing state local to the identity that owns it

This is the rule that pushed the completed Phase 2 cleanup away from:
- project-switch reset effects in the copilot runtime
- conversation/windowing reset effects in timeline rendering
- composer confirmation/reset effects that can be handled by explicit dismissal or keyed ownership
