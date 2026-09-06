/// <reference types="node" />
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

// Values that cross the vm boundary (a script's args, return value, and what it hands to the
// injected globals) take their shape at run time from the script under test, so they are typed
// as `any` at that boundary alone.
type ScriptValue = any;

export interface RunWorkflowStubs {
  agent?: (prompt: ScriptValue, opts: ScriptValue) => unknown;
  workflow?: (name: string, args: ScriptValue) => unknown;
  pipeline?: (items: ScriptValue[], ...stages: PipelineStage[]) => unknown;
}

type PipelineStage = (prev: ScriptValue, item: ScriptValue, index: number) => unknown;

export interface RunWorkflowOptions {
  args?: ScriptValue;
  stubs?: RunWorkflowStubs;
  onLog?: (message: ScriptValue) => void;
  onPhase?: (title: ScriptValue) => void;
}

interface RunWorkflowCalls {
  agent: { prompt: ScriptValue; opts: ScriptValue }[];
  workflow: { name: string; args: ScriptValue }[];
  phase: ScriptValue[];
}

export interface RunWorkflowResult {
  result: ScriptValue;
  calls: RunWorkflowCalls;
  logs: ScriptValue[];
}

interface WorkflowMeta {
  name: string;
  description: string;
  whenToUse?: string;
  phases?: { title: string; detail?: string }[];
}

// The globals production supplies on top of the injected parameters, listed in
// rules/conventions/WORKFLOWS.md § Script evaluation form. Adding a name here does not
// create the injection, so the suite goes red until the supply below is written too.
export const PRODUCTION_GLOBALS = ["budget", "console", "setTimeout", "clearTimeout"];

// Errors thrown while executing inside the vm context belong to that context's own
// realm, so `err instanceof Error` (and subclasses like ReferenceError) fails for
// host-side callers even though err.message is correct. Rebuild the error with the
// host's own constructor by name so callers can instanceof-check it normally.
const ERROR_CONSTRUCTORS: Record<string, ErrorConstructor> = {
  Error,
  TypeError,
  RangeError,
  ReferenceError,
  SyntaxError,
  EvalError,
  URIError,
};
const toHostRealmError = (err: unknown): unknown => {
  if (err instanceof Error) return err;
  if (
    err &&
    typeof err === "object" &&
    typeof (err as { message?: unknown }).message === "string"
  ) {
    const foreign = err as { name?: unknown; message: string; stack?: unknown };
    const Ctor = ERROR_CONSTRUCTORS[String(foreign.name)] ?? Error;
    const hostErr = new Ctor(foreign.message);
    if (typeof foreign.stack === "string") hostErr.stack = foreign.stack;
    return hostErr;
  }
  return err;
};

// The own properties production leaves on an error it hands to the script, in the order it
// writes them. Measured: the object's prototype is null, so `e instanceof
// Error` is false there and cause, errors and any custom property are gone. Handing a script
// the host Error itself would let it branch on instanceof under test and take the other branch
// in production.
export const SCRIPT_ERROR_KEYS = ["name", "message", "stack", "toString"] as const;

// A non-Error throw is left as it is: what production does with one was not measured.
const toScriptRealmError = (err: unknown): unknown => {
  if (!(err instanceof Error)) return err;
  const supply: Record<(typeof SCRIPT_ERROR_KEYS)[number], unknown> = {
    name: err.name,
    message: err.message,
    stack: typeof err.stack === "string" ? err.stack : `${err.name}: ${err.message}`,
    toString: () => `${err.name}: ${err.message}`,
  };
  const shim: Record<string, unknown> = Object.create(null);
  for (const key of SCRIPT_ERROR_KEYS) shim[key] = supply[key];
  return shim;
};

// Every injected global is a host function called from vm code, so each is a place a host error
// can reach the script.
const asProductionThrow =
  <A extends unknown[], R>(fn: (...callArgs: A) => R) =>
  (...callArgs: A): R => {
    try {
      const out = fn(...callArgs);
      return out instanceof Promise
        ? (out.catch((err: unknown) => {
            throw toScriptRealmError(err);
          }) as R)
        : out;
    } catch (err) {
      throw toScriptRealmError(err);
    }
  };

// Plain objects and arrays built inside the vm context carry that context's intrinsics
// (its own Array.prototype, Object.prototype, ...), so a host-side assert.deepStrictEqual
// sees them as structurally equal but not reference-equal to a host literal and fails.
// Map, Set, Date, RegExp and Error are deliberately not special-cased. Production turns a
// workflow's return value into JSON, where each of those arrives as {} (measured). Copying
// them by type would keep in tests alone what the real run drops, which is the same
// tests-pass-production-fails split this context exists to close.
const rehome = (value: ScriptValue, seen = new Map<object, ScriptValue>()): ScriptValue => {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const out: ScriptValue[] = [];
    seen.set(value, out);
    for (const item of value) out.push(rehome(item, seen));
    return out;
  }
  const out: Record<string, ScriptValue> = {};
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

const partToString = (part: unknown): string => {
  if (typeof part === "string") return part;
  try {
    return JSON.stringify(part);
  } catch {
    return `[${typeof part}]`;
  }
};

// Quote-aware, because a brace written inside a string literal need not be balanced and a plain
// depth count would then close on the wrong one. meta's prose carries such braces.
const matchBrace = (source: string, start: number): number => {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error(`${start}: unterminated brace`);
};

// Not an import of the module: a workflow script's top-level return and its references to
// injected globals would run, and only the meta literal is wanted here. Not `new Function`
// either, which the plan named: the guardrails gate blocks every such call site with no
// per-site opt-out, so this reuses the vm.compileFunction that checkWorkflowSyntax below
// already compiles isolated strings with.
export function readMeta(scriptPath: string): WorkflowMeta {
  const source = readFileSync(scriptPath, "utf8");
  const marker = "export const meta = {";
  const markerIdx = source.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error(`${scriptPath}: no "export const meta = {" found`);
  }
  const braceStart = source.indexOf("{", markerIdx);
  const braceEnd = matchBrace(source, braceStart);
  const literal = source.slice(braceStart, braceEnd + 1);
  const evaluate = vm.compileFunction(`return (${literal});`, [], { filename: scriptPath });
  return evaluate() as WorkflowMeta;
}

// A workflow script is neither ESM nor CommonJS: it is a function body holding a top-level
// return. `node --check` therefore reads it under whichever module goal package.json names
// and rejects that return once the repository declares `type: module`. Compiling it the way
// production does asks the only question a syntax gate should ask of these files.
export function checkWorkflowSyntax(scriptPath: string): void {
  const source = readFileSync(scriptPath, "utf8").replace(/^export const meta/m, "const meta");
  vm.compileFunction(
    `return (async () => {\n${source}\n})();`,
    ["args", "agent", "workflow", "parallel", "pipeline", "phase", "log"],
    { filename: scriptPath },
  );
}

// runWorkflow(scriptPath, { args, stubs, onLog, onPhase }) -> { result, calls, logs }
// stubs.agent / stubs.workflow receive (prompt|name, opts|args) and return the stub result.
// stubs.pipeline receives (items, ...stages) and replaces the default pipeline implementation.
// calls captures the agent / workflow / phase invocations.
// onLog / onPhase mirror each log() and phase() call as the run makes it, for a caller driving
// a real run that cannot wait for the returned arrays. Both default to no-op, so a caller that
// omits them observes exactly what it observed before they existed.
export async function runWorkflow(
  scriptPath: string,
  options: RunWorkflowOptions = {},
): Promise<RunWorkflowResult> {
  const { args = {}, stubs = {}, onLog = () => {}, onPhase = () => {} } = options;
  const source = readFileSync(scriptPath, "utf8").replace(/^export const meta/m, "const meta");
  const calls: RunWorkflowCalls = { agent: [], workflow: [], phase: [] };
  const logs: ScriptValue[] = [];
  // A caller's own reporting must not decide whether the workflow keeps running, so a throw
  // from onLog / onPhase is dropped here rather than surfacing inside the script.
  const mirror = (notify: (value: ScriptValue) => void) => (value: ScriptValue) => {
    try {
      notify(value);
    } catch {
      /* the run continues */
    }
  };
  const notifyPhase = mirror(onPhase);
  const notifyLog = mirror(onLog);

  const agent = asProductionThrow(async (prompt: ScriptValue, opts: ScriptValue = {}) => {
    const hostPrompt = rehome(prompt);
    const hostOpts = rehome(opts);
    calls.agent.push({ prompt: hostPrompt, opts: hostOpts });
    return stubs.agent ? stubs.agent(hostPrompt, hostOpts) : undefined;
  });
  const workflow = asProductionThrow(async (name: string, wfArgs: ScriptValue) => {
    const hostArgs = rehome(wfArgs);
    calls.workflow.push({ name, args: hostArgs });
    return stubs.workflow ? stubs.workflow(name, hostArgs) : undefined;
  });
  // The production contract both of these mirror: a thunk or stage that throws is left as null
  // at its own index, no compaction, no reordering, and the call itself never rejects.
  // Promise.all rejected the whole call, so a script whose thunk throws failed under test and
  // ran in production (#434).
  const parallel = asProductionThrow(async (tasks: ScriptValue[]) =>
    Promise.all(
      tasks.map(async (t) => {
        try {
          return await (typeof t === "function" ? t() : t);
        } catch {
          return null;
        }
      }),
    ),
  );
  // Each item flows through all stages as (prev, originalItem, index).
  const pipeline = asProductionThrow(async (items: ScriptValue[], ...stages: PipelineStage[]) => {
    if (stubs.pipeline) return stubs.pipeline(items, ...stages);
    return Promise.all(
      items.map(async (item, index) => {
        let prev: ScriptValue = item;
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
  });
  const phase = asProductionThrow((title: ScriptValue) => {
    const hostTitle = rehome(title);
    calls.phase.push(hostTitle);
    notifyPhase(hostTitle);
  });
  const log = asProductionThrow((message: ScriptValue) => {
    const hostMessage = rehome(message);
    logs.push(hostMessage);
    notifyLog(hostMessage);
  });

  // The supply side of PRODUCTION_GLOBALS. budget holds the state of a run with no token
  // target, production's default, so a script branching on budget.total takes the same path
  // here. console lands in logs the way log() does, because a console writing anywhere else
  // lets a script log through a run where nothing it wrote is observable.
  const consoleWrite =
    (prefix: string) =>
    (...parts: unknown[]) =>
      logs.push(prefix + parts.map(partToString).join(" "));
  const context = vm.createContext(
    {
      budget: { total: null, spent: () => 0, remaining: () => Infinity },
      console: {
        log: consoleWrite(""),
        info: consoleWrite(""),
        debug: consoleWrite(""),
        warn: consoleWrite("[warn] "),
        error: consoleWrite("[error] "),
      },
      setTimeout,
      clearTimeout,
    },
    { codeGeneration: { strings: false, wasm: false } },
  );
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
