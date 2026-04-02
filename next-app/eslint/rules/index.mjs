import noDefaultExportExceptFramework from "./no-default-export-except-framework/index.mjs";
import noCatchConsoleError from "./no-catch-console-error/index.mjs";
import noLogAndThrowSameBlock from "./no-log-and-throw-same-block/index.mjs";
import noNewExhaustiveDepsDisable from "./no-new-exhaustive-deps-disable/index.mjs";
import noImproperDirectEffects from "./no-improper-direct-effects/index.mjs";
import noEffectResetChoreography from "./no-effect-reset-choreography/index.mjs";
import noCrossBoundaryParentImports from "./no-cross-boundary-parent-imports/index.mjs";
import filenameMatchPrimaryExport from "./filename-match-primary-export/index.mjs";
import preferAsyncAwaitInUiRuntime from "./prefer-async-await-in-ui-runtime/index.mjs";
import noPromiseChainSideEffects from "./no-promise-chain-side-effects/index.mjs";
import noWindowLocationNavigation from "./no-window-location-navigation/index.mjs";
import requireTestsForRuntimeFiles from "./require-tests-for-runtime-files/index.mjs";
import preferColocatedTestsInSelectedDomains from "./prefer-colocated-tests-in-selected-domains/index.mjs";
import noServerRuntimeConsole from "./no-server-runtime-console/index.mjs";

const defaultExport = {
  "no-default-export-except-framework": noDefaultExportExceptFramework,
  "no-catch-console-error": noCatchConsoleError,
  "no-log-and-throw-same-block": noLogAndThrowSameBlock,
  "no-new-exhaustive-deps-disable": noNewExhaustiveDepsDisable,
  "no-improper-direct-effects": noImproperDirectEffects,
  "no-effect-reset-choreography": noEffectResetChoreography,
  "no-cross-boundary-parent-imports": noCrossBoundaryParentImports,
  "filename-match-primary-export": filenameMatchPrimaryExport,
  "prefer-async-await-in-ui-runtime": preferAsyncAwaitInUiRuntime,
  "no-promise-chain-side-effects": noPromiseChainSideEffects,
  "no-window-location-navigation": noWindowLocationNavigation,
  "require-tests-for-runtime-files": requireTestsForRuntimeFiles,
  "prefer-colocated-tests-in-selected-domains": preferColocatedTestsInSelectedDomains,
  "no-server-runtime-console": noServerRuntimeConsole,
};

export default defaultExport;
