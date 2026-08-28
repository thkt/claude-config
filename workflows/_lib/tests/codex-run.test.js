// Behavior tests for the Codex runner's pure seams: the strict-mode schema translation, its
// inverse, the agent-definition lookup, and the argv parse. The codex child process is never
// spawned here, so nothing in this file reaches the network.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createStubs,
  findSchemaViolation,
  loadAgent,
  MODEL_MAP,
  parseArgv,
  pruneNulls,
  strictify,
} from "../codex-run.js";

// The shape workflows/build.js's obj(required, properties) produces: required is a subset of
// properties on purpose, which is what OpenAI strict mode rejects.
const FETCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "body"],
  properties: {
    found: { type: "boolean" },
    body: { type: "string", description: "The issue body verbatim" },
    title: { type: "string", description: "The issue title verbatim" },
  },
};

test("strictify moves every declared property into required", () => {
  const out = strictify(FETCH_SCHEMA);
  assert.deepEqual(out.required, ["found", "body", "title"]);
  assert.equal(out.additionalProperties, false);
});

test("strictify makes a property outside the original required nullable", () => {
  const out = strictify(FETCH_SCHEMA);
  assert.deepEqual(out.properties.title.anyOf[1], { type: "null" });
  assert.equal(out.properties.body.type, "string");
});

test("strictify keeps an originally required property free of the null branch", () => {
  const out = strictify(FETCH_SCHEMA);
  assert.equal(out.properties.found.anyOf, undefined);
  assert.equal(out.properties.found.type, "boolean");
});

test("strictify descends into array items", () => {
  const schema = {
    type: "object",
    required: ["units"],
    properties: {
      units: {
        type: "array",
        items: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" }, note: { type: "string" } },
        },
      },
    },
  };
  const items = strictify(schema).properties.units.items;
  assert.deepEqual(items.required, ["id", "note"]);
  assert.deepEqual(items.note ?? items.properties.note.anyOf[1], { type: "null" });
});

test("strictify gives an object declared with no required list every key as nullable", () => {
  // build.js's reference_module is written this way: properties with no required list at all.
  const schema = {
    type: ["object", "null"],
    properties: { kind: { type: "string" }, reason: { type: "string" } },
  };
  const out = strictify(schema);
  const object = out.anyOf[0];
  assert.deepEqual(out.anyOf[1], { type: "null" });
  assert.deepEqual(object.required, ["kind", "reason"]);
  assert.equal(object.additionalProperties, false);
});

test("strictify adds additionalProperties false to an object that omitted it", () => {
  const out = strictify({ type: "object", properties: { a: { type: "string" } } });
  assert.equal(out.additionalProperties, false);
});

test("pruneNulls drops a null standing for a property the original left optional", () => {
  const value = pruneNulls({ found: true, body: "x", title: null }, FETCH_SCHEMA);
  assert.deepEqual(value, { found: true, body: "x" });
});

test("pruneNulls keeps a null under a property the original marked required", () => {
  const schema = {
    type: "object",
    required: ["reference_module"],
    properties: { reference_module: { type: ["object", "null"] } },
  };
  assert.deepEqual(pruneNulls({ reference_module: null }, schema), { reference_module: null });
});

test("pruneNulls descends into array items", () => {
  const schema = {
    type: "object",
    required: ["units"],
    properties: {
      units: {
        type: "array",
        items: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" }, note: { type: "string" } },
        },
      },
    },
  };
  const value = pruneNulls({ units: [{ id: "T-001", note: null }] }, schema);
  assert.deepEqual(value, { units: [{ id: "T-001" }] });
});

test("strictify and pruneNulls round-trip a response back to the shape the script expects", () => {
  strictify(FETCH_SCHEMA);
  assert.deepEqual(pruneNulls({ found: false, body: "", title: null }, FETCH_SCHEMA), {
    found: false,
    body: "",
  });
});

test("loadAgent gives general-purpose no preamble and the write sandbox", () => {
  assert.deepEqual(loadAgent("general-purpose"), { preamble: "", readOnly: false });
});

test("loadAgent reads a reviewer definition and marks it read-only", () => {
  const loaded = loadAgent("reviewer-conformance");
  assert.equal(loaded.missing, undefined);
  assert.ok(loaded.preamble.length > 0);
  assert.equal(loaded.readOnly, true);
});

test("loadAgent reports a missing definition instead of throwing", () => {
  const loaded = loadAgent("reviewer-does-not-exist");
  assert.equal(loaded.missing, true);
  assert.equal(loaded.preamble, "");
});

test("MODEL_MAP names one Codex model per tier the workflow scripts use", () => {
  assert.ok(MODEL_MAP.haiku);
  assert.ok(MODEL_MAP.sonnet);
  assert.notEqual(MODEL_MAP.haiku, MODEL_MAP.sonnet);
});

test("parseArgv reads the workflow name and the repo as an absolute path", () => {
  const { name, args } = parseArgv(["build", "--repo", "/tmp/repo", "--issue", "123"]);
  assert.equal(name, "build");
  assert.equal(args.repo, "/tmp/repo");
  assert.equal(args.issue, "123");
});

test("parseArgv rejects a flag it does not define", () => {
  assert.throws(() => parseArgv(["build", "--repo", "/tmp/repo", "--nope", "1"]), /unknown flag/);
});

test("parseArgv leaves Object.prototype untouched when --args carries a __proto__ key", () => {
  const { args } = parseArgv([
    "build",
    "--repo",
    "/tmp/repo",
    "--args",
    '{"__proto__":{"polluted":1}}',
  ]);
  assert.equal({}.polluted, undefined);
  assert.equal(args.repo, "/tmp/repo");
});

// The unit shape build.js requires: files and tests are arrays the script reads .length from,
// so a null arriving there throws inside the vm instead of taking a degradation branch.
const UNIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["units"],
  properties: {
    units: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "files"],
        properties: {
          id: { type: "string" },
          files: { type: "array", items: { type: "string" } },
          note: { type: "string" },
        },
      },
    },
  },
};

test("findSchemaViolation names a required array that came back null inside an item", () => {
  const found = findSchemaViolation({ units: [{ id: "T-001", files: null }] }, UNIT_SCHEMA);
  assert.equal(found, "units[0].files is null");
});

test("findSchemaViolation names a required key the response omitted", () => {
  const found = findSchemaViolation({ units: [{ files: [] }] }, UNIT_SCHEMA);
  assert.equal(found, "units[0].id is missing");
});

test("findSchemaViolation accepts null under a required property the schema declares nullable", () => {
  const schema = {
    type: "object",
    required: ["reference_module"],
    properties: {
      reference_module: { type: ["object", "null"], properties: { kind: { type: "string" } } },
    },
  };
  assert.equal(findSchemaViolation({ reference_module: null }, schema), "");
});

test("findSchemaViolation passes a response that fills every required field", () => {
  const value = { units: [{ id: "T-001", files: ["a.js"] }] };
  assert.equal(findSchemaViolation(value, UNIT_SCHEMA), "");
});

test("pruneNulls leaves a required null in place for findSchemaViolation to catch", () => {
  // The two run in sequence inside the agent stage: pruning removes the optional nulls, and
  // whatever null survives is the one that has to trigger a retry rather than reach the script.
  const pruned = pruneNulls({ units: [{ id: "T-001", files: null, note: null }] }, UNIT_SCHEMA);
  assert.deepEqual(pruned, { units: [{ id: "T-001", files: null }] });
  assert.equal(findSchemaViolation(pruned, UNIT_SCHEMA), "units[0].files is null");
});

test("stubs.workflow throws the message build.js's sibling() matches on an unresolved name", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "codex-run-test-"));
  try {
    const stubs = createStubs({ repo: "/tmp/repo", tmp });
    await assert.rejects(
      () => stubs.workflow("does-not-exist", {}),
      // build.js:159 tests the message for this exact substring before falling back to the
      // plugin namespace, so a reworded throw silently disables that fallback.
      (err) => err.message.includes("workflow('does-not-exist'): no workflow with that name"),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
