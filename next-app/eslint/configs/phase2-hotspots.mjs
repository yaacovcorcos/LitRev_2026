export const PHASE2_HOTSPOT_GLOBS = [
  "app/ai/**/*.ts",
  "app/ai/**/*.tsx",
  "app/project/[id]/layout.tsx",
  "components/chat/**/*.ts",
  "components/chat/**/*.tsx",
  "components/project/ConversationMainView.tsx",
  "components/project/ProjectCopilotPanel.tsx",
  "components/project/ProjectConversationComposer.tsx",
  "components/project/ProjectConversationAutonomySettings.tsx",
  "components/project/project-copilot-panel-scroll-containment.ts",
  "contexts/ProjectConversationContext.tsx",
  "hooks/useProjectConversationManager.ts",
  "hooks/useProjectConversationStreamActions.ts",
];

export function createPhase2HotspotConfigs({
  mechanicalLevel = "error",
  semanticLevel = "error",
  asyncLevel = "error",
} = {}) {
  return [
    {
      name: "litrev/phase2-hotspots-mechanical",
      files: PHASE2_HOTSPOT_GLOBS,
      rules: {
        "litrev/no-new-exhaustive-deps-disable": mechanicalLevel,
      },
    },
    {
      name: "litrev/phase2-hotspots-semantic",
      files: PHASE2_HOTSPOT_GLOBS,
      rules: {
        "litrev/no-improper-direct-effects": semanticLevel,
        "litrev/no-effect-reset-choreography": semanticLevel,
      },
    },
    {
      name: "litrev/phase2-hotspots-async",
      files: PHASE2_HOTSPOT_GLOBS,
      rules: {
        "litrev/prefer-async-await-in-ui-runtime": asyncLevel,
        "litrev/no-promise-chain-side-effects": asyncLevel,
      },
    },
  ];
}

const defaultExport = createPhase2HotspotConfigs();

export default defaultExport;
