import base from "./base.mjs";
import ui from "./ui.mjs";
import runtime from "./runtime.mjs";
import server from "./server.mjs";
import tests from "./tests.mjs";

export { base, ui, runtime, server, tests };

export default [base, ui, ...runtime, server, tests];
