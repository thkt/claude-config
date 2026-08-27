import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// The phrasing that hands an issue to build, in either language. A routing table's destination
// cell carries no prose particles, so the row-start alternative catches it, and anchoring there
// keeps a passing mention such as "the build workflow's Revalidate" out. `/build` is listed
// because naming the slash command hands an issue over as much as writing the words out.
const HANDOFF =
  /build workflow に|build に渡|build に委譲|build へ|to the build workflow|delegate to build|`\/build`|^\|\s*(The )?build workflow/;
// qualify branches on the presence of a Plan section earlier in its verdict table, so by the
// time the build-ready row is reached the Plan section is already established. issue settles the
// plan at Phase 1: a step there suggests /think before the body is written, which its own
// skill-contract test pins, so its routing table states the destination and nothing else.
const EXEMPT = new Set(["qualify", "issue"]);

const skillDocs = () => {
  const docs = [];
  for (const prefix of ["", ".ja"]) {
    const base = join(root, prefix, "skills");
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || EXEMPT.has(entry.name)) continue;
      const path = join(base, entry.name, "SKILL.md");
      if (existsSync(path)) docs.push({ lang: prefix || "en", name: entry.name, path });
    }
  }
  return docs;
};

// build hands an issue with no ## Plan section back as no-plan. When the skill doing the handoff
// does not say so, whoever followed that instruction stops at the Load stage. A missing wording
// drops nothing at runtime, so only a static match catches it.
test("the handoff instruction names the Plan section on the same line", () => {
  const docs = skillDocs();
  assert.ok(docs.length > 0, "the skill SKILL.md files are readable");

  const missing = [];
  for (const { lang, name, path } of docs) {
    for (const [i, line] of readFileSync(path, "utf8").split("\n").entries()) {
      if (!HANDOFF.test(line)) continue;
      if (/Plan|plan/.test(line)) continue;
      missing.push(`${lang}:${name}:${i + 1}: ${line.trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `a handoff instruction does not name the Plan section\n${missing.join("\n")}`,
  );
});

// An exemption rests on the skill settling the plan somewhere else. When that somewhere else is
// deleted, the exemption keeps the skill out of the check above and nothing reports it.
test("every exempt skill still settles the plan elsewhere", () => {
  for (const name of EXEMPT) {
    for (const prefix of ["", ".ja"]) {
      const path = join(root, prefix, "skills", name, "SKILL.md");
      if (!existsSync(path)) continue;
      const doc = readFileSync(path, "utf8");
      assert.match(doc, /## Plan/, `${prefix || "en"}:${name}: it still names the Plan section`);
      assert.match(
        doc,
        /\/think/,
        `${prefix || "en"}:${name}: it still routes a plan-less issue to /think`,
      );
    }
  }
});

// ---- U-004: Load / conformance / Ship read the gh-vs-mcp route judgment from one shared
// script const, in both language trees, instead of each carrying its own copy that can drift. ----

const buildJs = join(root, "workflows", "build.js");
const jaBuildJs = join(root, ".ja", "workflows", "build.js");
const repo = "/abs/target-repo";
const args = { issue: "123", repo };

// An issue body carrying a Plan section, minimal enough to clear extract's non-empty check
// (extract itself is stubbed below, so its content never actually reaches a parser).
const bodyFor = (unitIds, testIds) =>
  [
    "Background on the issue.",
    "",
    "## Plan",
    "",
    ...unitIds.map((u) => `### ${u}: unit heading`),
    ...testIds.map((t) => `- ${t}: test scenario`),
    "",
    "test_command: echo test",
    "",
  ].join("\n");

// An extracted plan clearing build's validate() and its non-empty content check. kind:
// "no-module" skips the structure-review agent, and matching precondition results below skip
// the revalidate2 retry, so the happy path reaches Ship with the smallest agent set.
const makePlan = () => ({
  outcome: "sample outcome",
  decisions: [],
  units: [
    {
      id: "U-001",
      goal: "sample goal",
      files: ["sample.js"],
      contract: "sample contract",
      tests: [{ id: "T-001", name: "sample spec statement" }],
    },
  ],
  test_command: "echo test",
  preconditions: [{ path: "sample.js", pattern: "sampleSymbol" }],
  reference_module: { kind: "no-module", reason: "sample reason" },
  backlog_candidates: [],
});

// Classifies an agent call by the shape of its schema rather than by its label string, which
// would couple this fixture to wording either language tree is free to reword (build.js and
// .ja/workflows/build.js share identical schemas; only the prompt prose differs between them).
const kindOf = (opts) => {
  const p = (opts && opts.schema && opts.schema.properties) || null;
  if (!p) return "plain";
  if ("run_id" in p) return "record";
  if ("found" in p && "body" in p) return "fetch";
  if ("units" in p) return "extract";
  if ("results" in p) {
    const item = (p.results.items && p.results.items.properties) || {};
    return "name" in item ? "presence" : "revalidate";
  }
  if ("branch" in p) return "branch";
  if ("untracked" in p) return "untracked";
  if ("files" in p) return "diff";
  if ("edits" in p) return "cleanup";
  if ("spec_found" in p) return "conformance";
  if ("pr_url" in p) return "ship";
  return "plain";
};

// The full happy-path stub set carrying a run from Load through Ship. Schema shapes are
// identical across both language trees, so this one fixture drives both.
const makeHandoffStubs = () => ({
  agent: (prompt, opts) => {
    switch (kindOf(opts)) {
      case "record":
        return { path: "/home/sample/.claude/history/build-runs.jsonl", run_id: "a1b2c3d4e5f6" };
      case "fetch":
        return { found: true, body: bodyFor(["U-001"], ["T-001"]) };
      case "extract":
        return makePlan();
      case "revalidate":
        return {
          results: [{ path: "sample.js", pattern: "sampleSymbol", exists: true, matches: true }],
        };
      case "diff":
        return { files: ["sample.js"] };
      case "presence": {
        const checks = JSON.parse(prompt.trim().split("\n").pop());
        return {
          results: checks.flatMap((c) => c.names.map((name) => ({ name, found: true }))),
        };
      }
      case "branch":
        return { branch: "feat/sample-branch", head: "a1b2c3d4e5f6a7b8", ahead_of_base: 0 };
      case "untracked":
        return { untracked: [] };
      case "cleanup":
        return { edits: [], tests_pass: true, stashed: false };
      case "conformance":
        return { spec_found: false, findings: [] };
      case "ship":
        return { committed: true, pr_url: "https://example.com/pr/1" };
      default:
        return "feat/sample-branch";
    }
  },
  workflow: (name) => {
    if (name === "code")
      return {
        completed: ["U-001"],
        skipped: [],
        anomalies: [],
        commits: [{ unit: "U-001", subject: "feat: sample subject" }],
        tests_pass: true,
        gates_pass: true,
        verification: "tests+gates",
      };
    throw new Error(`unknown workflow: ${name}`);
  },
});

// The 3 gh-vs-mcp call sites, keyed by the label each site passes to agent().
const HANDOFF_LABELS = { load: "fetch", conformance: "conformance", ship: "ship" };

const handoffPromptsOf = async (scriptPath) => {
  const run = await runWorkflow(scriptPath, { args, stubs: makeHandoffStubs() });
  const byLabel = Object.fromEntries(
    Object.entries(HANDOFF_LABELS).map(([site, label]) => [
      site,
      run.calls.agent.find((c) => c.opts && c.opts.label === label),
    ]),
  );
  return byLabel;
};

test("all three gh call sites interpolate the same fallback constant", async () => {
  const { load, conformance, ship } = await handoffPromptsOf(buildJs);
  assert.ok(load && conformance && ship, "the Load, conformance, and Ship agents all ran");

  // U-001..U-003's route judgment, written once as build.js's ghOrMcpRoute const: the two
  // literal clauses that wrap each site's own gh/mcp step text. Identical across all 3 sites
  // is what "the same const, not 3 independent copies" means at the prompt-text level.
  const GH_CLAUSE = "check `which gh`. When gh is found, ";
  const MCP_CLAUSE = " When gh is missing, ";
  for (const [site, call] of [
    ["Load", load],
    ["conformance", conformance],
    ["Ship", ship],
  ]) {
    assert.ok(call.prompt.includes(GH_CLAUSE), `${site} carries the gh-found clause verbatim`);
    assert.ok(call.prompt.includes(MCP_CLAUSE), `${site} carries the gh-missing clause verbatim`);
  }
});

test("a run through the real script records the fallback text in the Load, conformance, and Ship prompts", async () => {
  const { load, conformance, ship } = await handoffPromptsOf(buildJs);
  assert.ok(load && conformance && ship, "the Load, conformance, and Ship agents all ran");

  for (const [site, call] of [
    ["Load", load],
    ["conformance", conformance],
    ["Ship", ship],
  ]) {
    assert.match(call.prompt, /which gh/, `${site} checks gh's presence`);
    assert.match(call.prompt, /mcp__github/, `${site} names the MCP fallback tool`);
  }
});

test("both language trees carry the same fallback constant", async () => {
  for (const scriptPath of [buildJs, jaBuildJs]) {
    const src = readFileSync(scriptPath, "utf8");
    // "素の const": defined once, and never exported (unlike `export const meta` at the top
    // of both trees), so no call site can bypass it and diverge from the other two.
    assert.doesNotMatch(
      src,
      /export const ghOrMcpRoute/,
      `${scriptPath}: the fallback constant stays unexported`,
    );
    assert.equal(
      (src.match(/\bconst ghOrMcpRoute = /g) || []).length,
      1,
      `${scriptPath}: the fallback constant is defined exactly once`,
    );
    assert.equal(
      (src.match(/ghOrMcpRoute\(/g) || []).length,
      3,
      `${scriptPath}: Load, conformance, and Ship all reference it`,
    );

    // Runtime side: within one tree, all 3 sites emit the same 2 literal clauses (proof the
    // reference is live, not just 3 static call sites that could still diverge post-interpolation).
    // The clause text itself is per-language prose (MIRROR.md), so each tree gets its own pair.
    const [ghClause, mcpClause] =
      scriptPath === buildJs
        ? ["check `which gh`. When gh is found, ", " When gh is missing, "]
        : ["`which gh` を確認する。gh があれば、", "gh が無ければ、"];
    const { load, conformance, ship } = await handoffPromptsOf(scriptPath);
    assert.ok(
      load && conformance && ship,
      `${scriptPath}: the Load, conformance, and Ship agents all ran`,
    );
    for (const [site, call] of [
      ["Load", load],
      ["conformance", conformance],
      ["Ship", ship],
    ]) {
      assert.ok(
        call.prompt.includes(ghClause),
        `${scriptPath}:${site}: carries the gh-found clause verbatim`,
      );
      assert.ok(
        call.prompt.includes(mcpClause),
        `${scriptPath}:${site}: carries the gh-missing clause verbatim`,
      );
    }
  }
});
