// Behavior checks on build.js's run loop. They pin the absence of an audit fan-out and a fix
// loop, the fail-close branches, the phase order, and a snapshot of the stopped values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const buildJs = join(here, "..", "..", "build.js");

// The shared args clearing build.js's no-repo gate. repo is used only to assemble the anchor
// and guard strings, so one fixed absolute path covers every test.
const repo = "/abs/target-repo";
const args = { issue: "123", repo };

// An issue body carrying a Plan section. unitIds and testIds are the literals the deterministic id collection targets.
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

// An extracted plan clearing build's validate() and its non-empty content check.
const makePlan = (overrides = {}) => ({
  outcome: "sample outcome",
  decisions: [],
  assumptions: ["assumption-1"],
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
  // validate() stops on a missing reference_module, so the shared fixture carries the smallest
  // passing form (no module to duplicate, plus the reason).
  reference_module: { kind: "no-module", reason: "sample reason" },
  backlog_candidates: [],
  ...overrides,
});

// Classifies an agent call by the shape of its schema rather than by its label string, which
// would couple these tests to wording build.js is free to reword.
const kindOf = (opts) => {
  const p = (opts && opts.schema && opts.schema.properties) || null;
  if (!p) return "plain";
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
  if ("translations" in p) return "translate";
  if ("pr_url" in p) return "ship";
  return "plain";
};

// The full set of happy-path stubs. Each named override swaps that stage's return value.
const makeStubs = ({
  body,
  title,
  plan,
  revalidate,
  conformance,
  translate,
  diff,
  presence,
  branch,
  untracked,
  code,
} = {}) => ({
  agent: (prompt, opts) => {
    const kind = kindOf(opts);
    switch (kind) {
      case "translate":
        // The default fails open (no translations) and keeps the English originals. Only the
        // test verifying that translations land passes a translate stub.
        return translate ? translate(prompt) : { notes: "no-translations" };
      case "fetch":
        // title is omitted by default, reproducing extract having dropped the key. Only the
        // test verifying the Bug decision passes a title override.
        return { found: true, title, body: body ?? bodyFor(["U-001"], ["T-001"]) };
      case "extract":
        return plan ?? makePlan();
      case "revalidate":
        return (
          revalidate ?? {
            results: [
              {
                path: "sample.js",
                pattern: "sampleSymbol",
                exists: true,
                matches: true,
              },
            ],
          }
        );
      case "diff":
        // The default diff matches the plan's files (no scope escape). A null override takes
        // the fail-open route.
        if (diff !== undefined) return typeof diff === "function" ? diff(prompt) : diff;
        return { files: ["sample.js"] };
      case "presence": {
        // The default reads the checks JSON at the tail of the prompt and returns every name
        // as found: true, the same shape as verify-tests.py's happy relay.
        if (presence !== undefined)
          return typeof presence === "function" ? presence(prompt) : presence;
        const checks = JSON.parse(prompt.trim().split("\n").pop());
        return {
          results: checks.flatMap((c) => c.names.map((name) => ({ name, found: true }))),
        };
      }
      case "branch":
        // head is the branch-point sha. Returning it by default carries the happy path through
        // the same per-unit commit route as production. An override returning something other
        // than a sha takes the fallback route.
        return branch ?? { branch: "feat/sample-branch", head: "a1b2c3d4e5f6a7b8" };
      case "untracked":
        return untracked ?? { untracked: [] };
      case "cleanup":
        return { edits: [], tests_pass: true, stashed: false };
      case "conformance":
        return conformance ?? { spec_found: false, findings: [] };
      case "ship":
        return { committed: true, pr_url: "https://example.com/pr/1" };
      default:
        return "feat/sample-branch";
    }
  },
  workflow: (name) => {
    if (name === "code")
      return (
        code ?? {
          completed: ["U-001"],
          anomalies: [],
          commits: [{ unit: "U-001", subject: "feat: sample subject" }],
          tests_pass: true,
          gates_pass: true,
        }
      );
    // The real runtime semantics: an unknown workflow name throws. sibling() tries code first
    // and resolves here, so it never falls back to build:code. build does not call audit, so a
    // call would make this throw fail the test rather than fall back.
    throw new Error(`unknown workflow: ${name}`);
  },
});

const agentCallsOf = (calls, kind) => calls.agent.filter((c) => kindOf(c.opts) === kind);

test("empty args fail closed with stopped: no-issue", async () => {
  const empty = await runWorkflow(buildJs, { args: {}, stubs: makeStubs() });
  assert.equal(empty.result.stopped, "no-issue", "empty args give stopped: no-issue");
  assert.equal(empty.calls.workflow.length, 0, "no nested workflow runs after no-issue");
  assert.ok(
    empty.calls.phase.every((p) => p === "Load"),
    "no phase other than Load runs after no-issue",
  );
});

// A free-form description merely carrying digits (the 11 in "a11y", say) is not mistaken for
// an issue number. The extraction is strict about a bare number, #number, or an issue URL,
// and anything else becomes stopped: no-issue.
test("a free-form description carrying digits is not read as an issue reference and fails closed with stopped: no-issue", async () => {
  const desc = await runWorkflow(buildJs, {
    args: "the outcome for this issue covers a11y support too",
    stubs: makeStubs(),
  });
  assert.equal(
    desc.result.stopped,
    "no-issue",
    "the 11 in a free-form description is not an issue number",
  );
  assert.equal(agentCallsOf(desc.calls, "fetch").length, 0, "a misread issue is never fetched");
});

// This pins the no-repo gate for args without a repo (build.js's if (!repo)) as a regression.
// The gate fires after the issue-ref check clears and before the Load fetch agent starts, so
// both the object form ({issue}) and the bare string form ("123") carrying a valid issue
// reference stop with zero fetches.
test("args missing repo (object / bare string) fail closed with stopped: no-repo before the fetch", async () => {
  for (const argsWithoutRepo of [{ issue: "123" }, "123"]) {
    const form = typeof argsWithoutRepo === "string" ? "bare string" : "object";
    const run = await runWorkflow(buildJs, { args: argsWithoutRepo, stubs: makeStubs() });
    assert.equal(
      run.result.stopped,
      "no-repo",
      `the ${form} form clears the issue-ref check and stops at stopped: no-repo, not no-issue`,
    );
    assert.equal(
      agentCallsOf(run.calls, "fetch").length,
      0,
      `the ${form} form stops before the Load fetch agent starts`,
    );
    assert.equal(
      run.calls.workflow.length,
      0,
      `the ${form} form runs no nested workflow after no-repo`,
    );
  }
});

// A bare string args cannot carry a repo and stops at the no-repo gate before the fetch, so
// whether a reference form is accepted is observable only in the { issue: ref, repo } shape.
test("a bare number, #number, and an issue URL in args with a repo all extract the same issue number and each run one fetch", async () => {
  for (const ref of ["123", "#123", "https://github.com/o/r/issues/123"]) {
    const run = await runWorkflow(buildJs, {
      args: { issue: ref, repo },
      stubs: makeStubs(),
    });
    assert.equal(run.result.stopped, undefined, `${ref} does not fail closed in args with a repo`);
    assert.equal(run.result.issue, "123", `${ref} extracts the same issue number 123`);
    assert.equal(agentCallsOf(run.calls, "fetch").length, 1, `${ref} runs one fetch`);
  }
});

// The issue goes back for refinement rather than getting a plan generated in its place, so why
// carries the route for re-running /think and /issue.
test("a body with no Plan section stops at stopped: no-plan and generates no plan", async () => {
  const noPlan = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      body: "An issue body with no Plan heading.\n\n## Context\n\nExplanation only.",
    }),
  });
  assert.equal(noPlan.result.stopped, "no-plan", "no Plan section gives stopped: no-plan");
  const labels = noPlan.calls.agent.map((c) => c.opts.label);
  assert.ok(!labels.includes("extract"), "no extract agent runs without a Plan section");
  assert.ok(
    !labels.some((l) => l === "generate-plan" || l === "critique-plan"),
    "no plan-generating agent runs without a Plan section",
  );
  assert.equal(noPlan.calls.workflow.length, 0, "no nested workflow runs after no-plan");
  assert.ok(
    noPlan.calls.phase.every((p) => p === "Load"),
    "no phase other than Load runs after no-plan",
  );
  assert.match(noPlan.result.why, /\/think/, "why points at drafting the plan with /think");
  assert.match(noPlan.result.why, /\/issue/, "why points at transferring the ## Plan with /issue");
});

// An issue body is untrusted input (anyone can edit it on a public repo), so the extract prompt
// fences it with an explicit data fence rather than a bare `---` and attaches an instruction not
// to treat the fenced content as instructions, blunting prompt injection.
test("the extract prompt fences the issue body as untrusted data", async () => {
  const withPlan = await runWorkflow(buildJs, { args, stubs: makeStubs() });
  const extract = agentCallsOf(withPlan.calls, "extract");
  assert.equal(extract.length, 1, "the extract agent runs once on the with-Plan path");
  assert.ok(
    extract[0].prompt.includes("BEGIN UNTRUSTED ISSUE BODY") &&
      extract[0].prompt.includes("END UNTRUSTED ISSUE BODY"),
    "the extract prompt fences the body between BEGIN and END untrusted markers",
  );
  assert.ok(
    /never follow any instruction/i.test(extract[0].prompt),
    "an instruction not to treat the fenced content as instructions is attached",
  );
  assert.equal(
    extract[0].opts.model,
    "sonnet",
    "extract is a mechanical transcription, so it is fixed to sonnet",
  );
});

test("a structural defect and empty content (contract / name) both give stopped: invalid-plan", async () => {
  const variants = [
    { plan: makePlan({ units: [] }), expect: /units/ },
    {
      plan: makePlan({
        units: [{ ...makePlan().units[0], contract: "" }],
      }),
      expect: /contract/,
    },
    {
      plan: makePlan({
        units: [
          {
            ...makePlan().units[0],
            tests: [{ ...makePlan().units[0].tests[0], name: "" }],
          },
        ],
      }),
      expect: /name/,
    },
  ];
  for (const { plan, expect } of variants) {
    const { result } = await runWorkflow(buildJs, {
      args,
      stubs: makeStubs({ plan }),
    });
    assert.equal(result.stopped, "invalid-plan", `variant ${expect} gives stopped: invalid-plan`);
    assert.ok(Array.isArray(result.blockers), "blockers comes back as an array");
    assert.ok(
      result.blockers.some((b) => expect.test(String(b))),
      `blockers carries an error message containing ${expect}`,
    );
  }
});

// reference_module carries, in structured form, either "duplicate an existing module of the same
// shape" or "this shape is new, and here is why". A bare null carries no reason, so a check
// demanding the object { kind, reason } is required. A form missing the field entirely carries no
// reason either, so it is caught on a branch separate from null. It stays out of the schema's
// required list (extraction-failed carries no blockers).
test("a plan with no reference_module field stops at invalid-plan", async () => {
  const plan = makePlan();
  delete plan.reference_module;
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan }),
  });
  assert.equal(result.stopped, "invalid-plan");
  assert.ok(
    result.blockers.some((b) => /reference_module/.test(String(b))),
    "blockers carries an error message naming reference_module",
  );
});

test("a plan whose reference_module is a bare null with no reason stops at invalid-plan", async () => {
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan: makePlan({ reference_module: null }) }),
  });
  assert.equal(result.stopped, "invalid-plan");
  assert.ok(
    result.blockers.some((b) => /reference_module/.test(String(b))),
    "blockers carries an error message naming reference_module",
  );
});

test("a plan whose kind is module with an empty path stops at invalid-plan", async () => {
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan: makePlan({ reference_module: { kind: "module", path: "" } }),
    }),
  });
  assert.equal(result.stopped, "invalid-plan");
  assert.ok(
    result.blockers.some((b) => /reference_module/.test(String(b)) && /path/.test(String(b))),
    "blockers carries an error message naming reference_module.path",
  );
});

test("a plan whose kind is not module with an empty reason stops at invalid-plan", async () => {
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan: makePlan({ reference_module: { kind: "new-shape", reason: "" } }),
    }),
  });
  assert.equal(result.stopped, "invalid-plan");
  assert.ok(
    result.blockers.some((b) => /reference_module/.test(String(b)) && /reason/.test(String(b))),
    "blockers carries an error message naming reference_module's reason",
  );
});

test("a plan carrying both kind and reason clears validate", async () => {
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan: makePlan({
        reference_module: { kind: "new-shape", reason: "no existing module shares this shape" },
      }),
    }),
  });
  assert.notEqual(result.stopped, "invalid-plan", "kind plus reason clears validate");
});

// The [Bug] prefix on an issue title (qualify SKILL.md § Title type) marks the Bug
// classification. A Bug issue that names no cause tends toward a symptomatic fix once it reaches
// the Code stage, so validate at the Load stage demands that root_cause be written. root_cause
// stays out of PLAN_SCHEMA's required list (extract dropping the key would stop the run at
// extraction-failed, which carries no blockers message; reference_module is out for the same
// reason). When fetch drops the title, the Bug decision cannot be made and root_cause is not
// demanded.
test("a plan whose title is a Bug with an empty root_cause stops at invalid-plan", async () => {
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ title: "[Bug] login fails", plan: makePlan({ root_cause: "" }) }),
  });
  assert.equal(result.stopped, "invalid-plan");
  assert.ok(
    result.blockers.some((b) => /root_cause/.test(String(b))),
    "blockers carries an error message naming root_cause",
  );
});

test("a plan whose title is a Bug and carries a root_cause clears validate", async () => {
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      title: "[Bug] login fails",
      plan: makePlan({ root_cause: "session token expires before the refresh call" }),
    }),
  });
  assert.notEqual(result.stopped, "invalid-plan", "a present root_cause clears validate");
});

test("a plan whose title is not a Bug clears validate with an empty root_cause", async () => {
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ title: "[Feature] add dark mode", plan: makePlan({ root_cause: "" }) }),
  });
  assert.notEqual(
    result.stopped,
    "invalid-plan",
    "a non-Bug needs no root_cause and clears validate",
  );
});

test("makes no Bug decision and demands no root_cause when fetch could not get the title", async () => {
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan: makePlan({ root_cause: "" }) }),
  });
  assert.notEqual(
    result.stopped,
    "invalid-plan",
    "with no title the Bug decision cannot be made, so root_cause is not demanded",
  );
});

// A per-unit test stubs its own boundary, so every unit can be green while the layers stay
// unwired. A plan carrying two or more units with tests therefore demands a seam unit.
test("a plan with two or more tested units and no seam unit gives stopped: invalid-plan, and clears with seam: true", async () => {
  const twoTestedUnits = (seam) => [
    { ...makePlan().units[0], seam: false },
    {
      id: "U-002",
      goal: "second goal",
      files: ["second.js"],
      contract: "second contract",
      tests: [{ id: "T-002", name: "second spec statement" }],
      seam,
    },
  ];

  const missing = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan: makePlan({ units: twoTestedUnits(false) }) }),
  });
  assert.equal(
    missing.result.stopped,
    "invalid-plan",
    "no seam unit stops the run at invalid-plan",
  );
  assert.ok(
    missing.result.blockers.some((b) => /seam/.test(String(b))),
    "blockers carries the wording demanding a seam unit",
  );

  const present = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan: makePlan({ units: twoTestedUnits(true) }) }),
  });
  assert.notEqual(present.result.stopped, "invalid-plan", "a present seam: true clears validate");
});

// A unit with no tests holds no boundary, so it falls outside the seam requirement. This pins
// that a docs-or-config-only plan does not stop on the seam demand.
test("a plan with at most one tested unit clears validate without a seam unit", async () => {
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan: makePlan({
        units: [
          { ...makePlan().units[0], seam: false },
          {
            id: "U-002",
            goal: "docs only",
            files: ["README.md"],
            contract: "docs contract",
            tests: [],
            seam: false,
          },
        ],
      }),
    }),
  });
  assert.notEqual(
    result.stopped,
    "invalid-plan",
    "a unit with no tests does not fire the seam demand",
  );
});

test("a silent drop of a unit or a test during extraction is detected deterministically as stopped: extraction-mismatch", async () => {
  const body = bodyFor(["U-001", "U-002"], ["T-001", "T-002", "T-003"]);
  const base = makePlan().units[0];

  // case A: silently drop unit U-002 while returning every test id
  const unitDrop = makePlan({
    units: [
      {
        ...base,
        tests: [
          { ...base.tests[0], id: "T-001" },
          { ...base.tests[0], id: "T-002" },
          { ...base.tests[0], id: "T-003" },
        ],
      },
    ],
  });
  const a = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ body, plan: unitDrop }),
  });
  assert.equal(
    a.result.stopped,
    "extraction-mismatch",
    "a dropped unit gives stopped: extraction-mismatch",
  );
  assert.ok(
    JSON.stringify(a.result.detail).includes("U-002"),
    "the mismatching unit id U-002 rides the detail",
  );

  // case B: silently drop the single test id T-003 while returning every unit id
  const testDrop = makePlan({
    units: [
      { ...base, tests: [{ ...base.tests[0], id: "T-001" }] },
      {
        ...base,
        id: "U-002",
        tests: [{ ...base.tests[0], id: "T-002" }],
        // This case watches the id cross-check rather than the seam check, so seam is satisfied
        seam: true,
      },
    ],
  });
  const b = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ body, plan: testDrop }),
  });
  assert.equal(
    b.result.stopped,
    "extraction-mismatch",
    "a dropped test gives stopped: extraction-mismatch",
  );
  assert.ok(
    JSON.stringify(b.result.detail).includes("T-003"),
    "the mismatching test id T-003 rides the detail",
  );
});

test("a T-NNN mentioned in contract prose is a reference rather than a definition, so it stays out of the cross-check and raises no extraction-mismatch", async () => {
  // The contract sentence "leave the existing T-106 untouched" is a reference, not a definition.
  // The only acceptance test defined is T-109, and the extraction returns T-109 alone.
  const body = [
    "## Plan",
    "",
    "Outcome: sample outcome",
    "test_command: echo test",
    "",
    "### U-001: unit heading",
    "",
    "- contract: leave the existing T-106 and the production code untouched",
    "",
    "Acceptance tests.",
    "",
    "- T-109: test scenario",
    "",
  ].join("\n");
  const base = makePlan().units[0];
  const plan = makePlan({
    units: [{ ...base, tests: [{ ...base.tests[0], id: "T-109" }] }],
  });
  const r = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ body, plan }),
  });
  assert.notEqual(
    r.result.stopped,
    "extraction-mismatch",
    "the prose reference T-106 is not mistaken for a missing test",
  );
});

// Detection of exceeding UNIT_CAPS (files: 3, tests: 4). It fires after the id cross-check
// clears and only on the extract route. A unit with seam: true is exempt, since a
// boundary-crossing test legitimately raises its file count.
test('a plan carrying a non-seam unit with 4 files stops at "oversized-unit" on the extract route', async () => {
  const body = bodyFor(["U-001"], ["T-001"]);
  const plan = makePlan({
    units: [
      {
        id: "U-001",
        goal: "sample goal",
        files: ["a.js", "b.js", "c.js", "d.js"],
        contract: "sample contract",
        tests: [{ id: "T-001", name: "sample spec statement" }],
        seam: false,
      },
    ],
  });
  const { result } = await runWorkflow(buildJs, { args, stubs: makeStubs({ body, plan }) });
  assert.equal(
    result.stopped,
    "oversized-unit",
    "a non-seam unit with 4 files gives stopped: oversized-unit",
  );
});

test('a plan carrying a non-seam unit with 5 tests stops at "oversized-unit" on the extract route', async () => {
  const tests = Array.from({ length: 5 }, (_, i) => ({
    id: `T-00${i + 1}`,
    name: `sample spec statement ${i + 1}`,
  }));
  const body = bodyFor(
    ["U-001"],
    tests.map((t) => t.id),
  );
  const plan = makePlan({
    units: [
      {
        id: "U-001",
        goal: "sample goal",
        files: ["a.js"],
        contract: "sample contract",
        tests,
        seam: false,
      },
    ],
  });
  const { result } = await runWorkflow(buildJs, { args, stubs: makeStubs({ body, plan }) });
  assert.equal(
    result.stopped,
    "oversized-unit",
    "a non-seam unit with 5 tests gives stopped: oversized-unit",
  );
});

test("a unit with seam: true escapes the cap detection at 4 files and the build continues", async () => {
  const body = bodyFor(["U-001"], ["T-001"]);
  const plan = makePlan({
    units: [
      {
        id: "U-001",
        goal: "sample goal",
        files: ["a.js", "b.js", "c.js", "d.js"],
        contract: "sample contract",
        tests: [{ id: "T-001", name: "sample spec statement" }],
        seam: true,
      },
    ],
  });
  const { result, calls } = await runWorkflow(buildJs, { args, stubs: makeStubs({ body, plan }) });
  assert.notEqual(
    result.stopped,
    "oversized-unit",
    "a unit with seam: true does not give stopped: oversized-unit at 4 files",
  );
  assert.ok(
    calls.phase.includes("Ship"),
    "a unit with seam: true continues through Ship even at 4 files",
  );
});

test("a plan sitting exactly at the caps of 3 files and 4 tests does not stop and continues as before", async () => {
  const tests = Array.from({ length: 4 }, (_, i) => ({
    id: `T-00${i + 1}`,
    name: `sample spec statement ${i + 1}`,
  }));
  const body = bodyFor(
    ["U-001"],
    tests.map((t) => t.id),
  );
  const plan = makePlan({
    units: [
      {
        id: "U-001",
        goal: "sample goal",
        files: ["a.js", "b.js", "c.js"],
        contract: "sample contract",
        tests,
        seam: false,
      },
    ],
  });
  const { result, calls } = await runWorkflow(buildJs, { args, stubs: makeStubs({ body, plan }) });
  assert.notEqual(
    result.stopped,
    "oversized-unit",
    "sitting exactly at 3 files and 4 tests does not give stopped: oversized-unit",
  );
  assert.ok(
    calls.phase.includes("Ship"),
    "a plan sitting exactly at the caps continues through Ship, as before",
  );
});

// The caps exist only in UNIT_CAPS, and /think Phase 3 copies them into prose. Changing one side
// alone drops nothing at run time, so this static match forces both to follow in the same commit.
const thinkSkill = join(here, "..", "..", "..", "skills", "think", "SKILL.md");

test("the UNIT_CAPS numbers and the seam exemption match the unit-cap wording in /think SKILL.md", async () => {
  const caps = (await readFile(buildJs, "utf8")).match(
    /const UNIT_CAPS = \{ files: (\d+), tests: (\d+) \};/,
  );
  assert.ok(caps, "the UNIT_CAPS numbers are readable from build.js");
  const skill = await readFile(thinkSkill, "utf8");
  assert.ok(
    skill.includes(`caps are ${caps[1]} files and ${caps[2]} tests`),
    `SKILL.md states the caps as ${caps[1]} files and ${caps[2]} tests`,
  );
  assert.match(skill, /A non-seam unit's caps/, "SKILL.md scopes the caps to non-seam units");
  assert.match(skill, /caps do not apply to it/, "SKILL.md exempts a seam unit from the caps");
});

// The reference_module.kind vocabulary /think Phase 3 teaches copies EXTRACT_SCHEMA's enum into
// prose. What is matched is the enum token itself appearing in both language templates rather
// than the English wording, the same static cross-check shape as the UNIT_CAPS match.
test("the kind words in the templates match build.js's enum", async () => {
  const source = await readFile(buildJs, "utf8");
  const enumMatch = source.match(/kind:\s*\{\s*type:\s*"string",\s*enum:\s*\[([^\]]+)\]/);
  assert.ok(enumMatch, "build.js's kind enum is readable");
  const kinds = enumMatch[1].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  const expectedToken = kinds.join("/");
  const templates = {
    en: join(here, "..", "..", "..", "skills", "think", "templates", "plan.md"),
    ja: join(here, "..", "..", "..", ".ja", "skills", "think", "templates", "plan.md"),
  };
  for (const [lang, path] of Object.entries(templates)) {
    const doc = await readFile(path, "utf8");
    assert.ok(
      doc.includes(expectedToken),
      `${lang}: the kind enum token ${expectedToken} matches build.js's enum`,
    );
  }
});

test("Revalidate stops at plan-drift on one miss, advances to Branch when all pass, and calls no agent when preconditions is empty", async () => {
  // miss case: carries one entry with exists: false
  const driftPlan = makePlan({
    preconditions: [
      { path: "sample.js", pattern: "sampleSymbol" },
      { path: "missing.js", pattern: "goneSymbol" },
    ],
  });
  const miss = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan: driftPlan,
      revalidate: {
        results: [
          {
            path: "sample.js",
            pattern: "sampleSymbol",
            exists: true,
            matches: true,
          },
          {
            path: "missing.js",
            pattern: "goneSymbol",
            exists: false,
            matches: false,
          },
        ],
      },
    }),
  });
  assert.equal(miss.result.stopped, "plan-drift", "one miss gives stopped: plan-drift");
  assert.ok(
    JSON.stringify(miss.result).includes("missing.js"),
    "the drift list carries the path that missed",
  );
  assert.ok(!miss.calls.phase.includes("Branch"), "no Branch phase follows plan-drift");

  // all-pass case: the run reaches the Branch phase
  const pass = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs(),
  });
  assert.ok(pass.calls.phase.includes("Branch"), "all passing reaches the Branch phase");

  // empty case: no revalidate agent runs and the run reaches Branch
  const empty = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan: makePlan({ preconditions: [] }) }),
  });
  assert.equal(
    agentCallsOf(empty.calls, "revalidate").length,
    0,
    "an empty preconditions runs no revalidate agent",
  );
  assert.ok(
    empty.calls.phase.includes("Branch"),
    "an empty preconditions still reaches the Branch phase",
  );
});

// ---- U-003: the existence check on reference_module's paths (script-driven, no LLM) ----
// revalidate.py takes the {path, pattern?} shape, so reference_module.path and files are mixed
// into the payload in that same shape and the drift is detected by the script's exists / matches
// decision alone.
const refModulePreconditionsPlan = (reference_module) => makePlan({ reference_module });

test("a reference_module path that does not exist stops the run at plan-drift", async () => {
  const plan = refModulePreconditionsPlan({
    path: "src/existing",
    files: ["src/existing/index.ts"],
  });
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan,
      revalidate: {
        results: [
          { path: "sample.js", pattern: "sampleSymbol", exists: true, matches: true },
          { path: "src/existing", pattern: "", exists: false, matches: false },
        ],
      },
    }),
  });
  assert.equal(
    result.stopped,
    "plan-drift",
    "an exists:false on reference_module.path gives stopped: plan-drift",
  );
  assert.ok(
    JSON.stringify(result.drift).includes("src/existing"),
    "the drift list carries reference_module.path",
  );
});

// A no-module entry can still name the path of a shape it quoted, so this confirms that path
// takes the existence check. validate ignores path unless kind is module, and refModuleEntries
// ignores kind, so neither check makes this route self-evident.
test("a plan whose kind is no-module with a path clears validate and takes the existence check in revalidate", async () => {
  const plan = refModulePreconditionsPlan({
    kind: "no-module",
    path: "src/existing",
    files: ["src/existing/index.ts"],
    reason: "the unit only appends to an existing file with no module search",
  });
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan,
      revalidate: {
        results: [
          { path: "sample.js", pattern: "sampleSymbol", exists: true, matches: true },
          { path: "src/existing", pattern: "", exists: false, matches: false },
        ],
      },
    }),
  });
  assert.notEqual(
    result.stopped,
    "invalid-plan",
    "a kind: no-module with a path clears validate as long as it carries a reason",
  );
  assert.equal(
    result.stopped,
    "plan-drift",
    "a path clearing validate goes straight to revalidate's existence check and stops at plan-drift when absent",
  );
  assert.ok(
    JSON.stringify(result.drift).includes("src/existing"),
    "the drift list carries the reference_module.path of the kind: no-module entry",
  );
});

test("a reference_module whose files include one that does not exist stops the run at plan-drift", async () => {
  const plan = refModulePreconditionsPlan({
    path: "src/existing",
    files: ["src/existing/index.ts", "src/existing/missing.ts"],
  });
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan,
      revalidate: {
        results: [
          { path: "sample.js", pattern: "sampleSymbol", exists: true, matches: true },
          { path: "src/existing", pattern: "", exists: true, matches: true },
          { path: "src/existing/index.ts", pattern: "", exists: true, matches: true },
          { path: "src/existing/missing.ts", pattern: "", exists: false, matches: false },
        ],
      },
    }),
  });
  assert.equal(
    result.stopped,
    "plan-drift",
    "one exists:false among reference_module.files gives stopped: plan-drift",
  );
  assert.ok(
    JSON.stringify(result.drift).includes("src/existing/missing.ts"),
    "the drift list carries the reference_module.files path that does not exist",
  );
});

test("a reference_module with no path puts no reference_module row in the revalidate payload", async () => {
  const withoutPath = refModulePreconditionsPlan({
    kind: "new-shape",
    reason: "no existing module shares this shape",
  });
  const withPath = refModulePreconditionsPlan({
    path: "src/existing",
    files: ["src/existing/index.ts"],
  });
  const revalidateStub = {
    results: [
      { path: "sample.js", pattern: "sampleSymbol", exists: true, matches: true },
      { path: "src/existing", pattern: "", exists: true, matches: true },
      { path: "src/existing/index.ts", pattern: "", exists: true, matches: true },
    ],
  };
  const payloadOf = async (plan) => {
    const run = await runWorkflow(buildJs, {
      args,
      stubs: makeStubs({ plan, revalidate: revalidateStub }),
    });
    const call = agentCallsOf(run.calls, "revalidate")[0];
    return JSON.parse(call.prompt.trim().split("\n").pop());
  };
  const withoutPayload = await payloadOf(withoutPath);
  const withPayload = await payloadOf(withPath);
  assert.deepEqual(
    withoutPayload,
    withoutPath.preconditions,
    "with no path on reference_module the payload stays plan.preconditions and no row is added",
  );
  assert.ok(
    withPayload.length > withoutPayload.length,
    "with a path on reference_module a row is added and the payload grows past the no-path one",
  );
});

// resultByKey keys on path and pattern alone, so a reference_module.path naming the same path as
// a precondition without a pattern resolves both to the same result and reports one absence
// twice.
test("drift stays at one entry when a precondition names the same path as reference_module.path", async () => {
  const plan = makePlan({
    preconditions: [{ path: "src/shared", pattern: "" }],
    reference_module: { kind: "module", path: "src/shared", files: [] },
  });
  const { result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan,
      revalidate: {
        results: [{ path: "src/shared", pattern: "", exists: false, matches: false }],
      },
    }),
  });
  assert.equal(result.stopped, "plan-drift");
  assert.equal(
    result.drift.length,
    1,
    "the same result is not counted twice, once for the precondition and once for reference_module",
  );
});

test("the happy path runs Load, Revalidate, Branch, Code, Cleanup, Verify, Ship in order, passes model: sonnet to code, and calls none of audit, polish, challenge, think, or research", async () => {
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs(),
  });

  assert.deepEqual(
    calls.phase,
    ["Load", "Revalidate", "Branch", "Code", "Cleanup", "Verify", "Ship"],
    "the phase order is Load, Revalidate, Branch, Code, Cleanup, Verify, Ship, verifying the tree after cleanup",
  );

  const codeCalls = calls.workflow.filter((c) => c.name === "code");
  assert.equal(codeCalls.length, 1, "workflow('code') runs once");
  assert.equal(codeCalls[0].args.model, "sonnet", "code receives model: sonnet");
  assert.ok(
    !("preconditions" in codeCalls[0].args.plan),
    "preconditions is stripped from the plan handed to code",
  );

  const cleanupCalls = agentCallsOf(calls, "cleanup");
  assert.equal(
    cleanupCalls.length,
    1,
    "the cleanup agent (the simplify skill plus test validation) runs once",
  );
  assert.equal(cleanupCalls[0].opts.model, "sonnet", "the cleanup agent is fixed to sonnet");

  // sibling() tries the bare dev-tree form (code) first and never falls back to build:code once
  // that resolves. In the dev tree code comes back, so the capture holds code alone and audit
  // never appears in the set.
  const names = new Set(calls.workflow.map((c) => c.name));
  assert.deepEqual(
    [...names].sort(),
    ["code"],
    "the workflow capture holds the dev-tree code alone, with no fallback to build:code",
  );
  for (const banned of ["audit", "polish", "challenge", "think", "research"]) {
    assert.ok(!names.has(banned), `workflow('${banned}') never runs`);
  }
});

// ---- Verify: the deterministic scope check plus the T-NNN statement match (selection-based
// assurance) ----

test("Verify's scope check surfaces a diff file outside the plan and excludes anything under .claude/workspace/", async () => {
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      diff: {
        files: ["sample.js", "extra.js", ".claude/workspace/planning/2026-07-03-sample/plan.json"],
      },
    }),
  });
  assert.deepEqual(
    result.scope_deviations,
    ["extra.js"],
    "only a file outside the plan files and outside .claude/workspace/ lands in scope_deviations",
  );
  const shipCalls = agentCallsOf(calls, "ship");
  assert.ok(
    shipCalls[0].prompt.includes('"scope_deviations":["extra.js"]'),
    "scope_deviations rides the ship prompt (the PR body payload)",
  );
  // Detected but not wired into the staging decision, Ship would sweep a tracked deviation into
  // the commit.
  const neverStage = shipCalls[0].prompt.slice(shipCalls[0].prompt.indexOf("never-stage"));
  assert.ok(
    neverStage.startsWith("never-stage") && neverStage.includes('["extra.js"]'),
    "scope_deviations lands in the ship prompt's never-stage set",
  );
  assert.ok(
    calls.phase.includes("Ship"),
    "a scope deviation fails open and the run still reaches Ship",
  );
});

test("the never-stage set stays empty and no diagnostic string is passed as a path when the diff list is unavailable", async () => {
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ diff: { files: null } }),
  });
  // The diagnostic string's wording differs per language, so only its count is inspected.
  assert.equal(
    result.scope_deviations.length,
    1,
    "with no diff list, scope_deviations carries one diagnostic row",
  );
  const shipCalls = agentCallsOf(calls, "ship");
  const neverStage = shipCalls[0].prompt.slice(shipCalls[0].prompt.indexOf("never-stage"));
  assert.ok(
    neverStage.startsWith("never-stage") && neverStage.includes("[]"),
    "the diagnostic string stays out of the never-stage set",
  );
});

test("Verify's T-NNN match surfaces a statement it could not find, and the relay prompt to the verifier carries the checks JSON", async () => {
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      presence: { results: [{ name: "sample spec statement", found: false }] },
    }),
  });
  assert.deepEqual(
    result.missing_tests,
    ["sample spec statement"],
    "a statement marked found: false lands in missing_tests",
  );
  const shipCalls = agentCallsOf(calls, "ship");
  assert.ok(
    shipCalls[0].prompt.includes('"missing_tests":["sample spec statement"]'),
    "missing_tests rides the ship prompt (the PR body payload)",
  );

  const presenceCalls = agentCallsOf(calls, "presence");
  assert.equal(presenceCalls.length, 1, "the verify-tests relay agent runs once");
  assert.ok(
    presenceCalls[0].prompt.includes("verify-tests.py"),
    "the relay prompt names the deterministic verifier verify-tests.py",
  );
  assert.ok(
    presenceCalls[0].prompt.includes('"names":["sample spec statement"]'),
    "the relay prompt carries the checks JSON of the unit's files plus names",
  );
  assert.ok(
    calls.phase.includes("Ship"),
    "a missing statement fails open and the run still reaches Ship",
  );
});

test("a failed diff or presence in Verify fails open to Ship and states what went unverified", async () => {
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ diff: null, presence: null }),
  });
  assert.ok(
    String(result.scope_deviations[0]).includes("scope not verified"),
    "an absent diff surfaces as scope not verified rather than as a silent clean",
  );
  assert.ok(
    String(result.missing_tests[0]).includes("presence not verified"),
    "an absent presence surfaces as statements not verified rather than as a silent clean",
  );
  assert.ok(calls.phase.includes("Ship"), "it fails open and reaches the Ship phase");
});

test("a unit with no tests is not invalid-plan, and zero declared statements call no presence relay agent", async () => {
  const plan = makePlan({
    units: [
      {
        id: "U-001",
        goal: "docs goal",
        files: ["sample.js"],
        contract: "docs contract",
        tests: [],
      },
    ],
  });
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ body: bodyFor(["U-001"], []), plan }),
  });
  assert.equal(
    result.stopped,
    undefined,
    "a unit with no tests does not fail closed; it is a legitimate choice by the plan",
  );
  assert.equal(
    agentCallsOf(calls, "presence").length,
    0,
    "zero declared statements call no verify-tests relay agent",
  );
  assert.deepEqual(result.missing_tests, [], "with nothing to match, missing_tests stays empty");
  assert.ok(
    calls.phase.includes("Ship"),
    "a plan of direct-implementation units alone still runs through Ship",
  );
});

// ---- the per-unit commit and the diff measured from the branch point ----
// Once Code commits per unit, HEAD is no longer the branch point. Leaving Verify's three reviews
// on `git diff HEAD` would empty the diff, and both the scope deviations and the conformance
// findings would silently come back at zero: a silent pass rather than a visible failure. The
// baseline is pinned to the branch-point sha Branch returns.

const refPlan = () =>
  makePlan({
    reference_module: { path: "src/existing", files: ["src/existing/index.ts"] },
  });

test("Verify's diff, conformance, and structure measure from Branch's branch-point sha and never use a bare git diff HEAD", async () => {
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan: refPlan() }),
  });
  const sha = "a1b2c3d4e5f6a7b8";
  const reviewPrompts = calls.agent
    .filter((c) => ["diff-files", "conformance", "structure"].includes(c.opts.label))
    .map((c) => ({ label: c.opts.label, prompt: c.prompt }));
  assert.equal(reviewPrompts.length, 3, "all three of diff-files, conformance, structure run");
  for (const { label, prompt } of reviewPrompts) {
    assert.ok(
      prompt.includes(`git diff ${sha}`),
      `${label} measures its diff from the branch-point sha`,
    );
    assert.ok(
      !/git diff HEAD\b/.test(prompt),
      `${label} holds no bare git diff HEAD, which would be empty after the unit commits`,
    );
  }
});

test("code receives commit: true, issue, and untracked_baseline, and the return value carries the unit_commits count", async () => {
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      untracked: { untracked: ["notes/local-memo.md"] },
      code: {
        completed: ["U-001"],
        anomalies: [],
        commits: [{ unit: "U-001", subject: "feat: sample subject" }],
        tests_pass: true,
        gates_pass: true,
      },
    }),
  });
  const codeArgs = calls.workflow.find((c) => c.name === "code").args;
  assert.equal(codeArgs.commit, true, "a present branch-point sha passes commit: true to code");
  assert.equal(codeArgs.issue, "123", "the issue number is passed for the commit trailer");
  assert.deepEqual(
    codeArgs.untracked_baseline,
    ["notes/local-memo.md"],
    "paths untracked since before the build are passed as the never-stage set",
  );
  assert.equal(result.unit_commits, 1, "the return value's unit_commits carries the commit count");
});

// sibling()'s fallback decision rests on the production runtime's wording, so the stub throws in
// that same shape.
const unknownWorkflowError = (name) =>
  new Error(`workflow('${name}'): no workflow with that name. Available: code`);

test("an internal error thrown by a nested workflow is not turned into a fallback to the build: namespace", async () => {
  const names = [];
  const stubs = {
    ...makeStubs(),
    workflow: (name) => {
      names.push(name);
      if (name === "code") throw new Error("code: StructuredOutput retry cap (5) exceeded");
      throw unknownWorkflowError(name);
    },
  };
  await assert.rejects(runWorkflow(buildJs, { args, stubs }), /retry cap/);
  assert.deepEqual(names, ["code"], "build:code is not called after an internal error");
});

// A nested failure carries the child's stack in its message, so the same words can appear there.
test("no fallback happens when the name-resolution wording appears inside an internal error message", async () => {
  const names = [];
  const stubs = {
    ...makeStubs(),
    workflow: (name) => {
      names.push(name);
      if (name === "code")
        throw new Error("code: agent answered `no workflow with that name` verbatim");
      throw unknownWorkflowError(name);
    },
  };
  await assert.rejects(runWorkflow(buildJs, { args, stubs }), /answered/);
  assert.deepEqual(names, ["code"], "wording appearing in the message causes no fallback");
});

// A bare name does not resolve under a plugin distribution. The fallback route stays reserved
// for a name-resolution failure alone.
test("falls back to the build: namespace and runs through when the bare name does not resolve", async () => {
  const names = [];
  const base = makeStubs();
  const stubs = {
    ...base,
    workflow: (name, a) => {
      names.push(name);
      if (name !== "build:code") throw unknownWorkflowError(name);
      return base.workflow("code", a);
    },
  };
  const { result } = await runWorkflow(buildJs, { args, stubs });
  assert.deepEqual(names, ["code", "build:code"], "the bare name is tried before the fallback");
  assert.equal(result.stopped, undefined, "build runs through once the fallback resolves");
});

// Enabling the unit commits without a branch-point sha would leave Verify with nothing to
// compare against and silently pass everything. When no sha is available, the commits are turned
// off and the run falls back to the former HEAD baseline.
test("code's commit becomes false and the diff baseline returns to HEAD when head is not a sha", async () => {
  for (const branch of [
    { branch: "feat/sample-branch", head: "" },
    { branch: "feat/sample-branch", head: "not-a-sha" },
  ]) {
    const { calls, result } = await runWorkflow(buildJs, {
      args,
      stubs: makeStubs({ branch, plan: refPlan() }),
    });
    const codeArgs = calls.workflow.find((c) => c.name === "code").args;
    assert.equal(codeArgs.commit, false, `head=${JSON.stringify(branch.head)} gives commit: false`);
    const diffCall = calls.agent.find((c) => c.opts.label === "diff-files");
    assert.ok(
      diffCall.prompt.includes("git diff HEAD --name-only"),
      "with the per-unit commits off, the diff measures from HEAD as before",
    );
    assert.equal(result.stopped, undefined, "an unavailable sha does not fail closed");
  }
});

// The units already sit in history, so Ship commits the remainder alone and treats an empty
// remainder as a normal finish.
test("with the per-unit commits on, the Ship prompt instructs a remainder commit and allows skipping when empty", async () => {
  const withCommits = await runWorkflow(buildJs, { args, stubs: makeStubs() });
  const shipPrompt = agentCallsOf(withCommits.calls, "ship")[0].prompt;
  assert.match(
    shipPrompt,
    /skip the commit/,
    "it allows skipping the commit on an empty remainder",
  );

  const fallback = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ branch: { branch: "feat/sample-branch", head: "" } }),
  });
  const fallbackPrompt = agentCallsOf(fallback.calls, "ship")[0].prompt;
  assert.notEqual(
    shipPrompt,
    fallbackPrompt,
    "with the per-unit commits off it returns to a single-commit instruction and the prompt differs",
  );
});

test("the snapshot of the stopped value set matches 13 values exactly and holds no remnant of the audit route", async () => {
  const source = await readFile(buildJs, "utf8");
  const stopped = new Set();
  for (const m of source.matchAll(/stopped:\s*"([^"]+)"/g)) stopped.add(m[1]);
  assert.deepEqual(
    [...stopped].sort(),
    [
      "code-failed",
      "dirty-branch-point",
      "extraction-failed",
      "extraction-mismatch",
      "invalid-plan",
      "no-issue",
      "no-issue-body",
      "no-plan",
      "no-repo",
      "oversized-unit",
      "plan-drift",
      "revalidate-failed",
      "revalidate-incomplete",
    ],
    "the stopped literal set matches 13 values exactly: no-plan for handing a plan-less issue back, and the two stop values of autonomous plan generation are gone",
  );
  const explore = source.match(/agentType:\s*"Explore"/g) || [];
  assert.equal(explore.length, 0, 'agentType: "Explore" appears zero times');
  // regression guard: no remnant of the audit fan-out or the fix loop.
  assert.ok(!source.includes('sibling("audit"'), "no call to the audit workflow remains");
  assert.ok(!source.includes("MAX_FIX_ROUNDS"), "no fix-then-re-audit loop remains");
  assert.ok(!source.includes("reaudited"), "no reaudited flag remains");
});

// build files nothing; it surfaces an out-of-scope candidate in the return value's
// backlog_candidates alone. It stays out of the PR body, which is not what a reviewer reads. The
// user files it with /issue from the return value.
test("a backlog candidate stays out of the PR body and surfaces only in the return value's backlog_candidates", async () => {
  const plan = makePlan({
    backlog_candidates: [{ summary: "an out-of-scope candidate from the issue" }],
  });
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({ plan }),
  });

  // The candidate stays out of Ship's PR body prompt
  const shipCalls = agentCallsOf(calls, "ship");
  assert.equal(shipCalls.length, 1, "the ship agent runs once");
  assert.ok(
    !shipCalls[0].prompt.includes("an out-of-scope candidate from the issue"),
    "the backlog candidate summary stays out of the ship prompt (the PR body)",
  );

  // The candidate surfaces in the return value alone
  assert.ok(
    Array.isArray(result.backlog_candidates),
    "the return value carries a backlog_candidates array",
  );
  assert.ok(
    result.backlog_candidates.some(
      (c) => c.source === "issue" && c.summary === "an out-of-scope candidate from the issue",
    ),
    "backlog_candidates carries the candidate with source: issue",
  );
});

// reviewer-conformance's Spec-axis findings stay unmixed with the deterministic deviation lists
// (scope / missing) and surface as their own axis in Ship's PR body payload and in the return
// value's conformance_findings.
test("conformance findings surface as their own axis and stay unmixed with the deterministic deviation lists", async () => {
  const { calls, result } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      conformance: {
        spec_found: true,
        findings: [
          {
            category: "missing",
            spec_line: "T-003 rejects negative",
            location: "pay.js:12",
            detail: "no test for T-003",
          },
        ],
      },
    }),
  });

  // The finding rides Ship's PR body payload (the shipPayload JSON)
  const shipCalls = agentCallsOf(calls, "ship");
  assert.equal(shipCalls.length, 1, "the ship agent runs once");
  assert.ok(
    shipCalls[0].prompt.includes("no test for T-003"),
    "the conformance finding's detail rides the ship prompt (the PR body payload)",
  );

  const confCalls = agentCallsOf(calls, "conformance");
  assert.equal(
    confCalls[0].opts.model,
    "sonnet",
    "conformance is fixed to sonnet and does not inherit the session model",
  );

  // The count surfaces in the return value's conformance_findings
  assert.equal(result.conformance_findings, 1, "the return value's conformance_findings is 1");

  // Its own axis: it stays unmixed with the deterministic deviation lists
  assert.deepEqual(
    result.scope_deviations,
    [],
    "a conformance finding does not mix into scope_deviations",
  );
  assert.deepEqual(
    result.missing_tests,
    [],
    "a conformance finding does not mix into missing_tests",
  );
});

// The free-form text in the tail's informational sections (assumptions / conformance / anomaly)
// comes out of the reviewer in English, so it is translated and compressed just before Ship. These
// verify that the translation lands in shipPayload and rides the ship prompt (the PR body
// payload).
test("the translate-tail output lands in shipPayload and rides the ship prompt", async () => {
  const plan = makePlan({
    assumptions: ["assume in EN"],
  });
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan,
      conformance: {
        spec_found: true,
        findings: [
          { category: "missing", spec_line: "L1", location: "a.js:1", detail: "conf in EN" },
        ],
      },
      // The input array is the prompt's last line, independent of any language marker. Each
      // {id,text} comes back with its text wrapped in JA<...> and its id kept.
      translate: (prompt) => {
        const arr = JSON.parse(prompt.trim().split("\n").pop());
        return { translations: arr.map((o) => ({ id: o.id, text: `JA<${o.text}>` })) };
      },
    }),
  });

  // The translate agent runs once because the slots are non-empty (assumption + conformance)
  const translateCalls = agentCallsOf(calls, "translate");
  assert.equal(translateCalls.length, 1, "the translate-tail agent runs once");

  // The translation rides the ship prompt (the shipPayload JSON) and no English original remains
  const shipCalls = agentCallsOf(calls, "ship");
  assert.equal(shipCalls.length, 1, "the ship agent runs once");
  assert.ok(
    shipCalls[0].prompt.includes("JA<conf in EN>"),
    "the translated conformance detail rides the ship prompt",
  );
  assert.ok(
    shipCalls[0].prompt.includes("JA<assume in EN>"),
    "the translated assumption rides the ship prompt",
  );
});

// How hard the compression goes differs by kind. A finding's detail can be cut because location
// and spec_line hold the grounds separately, while an assumption is what a human weighs a veto
// against and becomes undecidable once its granularity drops. Without kind in the input, the
// prompt's compression instruction lands on no element at all.
test("the translate-tail input carries a kind per slot", async () => {
  const plan = makePlan({ assumptions: ["assume A"] });
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan,
      conformance: {
        spec_found: true,
        findings: [{ category: "missing", spec_line: "L1", location: "a.js:1", detail: "conf B" }],
      },
      code: {
        completed: ["U-001"],
        anomalies: [{ unit: "U-001", kind: "no-red", notes: "anomaly C" }],
        commits: [{ unit: "U-001", subject: "feat: sample subject" }],
        tests_pass: true,
        gates_pass: true,
      },
    }),
  });

  const translateCalls = agentCallsOf(calls, "translate");
  assert.equal(translateCalls.length, 1, "the translate-tail agent runs once");
  const input = JSON.parse(translateCalls[0].prompt.trim().split("\n").pop());
  assert.deepEqual(
    input.map((o) => ({ kind: o.kind, text: o.text })),
    [
      { kind: "assumption", text: "assume A" },
      { kind: "finding", text: "conf B" },
      { kind: "anomaly", text: "anomaly C" },
    ],
    "assumption, finding, and anomaly are passed with their kind",
  );
  assert.ok(
    translateCalls[0].prompt.includes("`finding`") &&
      translateCalls[0].prompt.includes("`assumption`"),
    "the prompt carries a compression instruction per kind",
  );
});

// Putting evidence in a slot raises the ids per anomaly from 1 to 1+N and makes the all-or-nothing
// write-back likelier to fail its match. One missing entry ships the whole tail in English.
// evidence itself passes straight through to shipPayload without translation.
test("an anomaly's evidence stays out of the translate-tail slots", async () => {
  const plan = makePlan({ assumptions: [] });
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan,
      code: {
        completed: ["U-001"],
        anomalies: [
          {
            unit: "U-001",
            kind: "no-red",
            notes: "already implemented",
            evidence: ["ev one", "ev two"],
          },
        ],
        commits: [{ unit: "U-001", subject: "feat: sample subject" }],
        tests_pass: true,
        gates_pass: true,
      },
      translate: (prompt) => {
        const arr = JSON.parse(prompt.trim().split("\n").pop());
        return { translations: arr.map((o) => ({ id: o.id, text: `JA<${o.text}>` })) };
      },
    }),
  });

  const translateCalls = agentCallsOf(calls, "translate");
  assert.equal(translateCalls.length, 1, "the translate-tail agent runs once");
  const input = JSON.parse(translateCalls[0].prompt.trim().split("\n").pop());
  assert.deepEqual(
    input.map((o) => o.text),
    ["already implemented"],
    "the slots carry notes alone and no evidence",
  );

  const shipCalls = agentCallsOf(calls, "ship");
  assert.ok(shipCalls[0].prompt.includes("JA<already implemented>"), "notes rides translated");
  assert.ok(shipCalls[0].prompt.includes("ev two"), "evidence rides in its original wording");
});

// Even when the translation comes back with its ids reordered, the consumer matches on id and
// writes each one back into the right slot.
test("a reordered translate-tail translation still lands in the right slot by id", async () => {
  const plan = makePlan({
    assumptions: ["assume A"],
  });
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      plan,
      conformance: {
        spec_found: true,
        findings: [{ category: "missing", spec_line: "L1", location: "a.js:1", detail: "conf B" }],
      },
      // Returns the entries reversed with their ids kept; a position-based consumer would mix them up
      translate: (prompt) => {
        const arr = JSON.parse(prompt.trim().split("\n").pop());
        return { translations: arr.map((o) => ({ id: o.id, text: `JA<${o.text}>` })).reverse() };
      },
    }),
  });

  const shipCalls = agentCallsOf(calls, "ship");
  assert.equal(shipCalls.length, 1, "the ship agent runs once");
  assert.ok(
    shipCalls[0].prompt.includes("JA<conf B>"),
    "even reversed, the conformance detail carries its own translation",
  );
  assert.ok(
    shipCalls[0].prompt.includes("JA<assume A>"),
    "even reversed, the assumption carries its own translation",
  );
});

// When a translation's ids do not match the input (missing or mixed up), the consumer fails open,
// keeps the English originals, and does not block the PR.
test("ship continues with the English originals when the translate-tail ids do not match the input", async () => {
  const { calls } = await runWorkflow(buildJs, {
    args,
    stubs: makeStubs({
      conformance: {
        spec_found: true,
        findings: [
          { category: "missing", spec_line: "L1", location: "a.js:1", detail: "conf in EN" },
        ],
      },
      // No translation for slot 0, and one for the nonexistent id 5: a mix-up
      translate: () => ({ translations: [{ id: 5, text: "only one" }] }),
    }),
  });

  const shipCalls = agentCallsOf(calls, "ship");
  assert.equal(shipCalls.length, 1, "the ship agent runs once");
  assert.ok(
    shipCalls[0].prompt.includes("conf in EN"),
    "on an id mismatch the English conformance detail stays in the ship prompt",
  );
  assert.ok(
    !shipCalls[0].prompt.includes("only one"),
    "a translation with a mismatched id is not taken",
  );
});
