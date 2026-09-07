/// <reference types="node" />
// Runs a workflow script (workflows/<name>.js) on Codex.
//
// Claude Code supplies agent() from its own subagent runtime. Codex has no equivalent, so
// each agent() call becomes one `codex exec` child process here. The rest of the evaluation
// form -- the vm context, the banned Date / Math globals, parallel and pipeline semantics --
// is reused from run-workflow.ts, which already reproduces what production does.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./entry-point.ts";
import { runWorkflow } from "./run-workflow.ts";
import type { RunWorkflowStubs } from "./run-workflow.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The subset of JSON Schema the workflow scripts write (workflows/build.js's obj(required,
// properties) and its siblings). Anything else is carried through untouched.
interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  description?: string;
  anyOf?: JsonSchema[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

// A value parsed from codex's JSON reply, or handed in by a workflow script across the vm
// boundary: its shape is decided at run time, so it is typed as `any` at that boundary alone.
type JsonValue = any;

type AgentOptions = {
  label?: string;
  agentType?: string;
  model?: string;
  effort?: string;
  schema?: JsonSchema;
};

// build.js and code.js name only haiku and sonnet. The three tiers line up with Codex's
// current-generation coding models; one CODEX_MODEL_<TIER> variable overrides one entry.
export const MODEL_MAP: Record<string, string> = {
  haiku: process.env.CODEX_MODEL_HAIKU || "gpt-5.6-luna",
  sonnet: process.env.CODEX_MODEL_SONNET || "gpt-5.6-terra",
  opus: process.env.CODEX_MODEL_OPUS || "gpt-5.6-sol",
};

const DEFAULT_EFFORT = process.env.CODEX_EFFORT || "medium";
// A stage that writes code takes longer than one that relays a value, so the ceiling is set
// for the slowest stage rather than per label.
const DEFAULT_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 1_800_000);
// Claude caps in-process agents at min(16, cpus - 2). Child processes carry no such cap, so
// pipeline() over a long unit list would spawn one codex per unit at once without this.
const DEFAULT_CONCURRENCY = Math.max(1, Math.min(16, availableParallelism() - 2));
// One retry, because the failures worth retrying (a dropped connection, a response that
// misses the schema) do not repeat on every attempt.
const ATTEMPTS = 2;

// ---- Schema translation ----------------------------------------------------------------
// codex exec --output-schema runs OpenAI structured outputs in strict mode, which rejects a
// schema whose `required` omits any declared property:
//   'required' is required to be supplied and to be an array including every key in properties.
// The workflow scripts write `required` as a subset on purpose (obj(required, properties)),
// so every optional property is made required and nullable here instead, and the nulls are
// dropped again before the value reaches the script.

const NULL_SCHEMA: JsonSchema = { type: "null" };
const nullable = (schema: JsonSchema): JsonSchema => ({ anyOf: [schema, NULL_SCHEMA] });

const typeList = (type: JsonSchema["type"]): string[] =>
  Array.isArray(type) ? type : type === undefined ? [] : [type];

// A schema declaring neither a type nor a shape constrains nothing, so a null under it is a
// value rather than a violation.
const acceptsNull = (schema: JsonSchema | undefined): boolean => {
  if (!schema || typeof schema !== "object") return true;
  if (typeList(schema.type).includes("null")) return true;
  return schema.type === undefined && !schema.properties && !schema.items;
};

const described = (schema: JsonSchema, description: string | undefined): JsonSchema =>
  description ? { ...schema, description } : schema;

// An object or array schema that also declared null keeps that branch around the rewritten form.
const keepNullBranch = (
  out: JsonSchema,
  includesNull: boolean,
  description: string | undefined,
): JsonSchema => (includesNull ? described(nullable(out), description) : out);

export function strictify(schema: JsonSchema): JsonSchema;
export function strictify(schema: JsonSchema | undefined): JsonSchema | undefined;
export function strictify(schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!schema || typeof schema !== "object") return schema;

  const types = typeList(schema.type);
  const typeIncludesNull = types.includes("null");
  const bare = types.filter((t) => t !== "null");

  if (bare.includes("object") || schema.properties) {
    const properties: Record<string, JsonSchema> = {};
    const originallyRequired = new Set(schema.required || []);
    for (const [key, value] of Object.entries(schema.properties || {})) {
      const translated = strictify(value);
      properties[key] = originallyRequired.has(key) ? translated : nullable(translated);
    }
    const out = described(
      {
        type: "object",
        additionalProperties: false,
        required: Object.keys(properties),
        properties,
      },
      schema.description,
    );
    return keepNullBranch(out, typeIncludesNull, schema.description);
  }

  if (bare.includes("array")) {
    const out = described({ type: "array", items: strictify(schema.items) }, schema.description);
    return keepNullBranch(out, typeIncludesNull, schema.description);
  }

  if (!typeIncludesNull) return { ...schema };
  const scalar: JsonSchema = { ...schema, type: bare.length === 1 ? bare[0] : bare };
  return described(nullable(scalar), schema.description);
}

// The inverse of the optional-to-nullable rewrite: a null standing where the original schema
// declared an optional property is the absence the script expects, so the key is removed. A
// null under a property the original marked required is a real value and stays.
export function pruneNulls(value: JsonValue, schema: JsonSchema | undefined): JsonValue {
  if (!schema || typeof schema !== "object" || value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    if (!schema.items) return value;
    return value.map((item) => pruneNulls(item, schema.items));
  }

  const types = typeList(schema.type);
  if (types.includes("object") || schema.properties) {
    const required = new Set(schema.required || []);
    const out: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child === null && !required.has(key)) continue;
      out[key] = pruneNulls(child, (schema.properties || {})[key]);
    }
    return out;
  }
  return value;
}

// Strict mode makes every property required and nullable, so the API is free to answer null
// where the original schema requires a value. A null reaching the script is not the absence
// the script branches on: build.js's oversizedUnits reads u.files.length, and a null there
// throws inside the vm as a run failure rather than a recorded degradation. This walks the
// original schema and names the first such spot, which the caller turns into a retry.
export function findSchemaViolation(
  value: JsonValue,
  schema: JsonSchema | undefined,
  path = "",
): string {
  if (!schema || typeof schema !== "object") return "";
  const here = path || "the response";
  const types = typeList(schema.type);

  if (types.includes("array") || schema.items) {
    if (value === null) return acceptsNull(schema) ? "" : `${here} is null`;
    if (!Array.isArray(value)) return `${here} is not an array`;
    for (let index = 0; index < value.length; index++) {
      const found = findSchemaViolation(value[index], schema.items, `${here}[${index}]`);
      if (found) return found;
    }
    return "";
  }

  if (types.includes("object") || schema.properties) {
    if (value === null) return acceptsNull(schema) ? "" : `${here} is null`;
    if (typeof value !== "object") return `${here} is not an object`;
    const properties = schema.properties || {};
    for (const key of schema.required || []) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in value)) return `${childPath} is missing`;
      if (value[key] === null && !acceptsNull(properties[key])) return `${childPath} is null`;
    }
    for (const [key, child] of Object.entries(value)) {
      const found = findSchemaViolation(child, properties[key], path ? `${path}.${key}` : key);
      if (found) return found;
    }
    return "";
  }

  if (value === null && !acceptsNull(schema)) return `${here} is null`;
  return "";
}

// ---- Prompt assembly --------------------------------------------------------------------
// Every string codex reads is built here, so changing what an agent is told does not mean
// reading through the stage loop.

// The agent definition carries the behavior and the workflow script carries the task. The rule
// keeps them apart so the model does not read the task as one more clause of the behavior.
const withPreamble = (preamble: string, prompt: string): string =>
  preamble ? `${preamble}\n\n---\n\n${prompt}` : prompt;

// findSchemaViolation names a required field that came back missing or null, so the retry asks
// for that field to be filled. Asking instead for extra fields to be dropped answers a
// violation the strict-mode schema cannot produce.
const schemaCorrection = (reason: string): string =>
  `\n\nThe previous attempt returned a value that did not fit the output schema (${reason}). ` +
  `Answer again with every declared field filled, using null only where the schema allows it.`;

// ---- Agent definitions -----------------------------------------------------------------
// agentType names a Claude Code subagent. general-purpose is a Claude Code built-in with no
// file in this repository, and a bare `codex exec` was measured returning a 611-character
// issue body verbatim under a strict schema, so that type takes no preamble. The rest carry
// their behavior in agents/**/<name>.md, whose body becomes the preamble.

const WRITE_TOOLS = /\b(Edit|Write|NotebookEdit|MultiEdit)\b/;

interface LoadedAgent {
  preamble: string;
  readOnly: boolean;
  missing?: boolean;
}

let agentIndex: Map<string, string> | null = null;
const indexAgents = (): Map<string, string> => {
  if (agentIndex) return agentIndex;
  const index = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) index.set(entry.name.replace(/\.md$/, ""), full);
    }
  };
  const agentsDir = join(ROOT, "agents");
  if (existsSync(agentsDir)) walk(agentsDir);
  agentIndex = index;
  return index;
};

export function loadAgent(agentType: string | undefined): LoadedAgent {
  if (!agentType || agentType === "general-purpose") return { preamble: "", readOnly: false };
  const path = indexAgents().get(agentType);
  // A missing definition is not a reason to stop the run, so the stage proceeds with the
  // prompt alone and the caller logs the loss.
  if (!path) return { preamble: "", readOnly: false, missing: true };

  const source = readFileSync(path, "utf8");
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const frontmatter = match ? match[1] : "";
  const body = match ? match[2] : source;
  const tools = (frontmatter.match(/^tools:\s*(.*)$/m) || [])[1] || "";
  // Codex cannot enforce a per-tool allowlist. A definition granting no write tool runs under
  // the read-only sandbox, which is the closest approximation of that allowlist.
  return { preamble: body.trim(), readOnly: Boolean(tools) && !WRITE_TOOLS.test(tools) };
}

// ---- codex exec ------------------------------------------------------------------------

interface CodexRunSpec {
  prompt: string;
  model: string;
  effort: string;
  schemaPath: string;
  outPath: string;
  sandbox: string;
  cwd: string;
  timeoutMs: number;
}

interface CodexRunOutcome {
  code: number | null;
  stderr: string;
  timedOut: boolean;
}

const runCodexOnce = ({
  prompt,
  model,
  effort,
  schemaPath,
  outPath,
  sandbox,
  cwd,
  timeoutMs,
}: CodexRunSpec): Promise<CodexRunOutcome> =>
  new Promise((done) => {
    const argv = [
      "exec",
      "--skip-git-repo-check",
      "-C",
      cwd,
      "-s",
      sandbox,
      "-c",
      'approval_policy="never"',
      "-m",
      model,
      "-c",
      `model_reasoning_effort="${effort}"`,
    ];
    // gh and git push reach the network, which the workspace-write sandbox blocks by default.
    if (sandbox === "workspace-write") {
      argv.push("-c", "sandbox_workspace_write.network_access=true");
    }
    if (schemaPath) argv.push("--output-schema", schemaPath);
    // `-` reads the prompt from stdin, which keeps an issue body or a JSON payload off argv.
    argv.push("-o", outPath, "-");

    const child = spawn("codex", argv, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", () => {});
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      done({ code: -1, stderr: String(err.message), timedOut: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, stderr: stderr.slice(-4000), timedOut });
    });

    child.stdin?.end(prompt);
  });

// ---- Runner ----------------------------------------------------------------------------

const makeSlots = (limit: number) => {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await task();
    } finally {
      active--;
      const next = waiting.shift();
      if (next) next();
    }
  };
};

// stubs.workflow and runOnCodex both need the path a name resolves to, and the same missing-name
// message build.js's sibling() matches on, so both go through this rather than repeating either.
const resolveWorkflowPath = (name: string): string => {
  const path = join(ROOT, "workflows", `${name}.js`);
  if (!existsSync(path)) throw new Error(`workflow('${name}'): no workflow with that name`);
  return path;
};

interface CreateStubsOptions {
  repo: string;
  concurrency?: number;
  onLog?: (message: string) => void;
  tmp: string;
}

// The pool belongs to one createStubs call. stubs.workflow hands the same stubs object to the
// nested run, so build and the code workflow it nests share one pool; two concurrent
// runOnCodex calls would each hold their own and the cap would apply twice.
export function createStubs({
  repo,
  concurrency = DEFAULT_CONCURRENCY,
  onLog = () => {},
  tmp,
}: CreateStubsOptions): RunWorkflowStubs {
  const withSlot = makeSlots(concurrency);
  const stubs: RunWorkflowStubs = {};
  let serial = 0;

  stubs.agent = async (prompt: string, opts: AgentOptions = {}) =>
    withSlot(async () => {
      const id = ++serial;
      const label = opts.label || opts.agentType || "agent";
      const { preamble, readOnly, missing } = loadAgent(opts.agentType);
      if (missing) {
        onLog(`[${label}] agents/${opts.agentType}.md is missing; running with no preamble.`);
      }

      const model = (opts.model && MODEL_MAP[opts.model]) || MODEL_MAP.sonnet;
      const effort = opts.effort || DEFAULT_EFFORT;
      const sandbox = readOnly ? "read-only" : "workspace-write";
      const schemaPath = opts.schema ? join(tmp, `schema-${id}.json`) : "";
      const outPath = join(tmp, `out-${id}.json`);
      if (opts.schema) writeFileSync(schemaPath, JSON.stringify(strictify(opts.schema)));

      const base = withPreamble(preamble, prompt);
      let correction = "";

      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        onLog(`[${label}] codex ${model}/${effort} ${sandbox} (attempt ${attempt}/${ATTEMPTS})`);
        const run = await runCodexOnce({
          prompt: base + correction,
          model,
          effort,
          schemaPath,
          outPath,
          sandbox,
          cwd: repo,
          timeoutMs: DEFAULT_TIMEOUT_MS,
        });

        if (run.timedOut) {
          correction = "";
          onLog(`[${label}] killed at ${DEFAULT_TIMEOUT_MS} ms.`);
          continue;
        }
        if (run.code !== 0) {
          correction = "";
          const tail = run.stderr.split("\n").slice(-3).join(" ");
          onLog(`[${label}] codex exited ${run.code}. ${tail}`);
          continue;
        }

        let raw = "";
        try {
          raw = readFileSync(outPath, "utf8");
        } catch {
          onLog(`[${label}] codex wrote no final message.`);
          continue;
        }
        if (!opts.schema) return raw.trim();

        try {
          const value = pruneNulls(JSON.parse(raw), opts.schema);
          const violation = findSchemaViolation(value, opts.schema);
          if (violation) throw new Error(violation);
          return value;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          onLog(`[${label}] response did not fit the schema: ${message}`);
          correction = schemaCorrection(message);
        }
      }
      // The Agent tool returns null when a subagent dies after its retries, and the workflow
      // scripts branch on that null, so the same value is returned rather than a throw.
      onLog(`[${label}] gave up after ${ATTEMPTS} attempts; the stage returns null.`);
      return null;
    });

  // build.js's sibling() falls back to the plugin namespace only when the message matches this
  // shape, so an unresolved name throws it verbatim rather than returning undefined.
  stubs.workflow = async (name: string, wfArgs: JsonValue) => {
    const path = resolveWorkflowPath(name);
    onLog(`[workflow] ${name}`);
    const nested = await runWorkflow(path, {
      args: wfArgs,
      stubs,
      onLog,
      onPhase: (title) => onLog(`== ${name}: ${title}`),
    });
    return nested.result;
  };

  return stubs;
}

interface RunOnCodexArgs {
  repo: string;
  [key: string]: unknown;
}

interface RunOnCodexOptions {
  concurrency?: number;
  onLog?: (message: string) => void;
}

async function runOnCodex(
  name: string,
  args: RunOnCodexArgs,
  { concurrency, onLog = () => {} }: RunOnCodexOptions = {},
): Promise<JsonValue> {
  const path = resolveWorkflowPath(name);
  const tmp = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "codex-run-"));
  try {
    const stubs = createStubs({ repo: args.repo, concurrency, onLog, tmp });
    const { result } = await runWorkflow(path, {
      args,
      stubs,
      onLog,
      onPhase: (title) => onLog(`== ${title}`),
    });
    return result;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---- CLI --------------------------------------------------------------------------------

// --args carries whatever the caller typed, so its keys are copied one by one onto a
// null-prototype target rather than merged, which keeps a "__proto__" key a plain own
// property instead of a write through the prototype chain.
const mergeArgs = (target: Record<string, unknown>, source: unknown): void => {
  if (!source || typeof source !== "object") return;
  for (const key of Object.keys(source)) target[key] = (source as Record<string, unknown>)[key];
};

interface ParsedArgv {
  name: string | undefined;
  args: Record<string, unknown>;
  concurrency: number | undefined;
}

export function parseArgv(argv: string[]): ParsedArgv {
  const [name, ...rest] = argv;
  const args: Record<string, unknown> = Object.create(null);
  let concurrency: number | undefined;
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === "--repo") args.repo = resolve(value);
    else if (flag === "--issue") args.issue = value;
    else if (flag === "--base") args.base = value;
    else if (flag === "--concurrency") concurrency = Number(value);
    else if (flag === "--args") mergeArgs(args, JSON.parse(value));
    else throw new Error(`unknown flag: ${flag}`);
    i++;
  }
  return { name, args, concurrency };
}

if (isMainModule(import.meta.url)) {
  const { name, args, concurrency } = parseArgv(process.argv.slice(2));
  if (!name || typeof args.repo !== "string") {
    process.stderr.write(
      "usage: node workflows/_lib/codex-run.ts <workflow> --repo <abs path> " +
        "[--issue N] [--base B] [--concurrency N] [--args <json>]\n",
    );
    process.exit(2);
  }
  const result = await runOnCodex(
    name,
    { ...args, repo: args.repo },
    {
      concurrency,
      onLog: (message) => process.stderr.write(`${message}\n`),
    },
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
