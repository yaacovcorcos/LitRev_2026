import { isHotspotEffectFile, isTestFile } from "../../shared.mjs";

const EXHAUSTIVE_DEPS_RE = /react-hooks\/exhaustive-deps/;

export default {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow new exhaustive-deps disable comments in hot-spot runtime files.",
    },
    schema: [],
    messages: {
      noDisable: "Do not suppress react-hooks/exhaustive-deps in this hot-spot file. Refactor the effect or extract a clearer ownership boundary instead.",
    },
  },
  create(context) {
    const filename = context.filename;
    if (isTestFile(filename) || !isHotspotEffectFile(filename)) return {};

    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (EXHAUSTIVE_DEPS_RE.test(comment.value)) {
            context.report({
              loc: comment.loc,
              messageId: "noDisable",
            });
          }
        }
      },
    };
  },
};
