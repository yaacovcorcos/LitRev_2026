import { getEffectArguments, getEffectSignals, isHotspotEffectFile, isTestFile } from "../../shared.mjs";

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "Warn on direct effects in hot spots that look like loading, orchestration, or latest-value mirrors instead of external synchronization.",
    },
    schema: [],
    messages: {
      effectLoading: "This effect looks like loading or orchestration logic. Prefer bootstrap/resource ownership, reducers, keyed remounts, or handlers.",
      effectLatestValueMirror: "This effect looks like a latest-value ref mirror. Prefer useEffectEvent or direct render-time ref assignment in low-level infrastructure.",
    },
  },
  create(context) {
    const filename = context.filename;
    if (isTestFile(filename) || !isHotspotEffectFile(filename)) return {};

    return {
      CallExpression(node) {
        const effect = getEffectArguments(node);
        if (!effect) return;

        const signals = getEffectSignals(effect.body, context.sourceCode);
        if (signals.externalSyncSignals > 0) return;

        if (signals.asyncSignals > 0 && signals.setterCalls > 0) {
          context.report({ node, messageId: "effectLoading" });
          return;
        }

        if (signals.refAssignments > 0 && signals.setterCalls === 0 && signals.asyncSignals === 0) {
          context.report({ node, messageId: "effectLatestValueMirror" });
        }
      },
    };
  },
};
