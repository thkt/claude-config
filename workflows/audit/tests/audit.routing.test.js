// The reviewer list classify() returns is never asserted. Pinning the contents of ROUTING would
// make a change detector that fails on every edit to the table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.ts";
import { defaultAgentStub, snapshotPayload } from "./_fixtures.js";
import { extractBracedBody, parseRoutingLikeConst } from "../../_lib/tests/_brace.ts";

const here = dirname(fileURLToPath(import.meta.url));
const auditJs = join(here, "..", "..", "audit.js");
const assertJs = join(here, "..", "..", "assert.js");
const reviewersDir = join(here, "..", "..", "..", "agents", "reviewers");

// Same extraction as parseRoutingLikeConst (extractBracedBody isolates the `const <name> = {`
// body), with the row pattern swapped for a numeric value: SEVERITY_RANK holds `key: number`,
// not `key: [...]`. Reused across T-105 and T-107 so neither test copies a severity's spelling
// or its rank by hand.
const parseNumericConst = (source, name) => {
  const body = extractBracedBody(source, `const ${name} = {`);
  if (body === null) return null;
  const result = {};
  const rowPattern = /(?:"([^"]+)"|(\w+))\s*:\s*(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = rowPattern.exec(body))) {
    const key = m[1] || m[2];
    result[key] = Number(m[3]);
  }
  return result;
};

// The findings schema's severity enum, read from audit.js's own FINDINGS_SCHEMA rather than
// copied into the test as a literal list.
const parseFindingsSeverityEnum = (source) => {
  const m = source.match(/severity:\s*\{\s*type:\s*"string",\s*enum:\s*\[([^\]]*)\]/);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null;
};

// No stub is placed past Challenge. Returning undefined on a reviewer label empties findings and
// drops the run into the early return that still carries assignments.
const routeOnlyStub = (files) => (prompt, opts) => {
  if (opts && opts.label === "route") {
    return { files: files.map((path) => ({ path, churn: 0 })) };
  }
  return undefined;
};

const runRoute = async (files, extra = {}) => {
  const { result, logs } = await runWorkflow(auditJs, {
    args: { repo: "/abs/target-repo", skipPreflight: true, ...extra },
    stubs: { agent: routeOnlyStub(files) },
  });
  return { result, logs };
};

const unassigned = (result, files) => {
  const assigned = new Set(result.assignments.flatMap((a) => a.files));
  return files.filter((p) => !assigned.has(p));
};

// The contents of ROUTING and FOCUS are normally not asserted (see the comment above). But
// T-012 through T-014 check the consistency among ROUTING, FOCUS, and agents/reviewers/, so
// this one place reads both constants out of the audit.js source and matches them up.

// Reviewers defined under agents/reviewers/ that hold no ROUTING row. They run only when a skill
// calls them directly, so they carry no glob-table row and audit.js needs no such distinction at
// run time (a name absent from ROUTING simply is not routed). The expectation therefore lives
// here. A definition named neither here nor in ROUTING stays behind uncalled by anyone, and
// T-014 detects that.
const SKILL_ONLY_REVIEWERS = ["causation", "readability", "conformance"];

test("audit clears the Route stage on a diff of yaml, yml, and json, and all three files land in assignments", async () => {
  const files = ["config.yaml", "ci.yml", "package.json"];

  const { result } = await runRoute(files);

  assert.deepEqual(unassigned(result, files), [], "no file is missing from assignments");
});

test("every extension classify branches on in the source lands its file in some assignment", async () => {
  // The extensions are not listed on the test side, which could not follow a new branch in
  // classify. A branch written as `[".yaml", ".yml"].includes(e)` escapes this extraction.
  const source = readFileSync(auditJs, "utf8");
  const extensions = [...source.matchAll(/\be === "(\.[a-z0-9]+)"/g)].map((m) => m[1]);
  assert.notEqual(extensions.length, 0, "the extension branches are extractable from audit.js");

  // A path that is nothing but a leading dot, such as `.yaml`, is avoided: ext() returns "" and
  // the path falls to ROUTING.default without passing a branch. The stem carries no "test"
  // because the test check at the head of classify would absorb it.
  const files = extensions.map((e, i) => `src/sample-${i}${e}`);

  const { result } = await runRoute(files);

  assert.deepEqual(unassigned(result, files), [], "no file is missing from assignments");
});

test("T-012 every reviewer named under any FOCUS key exists on some ROUTING row", () => {
  const source = readFileSync(auditJs, "utf8");
  const routing = parseRoutingLikeConst(source, "ROUTING");
  const focus = parseRoutingLikeConst(source, "FOCUS");
  assert.ok(routing, "ROUTING is extractable from audit.js");
  assert.ok(focus, "FOCUS is extractable from audit.js");

  const routedReviewers = new Set(Object.values(routing).flat());
  const missing = [];
  for (const [key, reviewers] of Object.entries(focus)) {
    if (!Array.isArray(reviewers)) continue; // all: null is skipped
    for (const r of reviewers) {
      if (!routedReviewers.has(r)) missing.push(`${key}:${r}`);
    }
  }
  assert.deepEqual(missing, [], `FOCUS reviewers on no ROUTING row: ${missing.join(", ")}`);
});

test("T-013 every reviewer named in ROUTING holds a definition file under agents/reviewers/", () => {
  const source = readFileSync(auditJs, "utf8");
  const routing = parseRoutingLikeConst(source, "ROUTING");
  assert.ok(routing, "ROUTING is extractable from audit.js");

  const routedReviewers = [...new Set(Object.values(routing).flat())];
  const definedFiles = new Set(readdirSync(reviewersDir));
  const missing = routedReviewers.filter((r) => !definedFiles.has(`reviewer-${r}.md`));
  assert.deepEqual(
    missing,
    [],
    `ROUTING reviewers with no definition file under agents/reviewers/: ${missing.join(", ")}`,
  );
});

test("T-014 every definition under agents/reviewers/ appears in ROUTING or in the skill-only allowlist", () => {
  const source = readFileSync(auditJs, "utf8");
  const routing = parseRoutingLikeConst(source, "ROUTING");
  assert.ok(routing, "ROUTING is extractable from audit.js");

  const routedReviewers = new Set(Object.values(routing).flat());
  const skillOnly = new Set(SKILL_ONLY_REVIEWERS);
  const definedNames = readdirSync(reviewersDir)
    .filter((f) => f.startsWith("reviewer-") && f.endsWith(".md"))
    .map((f) => f.slice("reviewer-".length, -".md".length));

  const orphaned = definedNames.filter((n) => !routedReviewers.has(n) && !skillOnly.has(n));
  assert.deepEqual(
    orphaned,
    [],
    `agents/reviewers/ definitions in neither ROUTING nor the skill-only allowlist: ${orphaned.join(", ")}`,
  );

  // A name in both fires through ROUTING, which erases the intent of placing it in skill-only.
  const both = [...routedReviewers].filter((n) => skillOnly.has(n));
  assert.deepEqual(
    both,
    [],
    `reviewers in both ROUTING and the skill-only allowlist: ${both.join(", ")}`,
  );
});

// T-001 through T-004 pin how each kind of scope resolves. audit.js owns the branching and the
// agent stage returns only raw git output, so the stub mimics that output alone.
const scopeStub =
  ({ scopeKind, scopeStatus, route } = {}) =>
  (prompt, opts) => {
    const label = opts && opts.label;
    if (label === "scope-kind") return scopeKind;
    if (label === "scope-status") return scopeStatus;
    if (label === "route") return route;
    return undefined;
  };

const runScoped = async (extraArgs, stubOpts) => {
  const { result, logs, calls } = await runWorkflow(auditJs, {
    args: { repo: "/abs/target-repo", skipPreflight: true, ...extraArgs },
    stubs: { agent: scopeStub(stubOpts) },
  });
  return { result, logs, calls };
};

test("a path scope targets the tracked files under it when the working tree has no uncommitted change", async () => {
  const files = ["src/sample.js"];

  const { result } = await runScoped(
    { scope: "src" },
    {
      // git rev-parse echoes an existing path back at exit 0 and exits 128 on a name that does
      // not exist. Neither becomes a SHA line, so both fall to the path side.
      scopeKind: { exit_code: 0, stdout: "src" },
      route: { files: files.map((path) => ({ path, churn: 0 })) },
    },
  );

  assert.equal(result.resolution.kind, "path");
  assert.match(result.resolution.command, /ls-files/);
  assert.match(result.resolution.command, /src/);
  assert.deepEqual(unassigned(result, files), [], "the files under the path land in assignments");
});

test("a `main...HEAD` range scope resolves as a revision and never falls to path narrowing", async () => {
  const files = ["workflows/audit.js"];

  const { result } = await runScoped(
    { scope: "main...HEAD" },
    {
      // git rev-parse "main...HEAD" returns both ends of the range as SHA lines.
      scopeKind: {
        exit_code: 0,
        stdout:
          "1df91449501666aca9c6016f05a18de61028cb1e\n1df91449501666aca9c6016f05a18de61028cb1e\n^1df91449501666aca9c6016f05a18de61028cb1e",
      },
      route: { files: files.map((path) => ({ path, churn: 1 })) },
    },
  );

  assert.equal(result.resolution.kind, "revision");
  assert.match(result.resolution.command, /diff/);
  assert.doesNotMatch(result.resolution.command, /ls-files/);
  assert.deepEqual(
    unassigned(result, files),
    [],
    "the files in the revision diff land in assignments",
  );
});

test("the diff from base to HEAD becomes the target when scope is omitted and no change is uncommitted", async () => {
  const files = ["workflows/polish.js"];

  const { result } = await runScoped(
    {},
    {
      scopeStatus: { stdout: "" },
      route: { files: files.map((path) => ({ path, churn: 2 })) },
    },
  );

  assert.equal(result.resolution.kind, "branch");
  assert.equal(result.resolution.command, "git diff --name-only main...HEAD");
  assert.deepEqual(
    unassigned(result, files),
    [],
    "the files in the base...HEAD diff land in assignments",
  );
});

test("a run ending with zero targets returns a resolution telling no-target apart from no-changes", async () => {
  // A path scope with zero files (no target): no tracked file lives under the scope path
  const { result: pathResult } = await runScoped(
    { scope: "empty-dir" },
    {
      scopeKind: { exit_code: 0, stdout: "empty-dir" },
      route: { files: [] },
    },
  );
  // scope omitted and the base...HEAD diff is also empty (no changes)
  const { result: branchResult } = await runScoped(
    {},
    {
      scopeStatus: { stdout: "" },
      route: { files: [] },
    },
  );

  assert.equal(pathResult.resolution.kind, "path");
  assert.equal(pathResult.resolution.reason, "no-target");
  assert.equal(branchResult.resolution.kind, "branch");
  assert.equal(branchResult.resolution.reason, "no-changes");
  assert.notEqual(pathResult.resolution.reason, branchResult.resolution.reason);
});

// T-005 through T-007 cover the three later places that read the kind Route decided (the
// reviewer instruction, the soft-limit check, and the snapshot payload). What each inspects
// changes with the kind, so a later stage still reading the raw scope would diverge from Route's
// resolution.
test("a path scope makes the reviewer instruction read the file bodies rather than consult a diff", async () => {
  const { calls } = await runScoped(
    { scope: "workflows" },
    {
      scopeKind: { exit_code: 0, stdout: "workflows" },
      route: { files: [{ path: "workflows/audit.js", churn: 0 }] },
    },
  );

  // A reviewer label reads `<reviewer name>#<batch>`, and the agent name rides the head of the
  // prompt.
  const reviewer = calls.agent.find((c) => (c.prompt || "").includes("reviewer-"));
  assert.ok(reviewer, "a reviewer started");
  assert.doesNotMatch(reviewer.prompt, /git diff/, "a path scope consults no diff");
  assert.match(reviewer.prompt, /read those files/i, "it instructs reading the file bodies");
});

test("the soft-limit log appears once the resolved file count passes 30, with or without a given scope", async () => {
  const files = Array.from({ length: 31 }, (_, i) => ({ path: `workflows/f${i}.js`, churn: 0 }));

  const { logs } = await runScoped(
    { scope: "workflows" },
    { scopeKind: { exit_code: 0, stdout: "workflows" }, route: { files } },
  );

  assert.ok(
    logs.some((l) => /soft limit/i.test(l) && l.includes("31")),
    "31 files reach the soft-limit log even on a run given a scope",
  );
});

test("the snapshot payload records the resolved kind and the command that ran", async () => {
  const { calls } = await runScoped(
    { scope: "workflows" },
    {
      scopeKind: { exit_code: 0, stdout: "workflows" },
      route: { files: [{ path: "workflows/audit.js", churn: 0 }] },
    },
  );

  const payload = snapshotPayload(calls);
  assert.ok(payload, "the snapshot payload is written out");
  assert.equal(payload.resolution.kind, "path");
  assert.match(payload.resolution.command, /ls-files/);
});

test("T-015 a file left with zero reviewers by a focus lands in the return value with its count and path", async () => {
  // ROUTING["*.js"] carries neither accessibility nor progressive, so intersecting it with
  // focus: "a11y" (FOCUS.a11y = ["accessibility", "progressive"]) leaves this file with zero
  // reviewers.
  const files = ["src/sample.js"];

  const { result, logs } = await runRoute(files, { focus: "a11y" });

  assert.ok(
    Array.isArray(result.zero_reviewer_files),
    "the return value carries an array of the files left with zero reviewers",
  );
  assert.deepEqual(
    result.zero_reviewer_files.map((f) => f.path),
    files,
    "the path of the file left with zero reviewers rides the return value",
  );
  assert.ok(
    logs.some((l) => /zero.?reviewer/i.test(l) && l.includes(String(files.length))),
    "log() carries the count of files left with zero reviewers",
  );
});

// T-003 and T-004 pin that FOCUS is a membership check: a key absent from FOCUS stops the run
// before Route (or any other stage) spawns an agent, and every key FOCUS actually holds
// (including "all") keeps routing files as before. The valid-value list comes from the same
// parseRoutingLikeConst extraction T-012 through T-014 use, so the test never copies FOCUS's
// key spellings by hand.
test("a focus outside FOCUS stops the run before any agent spawns and the why names every valid focus value", async () => {
  const source = readFileSync(auditJs, "utf8");
  const focus = parseRoutingLikeConst(source, "FOCUS");
  assert.ok(focus, "FOCUS is extractable from audit.js");
  const validFocusValues = Object.keys(focus);

  const { result, calls } = await runWorkflow(auditJs, {
    args: { repo: "/abs/target-repo", focus: "not-a-real-focus", skipPreflight: true },
    stubs: {},
  });

  assert.equal(result.stopped, "invalid-focus");
  for (const key of validFocusValues) {
    assert.match(result.why, new RegExp(key), `the why names the valid focus value "${key}"`);
  }
  assert.equal(calls.agent.length, 0, "no agent runs before focus membership is confirmed");
});

test("each key of FOCUS, all included, still routes files to reviewers", async () => {
  const source = readFileSync(auditJs, "utf8");
  const focus = parseRoutingLikeConst(source, "FOCUS");
  assert.ok(focus, "FOCUS is extractable from audit.js");

  // src/sample.jsx carries every reviewer any FOCUS key names (ROUTING["*.jsx"] is a superset
  // of security, silence, react-pattern, efficiency, progressive, accessibility, ...), so it
  // stays non-empty under every key's intersection, "all"'s null included.
  const files = ["src/sample.jsx"];

  for (const key of Object.keys(focus)) {
    const { result } = await runRoute(files, { focus: key });

    assert.equal(result.stopped, undefined, `focus "${key}" does not stop the run`);
    assert.deepEqual(
      result.zero_reviewer_files.map((f) => f.path),
      [],
      `focus "${key}" still routes the file to at least one reviewer`,
    );
  }
});

// T-105 through T-107 guard the seam between audit.js and assert.js: both scripts keep their
// own copy of SEVERITY_RANK (the plan's convention forbids sharing one module across workflow
// scripts), so nothing at edit time stops the two copies from drifting apart. All three read
// the tables straight from source text via parseNumericConst / parseFindingsSeverityEnum,
// never copying a severity's spelling or rank into the test by hand.
test("the SEVERITY_RANK extracted from audit.js deep-equals the one extracted from assert.js", () => {
  const auditRank = parseNumericConst(readFileSync(auditJs, "utf8"), "SEVERITY_RANK");
  const assertRank = parseNumericConst(readFileSync(assertJs, "utf8"), "SEVERITY_RANK");

  assert.ok(auditRank, "SEVERITY_RANK is extractable from audit.js");
  assert.ok(assertRank, "SEVERITY_RANK is extractable from assert.js");
  assert.deepEqual(auditRank, assertRank, "audit.js and assert.js rank every severity identically");
});

test("the snapshot payload carries the findings in the same order as the return value", async () => {
  const rank = parseNumericConst(readFileSync(auditJs, "utf8"), "SEVERITY_RANK");
  assert.ok(rank, "SEVERITY_RANK is extractable from audit.js");
  const severities = Object.keys(rank);

  // One finding per known severity, handed to Integrate in the reverse of rank order, so a
  // pipeline that forwarded Integrate's order unsorted would already fail the first assertion.
  const findings = severities.map((severity, i) => ({
    file: "a.js",
    line: String(i + 1),
    severity,
    summary: `${severity} finding`,
    source_ids: ["R-1"],
  }));

  const { result, calls } = await runWorkflow(auditJs, {
    args: { repo: "/abs/target-repo", focus: "security", skipPreflight: true },
    stubs: {
      agent: defaultAgentStub({
        challenge: { verdicts: [{ id: "R-1", verdict: "confirmed" }] },
        integrate: { findings: [...findings].reverse() },
      }),
    },
  });

  const expectedOrder = [...severities].sort((a, b) => rank[b] - rank[a]);
  assert.deepEqual(
    result.findings.map((f) => f.severity),
    expectedOrder,
    "the return value sorts by the SEVERITY_RANK extracted from audit.js's own source",
  );

  const snap = snapshotPayload(calls);
  assert.deepEqual(
    snap.findings.map((f) => f.severity),
    result.findings.map((f) => f.severity),
    "the snapshot payload carries the findings in the same order as the return value",
  );
});

test("every severity in the audit findings schema enum appears as a key of SEVERITY_RANK", () => {
  const source = readFileSync(auditJs, "utf8");
  const enumSeverities = parseFindingsSeverityEnum(source);
  const rank = parseNumericConst(source, "SEVERITY_RANK");

  assert.ok(
    enumSeverities && enumSeverities.length,
    "the findings schema's severity enum is extractable from audit.js",
  );
  assert.ok(rank, "SEVERITY_RANK is extractable from audit.js");

  const missing = enumSeverities.filter((s) => !(s in rank));
  assert.deepEqual(
    missing,
    [],
    `findings schema severities with no SEVERITY_RANK entry: ${missing.join(", ")}`,
  );
});
