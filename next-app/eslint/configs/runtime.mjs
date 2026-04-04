const defaultExport = [
  {
    name: "litrev/runtime-hotspots-mechanical",
    files: [
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
    ],
    rules: {
      "litrev/no-improper-direct-effects": "warn",
      "litrev/no-effect-reset-choreography": "warn",
    },
  },
];

export default defaultExport;
