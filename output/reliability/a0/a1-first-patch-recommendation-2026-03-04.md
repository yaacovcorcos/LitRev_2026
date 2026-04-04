# A1 First Patch Recommendation

- Date: 2026-03-04
- Commit: 33a1f4b

## Recommended first patch target
- Target failure: dead-scroll / frozen shell behavior
- Why this first:
  - Highest user impact: appears as full UI freeze.
  - Architecture risk already identified in shell scroll ownership and wheel interception.
  - Existing plan debt explicitly tracks unresolved copilot scrolling isolation (`CUX-017`).
- Rollback flag / kill switch:
  - Use route-level scroll-lock gating with a dedicated kill switch (recommended new flag), while preserving existing mobile fallback flag behavior.

## File candidates
- [layout.tsx](../../../next-app/app/project/[id]/layout.tsx)
- [ProjectCopilotPanel.tsx](../../../next-app/components/project/ProjectCopilotPanel.tsx)
- [project-copilot-panel-scroll-containment.ts](../../../next-app/components/project/project-copilot-panel-scroll-containment.ts)
- [project-shell.module.css](../../../next-app/app/project/[id]/project-shell.module.css)

## Acceptance criteria for A1
1. No dead-scroll in project shell under normal/poor network with long timelines.
2. No wheel-prevent with no valid scroll target.
3. Kill switch can disable new path without deployment rollback.
4. Existing compile/test/smoke checks remain green.

## Note
This recommendation is provisional until A0 deterministic manual repro evidence is fully captured across the required matrix.
