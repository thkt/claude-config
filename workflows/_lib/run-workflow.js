// Harness for behavior-testing workflow scripts (workflows/*.js) from node:test.
// Scripts are written as `export const meta` + top-level return + injected globals
// (agent/workflow/parallel/pipeline/phase/log), so they cannot run via ESM import.
// The production sandbox runs scripts in a realm that lacks Node globals (crypto,
// fetch, process, Buffer, ...) and replaces Date.now / Math.random / no-arg `new Date`
// with Errors, because a run has to replay across a resume boundary and cannot depend
// on wall-clock time or randomness. Running scripts here as a plain in-process
// AsyncFunction would leave Node's real globals reachable, so tests would pass while
// the same script fails at production runtime.
// A fresh node:vm context reproduces that missing-globals set structurally, and
// vm.compileFunction's `parsingContext` binds identifier lookups to that context
// instead of the host realm. The context also disallows code generation from strings
// (eval / `new Function`), matching the production sandbox's EvalError behavior.
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Errors thrown while executing inside the vm context belong to that context's own
// realm, so `err instanceof Error` (and subclasses like ReferenceError) fails for
// host-side callers even though err.message is correct. Rebuild the error with the
// host's own constructor by name so callers can instanceof-check it normally.
const ERROR_CONSTRUCTORS = {
  Error,
  TypeError,
  RangeError,
  ReferenceError,
  SyntaxError,
  EvalError,
  URIError,
};
const toHostRealmError = (err) => {
  if (err instanceof Error) return err;
  if (err && typeof err === "object" && typeof err.message === "string") {
    const Ctor = ERROR_CONSTRUCTORS[err.name] ?? Error;
    const hostErr = new Ctor(err.message);
    if (typeof err.stack === "string") hostErr.stack = err.stack;
    return hostErr;
  }
  return err;
};

// Plain objects and arrays built inside the vm context carry that context's intrinsics
// (its own Array.prototype, Object.prototype, ...), so a host-side assert.deepStrictEqual
// sees them as structurally equal but not reference-equal to a host literal and fails.
// Map, Set, Date, RegExp and Error are deliberately not special-cased. Production turns a
// workflow's return value into JSON, where each of those arrives as {} (measured). Copying
// them by type would keep in tests alone what the real run drops, which is the same
// tests-pass-production-fails split this context exists to close.
const rehome = (value, seen = new Map()) => {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const out = [];
    seen.set(value, out);
    for (const item of value) out.push(rehome(item, seen));
    return out;
  }
  const out = {};
  seen.set(value, out);
  for (const key of Object.keys(value)) out[key] = rehome(value[key], seen);
  return out;
};

// Runs once per fresh context, before the workflow script. Shadows Date / Math with
// the context's own intrinsics rather than the host's, so `extends Date` and
// `Object.create(Math, ...)` stay within one realm.
// The two messages are the production sandbox's own text, read off a minimal workflow
// run. A harness that words them differently reports a different signal than the run it
// stands in for.
const SANDBOX_SETUP_SOURCE = `
(function () {
  const OriginalDate = Date;
  const DATE_MESSAGE = "Date.now() / new Date() are unavailable in workflow scripts (breaks resume). Stamp results after the workflow returns, or pass timestamps via args.";
  const RANDOM_MESSAGE = "Math.random() is unavailable in workflow scripts (breaks resume). For N independent samples, include the index in the agent label or prompt.";
  class SandboxDate extends OriginalDate {
    constructor(...ctorArgs) {
      if (ctorArgs.length === 0) throw new Error(DATE_MESSAGE);
      super(...ctorArgs);
    }
    static now() {
      throw new Error(DATE_MESSAGE);
    }
  }
  globalThis.Date = SandboxDate;
  globalThis.Math = Object.create(Math, {
    random: {
      value: function () { throw new Error(RANDOM_MESSAGE); },
      enumerable: true,
      configurable: true,
      writable: true,
    },
  });
})();
`;

// runWorkflow(scriptPath, { args, stubs }) -> { result, calls, logs }
// stubs.agent / stubs.workflow receive (prompt|name, opts|args) and return the stub result.
// stubs.pipeline receives (items, ...stages) and replaces the default pipeline implementation.
// calls captures the agent / workflow / phase invocations.
export async function runWorkflow(scriptPath, { args = {}, stubs = {} } = {}) {
  const source = readFileSync(scriptPath, "utf8").replace(/^export const meta/m, "const meta");
  const calls = { agent: [], workflow: [], phase: [] };
  const logs = [];

  const agent = async (prompt, opts = {}) => {
    const hostPrompt = rehome(prompt);
    const hostOpts = rehome(opts);
    calls.agent.push({ prompt: hostPrompt, opts: hostOpts });
    return stubs.agent ? stubs.agent(hostPrompt, hostOpts) : undefined;
  };
  const workflow = async (name, wfArgs) => {
    const hostArgs = rehome(wfArgs);
    calls.workflow.push({ name, args: hostArgs });
    return stubs.workflow ? stubs.workflow(name, hostArgs) : undefined;
  };
  const parallel = async (tasks) =>
    Promise.all(tasks.map((t) => (typeof t === "function" ? t() : t)));
  // The default mirrors the production runtime contract: every item flows through all
  // stages as (prev, originalItem, index), and an item whose stage throws is left as
  // null at its original position (no compaction, no reordering).
  const pipeline = async (items, ...stages) => {
    if (stubs.pipeline) return stubs.pipeline(items, ...stages);
    return Promise.all(
      items.map(async (item, index) => {
        let prev = item;
        for (const stage of stages) {
          try {
            prev = await stage(prev, item, index);
          } catch {
            return null;
          }
        }
        return prev;
      }),
    );
  };
  const phase = (title) => {
    calls.phase.push(rehome(title));
  };
  const log = (message) => {
    logs.push(rehome(message));
  };

  const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(SANDBOX_SETUP_SOURCE, context, { filename: "sandbox-setup.js" });

  // vm.compileFunction produces an ordinary function, which cannot hold the top-level
  // await the script body carries. An async IIFE around the body restores both that and
  // the top-level return.
  const run = vm.compileFunction(
    `return (async () => {\n${source}\n})();`,
    ["args", "agent", "workflow", "parallel", "pipeline", "phase", "log"],
    { parsingContext: context, filename: scriptPath },
  );

  try {
    const result = await run(args, agent, workflow, parallel, pipeline, phase, log);
    return { result: rehome(result), calls, logs };
  } catch (err) {
    throw toHostRealmError(err);
  }
}
