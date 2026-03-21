import base from "./base.mjs";
import phase1 from "./phase1.mjs";
import ui from "./ui.mjs";
import runtime from "./runtime.mjs";
import server from "./server.mjs";
import tests from "./tests.mjs";

export { base, phase1, ui, runtime, server, tests };

export default [base, ...phase1, ui, ...runtime, server, tests];
