export const PHASE2_HOTSPOT_GLOBS = [
  "app/ai/**/*.ts",
  "app/ai/**/*.tsx",
  "app/project/[id]/layout.tsx",
  "components/copilot/**/*.ts",
  "components/copilot/**/*.tsx",
  "contexts/ProjectCopilotContext.tsx",
  "hooks/useCopilotConversations.ts",
  "hooks/useCopilotStreamActions.ts",
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
