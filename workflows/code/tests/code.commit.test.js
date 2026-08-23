// Leaving the commit message and the staging range to the agent's discretion breaks silently,
// so the trailer contents and the staging prohibitions are pinned on the prompt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkWorkflowSyntax, runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const codeJs = join(here, "..", "..", "code.js");

const plan = {
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "sample goal",
      files: ["sample.js"],
      contract: "sample contract",
      tests: [{ id: "T-001", name: "sample spec statement" }],
      seam: false,
    },
  ],
};

const noTestPlan = {
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "docs goal",
      files: ["README.md"],
      contract: "docs contract",
      tests: [],
      seam: false,
    },
  ],
};

// A happy stub where only the commit agent's return value varies.
const stubWith = (commitResult) => (prompt, opts) => {
  const label = opts.label ?? "";
  if (label.startsWith("commit:")) return commitResult;
  if (label.startsWith("red:"))
    return { red_confirmed: true, test_files: ["t.test.js"], notes: "" };
  if (label.startsWith("green:")) return { green: true, notes: "" };
  if (label.startsWith("impl:")) return { green: true, notes: "" };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

const committed = { committed: true, subject: "feat: sample subject", left_unstaged: [] };

const commitCalls = (calls) =>
  calls.agent.filter((c) => (c.opts.label ?? "").startsWith("commit:"));

test("runs to completion without the commit agent, leaving the working tree uncommitted, when commit is unset", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo" },
    stubs: { agent: stubWith(committed) },
  });
  assert.equal(commitCalls(calls).length, 0, "no commit agent runs when commit is unset");
  assert.deepEqual(result.commits, [], "the returned commits is an empty array");
  assert.deepEqual(result.completed, ["U-1"], "the unit completes as usual");
});

test("runs the commit agent once per unit with commit: true and lists the unit id and subject in commits", async () => {
  const twoUnits = {
    test_command: "echo test",
    units: [
      plan.units[0],
      { ...plan.units[0], id: "U-2", tests: [{ id: "T-002", name: "second statement" }] },
    ],
  };
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: twoUnits, repo: "/abs/target-repo", commit: true },
    stubs: { agent: stubWith(committed) },
  });
  assert.deepEqual(
    commitCalls(calls).map((c) => c.opts.label),
    ["commit:U-1", "commit:U-2"],
    "the commit agent runs once per unit, in implementation order",
  );
  assert.deepEqual(
    result.commits,
    [
      { unit: "U-1", subject: "feat: sample subject" },
      { unit: "U-2", subject: "feat: sample subject" },
    ],
    "the returned commits carries the unit id and subject",
  );
  assert.equal(result.anomalies.length, 0, "a successful commit creates no anomaly");
});

test("the commit prompt carries the plan-derived trailer block with the verbatim-copy instruction", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo", commit: true, issue: "123" },
    stubs: { agent: stubWith(committed) },
  });
  const prompt = commitCalls(calls)[0].prompt;
  assert.match(prompt, /^Unit: U-1$/m, "the Unit trailer is present");
  assert.match(
    prompt,
    /^Contract: sample contract$/m,
    "the Contract trailer carries the plan's contract",
  );
  assert.match(prompt, /^Tests: T-001$/m, "the Tests trailer carries the T-NNN ids");
  assert.match(prompt, /^Seam: false$/m, "the Seam trailer is present");
  assert.match(prompt, /^Issue: #123$/m, "the issue argument becomes the Issue trailer");
  assert.match(
    prompt,
    /verbatim/,
    "the verbatim-copy instruction for the trailer block is present",
  );
  assert.equal(commitCalls(calls)[0].opts.model, "haiku", "the commit agent is fixed to haiku");
});

// An issue number can also arrive as "#123". This pins that the trailer does not become "##123".
test("the Issue trailer does not double the # when issue arrives with one", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo", commit: true, issue: "#123" },
    stubs: { agent: stubWith(committed) },
  });
  assert.match(commitCalls(calls)[0].prompt, /^Issue: #123$/m, "the Issue trailer reads #123");
});

test("creates no Issue trailer when issue is unset", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo", commit: true },
    stubs: { agent: stubWith(committed) },
  });
  assert.doesNotMatch(commitCalls(calls)[0].prompt, /^Issue:/m, "no Issue trailer is present");
});

// Staging a pre-existing untracked file leaks specs, research notes, and local settings into the
// PR. This pins that the guard on the Ship side is duplicated on the commit agent side too.
test("the commit prompt carries the git add -A ban and the never-stage instruction for untracked_baseline", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: {
      plan,
      repo: "/abs/target-repo",
      commit: true,
      untracked_baseline: ["notes/local-memo.md"],
    },
    stubs: { agent: stubWith(committed) },
  });
  const prompt = commitCalls(calls)[0].prompt;
  assert.match(prompt, /git add -A/, "the git add -A ban is present");
  assert.match(
    prompt,
    /notes\/local-memo\.md/,
    "the baseline untracked path lands in the never-stage set",
  );
  assert.match(
    prompt,
    /git rev-parse --show-toplevel/,
    "a given repo brings the repo confirmation guard",
  );
});

// A failed commit (a pre-commit gate block, say) does not stop the whole build. The work stays
// in the tree and the caller's final commit picks it up. The failure itself surfaces in the PR
// as an anomaly.
test("records an uncommitted anomaly without stopping when the commit agent returns committed: false", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo", commit: true },
    stubs: {
      agent: stubWith({ committed: false, subject: "", left_unstaged: ["gate blocked"] }),
    },
  });
  assert.equal(result.stopped, undefined, "a failed commit does not fail closed");
  assert.deepEqual(result.commits, [], "a failed commit does not land in commits");
  assert.deepEqual(
    result.anomalies,
    [{ unit: "U-1", kind: "uncommitted", notes: "gate blocked" }],
    "an anomaly of kind uncommitted lands with its reason",
  );
});

test("records an uncommitted anomaly without stopping when the commit agent returns null", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo", commit: true },
    stubs: { agent: stubWith(null) },
  });
  assert.equal(result.stopped, undefined, "a missing commit agent does not fail closed");
  assert.equal(result.anomalies[0].kind, "uncommitted", "an anomaly of kind uncommitted lands");
});

test("commits a direct-implementation unit with no tests and creates no Tests trailer", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: noTestPlan, repo: "/abs/target-repo", commit: true },
    stubs: { agent: stubWith(committed) },
  });
  assert.equal(
    commitCalls(calls).length,
    1,
    "the commit agent runs once for a direct-implementation unit too",
  );
  assert.doesNotMatch(
    commitCalls(calls)[0].prompt,
    /^Tests:/m,
    "a unit with no T-NNN carries no Tests trailer",
  );
  assert.deepEqual(
    result.commits.map((c) => c.unit),
    ["U-1"],
    "the direct-implementation unit lands in commits",
  );
});

// A unit whose Red went unconfirmed (already implemented) skips the implementation step, but the
// tests the Red step wrote stay in the tree. Those are committed here too, so they do not mix
// into the next unit's commit.
test("commits the test files Red wrote even for a unit that skipped implementation on an unconfirmed Red", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo", commit: true },
    stubs: {
      agent: (prompt, opts) => {
        const label = opts.label ?? "";
        if (label.startsWith("red2:"))
          return { red_confirmed: false, test_files: ["t.test.js"], notes: "already implemented" };
        if (label.startsWith("red:"))
          return { red_confirmed: false, test_files: ["t.test.js"], notes: "passed unexpectedly" };
        return stubWith(committed)(prompt, opts);
      },
    },
  });
  const commit = commitCalls(calls)[0];
  assert.ok(commit, "the commit agent runs for a unit with an unconfirmed Red");
  assert.match(commit.prompt, /t\.test\.js/, "the test file Red wrote lands in the staging set");
  assert.deepEqual(
    result.anomalies.map((a) => a.kind),
    ["no-red"],
    "only the no-red anomaly remains and no uncommitted one is added",
  );
});

// When the run stops at unit-failed, the commits made until then are no help for recovery unless
// the caller can see them.
test("carries commits in the unit-failed terminal return too", async () => {
  const twoUnits = {
    test_command: "echo test",
    units: [
      plan.units[0],
      { ...plan.units[0], id: "U-2", tests: [{ id: "T-002", name: "second statement" }] },
    ],
  };
  const { result } = await runWorkflow(codeJs, {
    args: { plan: twoUnits, repo: "/abs/target-repo", commit: true },
    stubs: {
      agent: (prompt, opts) => {
        const label = opts.label ?? "";
        if (label.startsWith("green:") && label.endsWith("U-2"))
          return { green: false, notes: "x" };
        if (label.startsWith("green2:")) return { green: false, notes: "x" };
        return stubWith(committed)(prompt, opts);
      },
    },
  });
  assert.equal(result.stopped, "unit-failed", "U-2 failing makes the run unit-failed");
  assert.deepEqual(
    result.commits.map((c) => c.unit),
    ["U-1"],
    "U-1's commit stays in the return value even when the run stops",
  );
});

// Tests live on the EN side only, so the static gates cover the EN tests alone.
// .ja/workflows/code.js never executes, but it is the source of intent, so its syntax is
// checked for breakage.
test("the static gates pass on the JA and EN code.js and on this test", () => {
  const scripts = [join(root, ".ja", "workflows", "code.js"), join(root, "workflows", "code.js")];
  const modules = [join(root, "workflows", "code", "tests", "code.commit.test.js")];
  for (const file of scripts) {
    checkWorkflowSyntax(file);
  }
  for (const file of modules) {
    execFileSync("node", ["--check", file], { cwd: root });
  }
  execFileSync("npx", ["oxlint", ...scripts, ...modules], { cwd: root });
});

// The commit body is copied into the commit agent's prompt, so a goal spanning lines would let
// the plan write extra trailer lines the block's own format promises are machine-generated.
test("flattens the goal so it cannot forge a trailer line in the commit block", async () => {
  const forging = {
    test_command: "echo test",
    units: [
      {
        id: "U-1",
        goal: "add the formatter\nIssue: #999",
        files: ["a.js"],
        contract: "c",
        tests: [],
        seam: false,
      },
    ],
  };
  const { calls } = await runWorkflow(codeJs, {
    args: { plan: forging, repo: "/abs/target-repo", commit: true, issue: "42" },
    stubs: { agent: stubWith(committed) },
  });

  const prompt = commitCalls(calls)[0].prompt;
  const trailers = prompt.split("\n").filter((line) => line.startsWith("Issue: "));
  assert.deepEqual(
    trailers,
    ["Issue: #42"],
    "only the script's own Issue trailer stands on a line",
  );
  assert.match(
    prompt,
    /add the formatter Issue: #999/,
    "the goal survives verbatim as text, just no longer on lines of its own",
  );
});

// The unit id reaches an agent label, the Unit trailer, and the returned identifier, so a plan
// whose id spans lines would forge a trailer the same way a goal could.
test("normalizes a unit id spanning lines so it cannot forge a trailer or a label", async () => {
  const forging = {
    test_command: "echo test",
    units: [
      {
        id: "U-1\nSeam: true",
        goal: "g",
        files: ["a.js"],
        contract: "c",
        tests: [],
        seam: false,
      },
    ],
  };
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: forging, repo: "/abs/target-repo", commit: true },
    stubs: { agent: stubWith(committed) },
  });

  const prompt = commitCalls(calls)[0].prompt;
  assert.deepEqual(
    prompt.split("\n").filter((line) => line.startsWith("Seam: ")),
    ["Seam: false"],
    "only the script's own Seam trailer stands on a line",
  );
  assert.deepEqual(
    result.completed,
    ["U-1 Seam: true"],
    "the returned id carries the same normalized form the label and trailer used",
  );
});

// Without repo the anchor was a no-op and the agent resolved the repository from its own cwd,
// which #204 measured running a step in the wrong checkout (DR-0105).
test("T-001 a code run with no args.repo stops with no-repo and names the argument shape", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan },
    stubs: { agent: stubWith(committed) },
  });
  assert.equal(result.stopped, "no-repo");
  assert.match(result.why, /args\.repo/, "the reason names the argument to pass");
  assert.equal(calls.agent.length, 0, "no agent runs before the target repository is known");
});

test("T-002 a code run given args.repo prepends the repository pin to every agent prompt", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "/abs/target-repo" },
    stubs: { agent: stubWith(committed) },
  });
  assert.ok(calls.agent.length > 0, "agents ran");
  for (const c of calls.agent) {
    assert.match(c.prompt, /cd \/abs\/target-repo &&/, `${c.opts.label ?? "?"} carries the pin`);
  }
});
