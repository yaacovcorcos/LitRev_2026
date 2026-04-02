const defaultExport = [
  {
    name: "litrev/runtime-hotspots-mechanical",
    files: [
      "app/ai/**/*.ts",
      "app/ai/**/*.tsx",
      "app/project/[id]/layout.tsx",
      "components/copilot/**/*.ts",
      "components/copilot/**/*.tsx",
      "contexts/ProjectCopilotContext.tsx",
      "hooks/useCopilotConversations.ts",
      "hooks/useCopilotStreamActions.ts",
    ],
    rules: {
      "litrev/no-new-exhaustive-deps-disable": "error",
    },
  },
  {
    name: "litrev/runtime-hotspots-semantic",
    files: [
      "app/ai/**/*.ts",
      "app/ai/**/*.tsx",
      "app/project/[id]/layout.tsx",
      "components/copilot/**/*.ts",
      "components/copilot/**/*.tsx",
      "contexts/ProjectCopilotContext.tsx",
      "hooks/useCopilotConversations.ts",
      "hooks/useCopilotStreamActions.ts",
    ],
    rules: {
      "litrev/no-improper-direct-effects": "warn",
      "litrev/no-effect-reset-choreography": "warn",
    },
  },
];

export default defaultExport;
