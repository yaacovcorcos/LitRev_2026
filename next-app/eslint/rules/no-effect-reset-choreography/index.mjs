import { getEffectArguments, getEffectSignals, isHotspotEffectFile, isTestFile } from "../../shared.mjs";

const defaultExport = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn on effects that reset local state in response to identity changes.",
    },
    schema: [],
    messages: {
      resetChoreography: "This effect looks like reset choreography on identity change. Prefer keyed remounts, reducer-owned transitions, or narrower state ownership.",
    },
  },
  create(context) {
    const filename = context.filename;
    if (isTestFile(filename) || !isHotspotEffectFile(filename)) return {};

    return {
      CallExpression(node) {
        const effect = getEffectArguments(node);
        if (!effect || effect.deps?.type !== "ArrayExpression" || effect.deps.elements.length === 0) return;
        const signals = getEffectSignals(effect.body, context.sourceCode);
        if (signals.externalSyncSignals > 0) return;
        if (signals.setterCalls >= 2 || (signals.setterCalls >= 1 && signals.emptySetterCalls >= 1)) {
          context.report({ node, messageId: "resetChoreography" });
        }
      },
    };
  },
};

export default defaultExport;
