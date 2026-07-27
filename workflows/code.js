export const meta = {
  name: "code",
  description:
    'TDD workflow that takes a structured plan (units / test_command) and implements per unit under script enforcement. A unit with test scenarios runs Red -> Green; a unit with no tests (docs / config, no verifiable behavior) runs a single direct-implementation step, so whether TDD applies is selected in the plan, not decided at runtime. An unconfirmed Red is recorded as an anomaly, and at the end an independent agent verifies the full suite + lint + type-check. With commit: true each unit lands as its own commit carrying the plan\'s instruction as trailers (DR-0088). Callable standalone or nested from build via workflow("code").',
  whenToUse:
    "Headless plan implementation. args is {plan, repo, model, commit, issue, untracked_baseline}; plan is a structured plan with units / test_command (as produced by the think skill). model (optional) propagates only to the implementation agents (defaults to sonnet). commit: true commits each unit as it completes; issue / untracked_baseline feed the commit trailers and the never-stage set. The implementation agents run at effort xhigh.",
  phases: [{ title: "Implement" }, { title: "Verify" }],
};

// args may arrive as an object or a stringified JSON; normalize once. Nested
// workflow("code", {plan}) arrives as an object.
const parseArgs = () => {
  if (typeof args === "object" && args) return args;
  if (typeof args !== "string") return {};
  const s = args.trim();
  if (s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // malformed JSON falls through to the no-plan fail-close
    }
  }
  return {};
};
const input = parseArgs();
const plan = input.plan;
if (!plan || !Array.isArray(plan.units) || !plan.units.length) {
  return {
    stopped: "no-plan",
    why: "Pass a structured plan (units required) as args.plan.",
  };
}
const repo = typeof input.repo === "string" ? input.repo : "";
const anchor = (p) =>
  repo
    ? `Run every git, file, and build command from the repository at ${repo} (begin each shell command with \`cd ${repo} && \`).\n\n${p}`
    : p;

// Commits are opt-in because a standalone caller has not moved its diff base off
// HEAD. Once HEAD moves, that caller's verification silently sees an empty diff
// (DR-0088).
const commitPerUnit = input.commit === true;
const issueRef = String(input.issue || "")
  .replace(/^#/, "")
  .trim();
const untrackedBaseline = Array.isArray(input.untracked_baseline) ? input.untracked_baseline : [];

// The plan lists units in implementation order; run them as listed.
const units = plan.units;

const testCmd = plan.test_command || "";
const completed = [];
const anomalies = [];
const commits = [];
// The three mid-loop terminal returns share this shape; completed / anomalies close over
// the run-level arrays so the caller still sees partial progress
const stopUnit = (stopped, unit, why) => ({
  stopped,
  unit: unit.id,
  why,
  completed,
  anomalies,
  commits,
});
// Shared by every implementation agent so a model/effort change lands once. Implementation
// executes the plan's contract / tests, so sonnet suffices; repeated failure here signals a
// defective plan.
const implementOpts = { model: input.model || "sonnet", effort: "xhigh" };

const RED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["red_confirmed", "test_files", "notes"],
  properties: {
    red_confirmed: {
      type: "boolean",
      description: "true when you ran the tests you wrote and confirmed they fail as expected",
    },
    test_files: { type: "array", items: { type: "string" } },
    notes: {
      type: "string",
      description: "when red_confirmed is false, the reason (e.g. the behavior already exists)",
    },
  },
};

const GREEN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["green", "notes", "deferred"],
  properties: {
    green: {
      type: "boolean",
      description: "true when all of the unit's tests pass",
    },
    notes: { type: "string" },
    deferred: {
      type: "array",
      items: { type: "string" },
      description:
        "items required by the contract / files that this unit did not implement; empty array if none. Only items listed here count as legitimate deferrals and are recorded as anomalies",
    },
  },
};

const COMMIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["committed", "subject", "left_unstaged"],
  properties: {
    committed: { type: "boolean" },
    subject: { type: "string", description: "the Conventional Commits subject line you wrote" },
    left_unstaged: {
      type: "array",
      items: { type: "string" },
      description:
        "paths deliberately left unstaged, or - when committed is false - the reason nothing was committed",
    },
  },
};

// Never put the agent's prompt text in the message: the prompt carries issue-derived
// (untrusted) prose, and a commit message becomes an unamendable record. Trailer form
// keeps the plan's anchors machine-readable (git interpret-trailers / git log --format).
const commitBody = (unit, tests) =>
  [
    unit.goal,
    "",
    `Unit: ${unit.id}`,
    `Contract: ${String(unit.contract || "")
      .split("\n")
      .join(" ")}`,
    ...(tests.length ? [`Tests: ${tests.map((t) => t.id).join(", ")}`] : []),
    `Seam: ${unit.seam === true}`,
    ...(issueRef ? [`Issue: #${issueRef}`] : []),
  ].join("\n");

// Taken while the working tree still holds only that unit's work; splitting the merged
// tree afterwards would be an LLM guess at hunk ownership. A failed commit (a blocking
// pre-commit gate, DR-0064) does not stop the run because the work stays in the tree
// and the caller's final commit sweeps it up.
const commitUnit = async (unit, tests, testFiles) => {
  if (!commitPerUnit) return;
  const res = await agent(
    anchor(
      `Commit the work of unit ${unit.id} as one commit.\n` +
        `Stage only this unit's work: the plan's target files ${JSON.stringify(unit.files)}` +
        (testFiles.length ? `, the test files ${JSON.stringify(testFiles)}` : "") +
        `, and any other file you created or modified for this unit during this run. Never run \`git add -A\` or \`git add .\`. ` +
        (untrackedBaseline.length
          ? `Never stage these paths: ${JSON.stringify(untrackedBaseline)} - they were in the working tree before this run, and staging one leaks local notes and config into the PR. `
          : "") +
        `List anything you left unstaged in left_unstaged.\n` +
        `Commit with \`git commit -F {tempfile}\`. The message has three parts: a Conventional Commits subject you write yourself from the staged diff (<= 72 chars, imperative, lowercase, no trailing period), a blank line, and the following block copied verbatim. Add nothing, drop nothing, reword nothing:\n` +
        `${commitBody(unit, tests)}\n` +
        `If applying the staging rules leaves nothing staged, do not commit: return committed: false with the reason in left_unstaged.` +
        (repo
          ? ` Before committing, run \`git rev-parse --show-toplevel\` and confirm the output is ${repo}; if it differs, abort without committing and report the mismatch.`
          : ""),
    ),
    {
      label: `commit:${unit.id}`,
      phase: `Unit ${unit.id}`,
      agentType: "general-purpose",
      schema: COMMIT_SCHEMA,
      model: "haiku",
    },
  );
  if (res && res.committed) {
    commits.push({ unit: unit.id, subject: res.subject });
    log(`${unit.id}: committed (${res.subject}).`);
    return;
  }
  const why = res ? (res.left_unstaged || []).join(" / ") : "the commit agent returned no result";
  anomalies.push({ unit: unit.id, kind: "uncommitted", notes: why });
  log(`${unit.id}: not committed (${why}). Left in the working tree.`);
};

// Deferral detection turns the agent's self-report (deferred) into anomalies in the
// script. Guards against a silent scope cut shipping green with code_anomalies: 0
// (kizalas #578).
const recordDeferred = (unit, result) => {
  if (result && Array.isArray(result.deferred) && result.deferred.length) {
    anomalies.push({ unit: unit.id, kind: "scope-cut", notes: result.deferred.join(" / ") });
    log(`${unit.id}: recorded ${result.deferred.length} deferred item(s) as an anomaly.`);
  }
};

// ---- Implement: per unit, serial (the working tree is shared) ----
// A unit with tests runs Red -> Green; one with no tests runs a single direct step.
// The plan selects which; no TDD-or-not discretion exists at runtime.
phase("Implement");

// The reference module (when the plan names one) is what keeps a new feature shaped like
// its neighbors. A contract cites one behavior; without this, the surrounding structure
// gets hand-rolled and drifts from the established shape.
const ref = plan.reference_module;
const referenceModuleCtx = ref?.path
  ? `This feature replicates the structure of the existing module ${ref.path}` +
    (ref.instances >= 2 ? ` (the ${ref.instances + 1}th instance of an established shape)` : "") +
    `. Read its files before writing: ${JSON.stringify(ref.files || [])}. ` +
    `Mirror its directory layout, component names, export names, and the shared components it composes; do not hand-roll an equivalent. ` +
    (ref.conventions?.length ? `Conventions to keep: ${ref.conventions.join(" / ")}. ` : "") +
    `Deviating from the reference module is allowed only when the plan says so; state any deviation in your result.\n`
  : "";

for (const unit of units) {
  const tests = Array.isArray(unit.tests) ? unit.tests : [];
  const ctx =
    `Unit ${unit.id}'s goal is "${unit.goal}". The target files are ${JSON.stringify(unit.files)}.\n` +
    `The contract is ${unit.contract}. The test scenarios are ${JSON.stringify(tests)}.\n` +
    `The test command is ${testCmd}.\n` +
    referenceModuleCtx +
    `When writing framework / library API code, follow the pinned version's official docs rather than memory. Read docs with the WebFetch tool, not via shell. If unreachable, mark that API usage unverified in a code comment and keep implementing.\n` +
    `Before reporting the result, audit each claim against a tool result from this session. Report only work you can point to evidence for; state unverified items as such in notes.\n` +
    `Unit-test convenience is never a reason to drop part of the feature. Do not omit a shared component, a data fetch, or a navigation affordance because it would need a Router / Suspense / permission context; stub that boundary in the test instead. Deferrals absent from the plan are forbidden, including narrowing the implementation behind a code comment claiming a later unit will do it. If part of what the contract / files require must go unimplemented, list it in deferred (it is recorded as an anomaly and surfaced on the PR).\n` +
    // Consulting advisor mid-implementation clashes with build's design: blockers are recorded
    // as anomalies and heavy assurance is human-invoked on the draft PR (DR-0085, #221).
    `Do not call the advisor tool, even on design ambiguity or an environment blocker. Push through to the end on your own analysis alone; write the judgment you made into notes and any narrowed implementation into deferred, leaving it to the anomaly record.\n` +
    (unit.seam === true
      ? `This is the plan's seam unit: its tests are what catch units that are each green in isolation but never connected. Run the real modules across the unit boundary; fake only I/O with systems external to this one. Stubbing an internal layer here defeats the unit. Assert that the connections between what the preceding units built (calls, transitions, data handoffs) exist and are actually reachable; showing a leaf piece works on its own is not enough.\n`
      : "") +
    (completed.length ? `The units already implemented are ${completed.join(", ")}.\n` : "");

  // No tests is the plan's selection (docs / config). Implement directly and keep
  // the existing suite green.
  if (!tests.length) {
    let impl = await agent(
      anchor(
        `Direct implementation step. ${ctx}` +
          `Implement per the contract; write no new tests. Keep the existing test suite green (${testCmd}); weakening / skipping / deleting existing tests is forbidden. ` +
          `Run the suite and report green.`,
      ),
      {
        label: `impl:${unit.id}`,
        phase: `Unit ${unit.id}`,
        agentType: "general-purpose",
        schema: GREEN_SCHEMA,
        ...implementOpts,
      },
    );
    if (impl && !impl.green) {
      impl = await agent(
        anchor(
          `Direct implementation retry. ${ctx}` +
            `Last time the suite did not pass. The reason was ${impl.notes}.\nIdentify the cause, fix the implementation, and make the suite pass. Weakening tests is forbidden.`,
        ),
        {
          label: `impl2:${unit.id}`,
          phase: `Unit ${unit.id}`,
          agentType: "general-purpose",
          schema: GREEN_SCHEMA,
          ...implementOpts,
        },
      );
    }
    if (!impl || !impl.green) {
      return stopUnit(
        "unit-failed",
        unit,
        (impl && impl.notes) || "the implement agent returned no result",
      );
    }
    recordDeferred(unit, impl);
    completed.push(unit.id);
    log(`${unit.id}: direct implementation done (${completed.length}/${units.length}).`);
    await commitUnit(unit, tests, []);
    continue;
  }

  let red = await agent(
    anchor(
      `TDD Red step. ${ctx}` +
        `Write each test scenario (T-NNN) as a failing test. Use the scenario's name verbatim as the test name. ` +
        `Write no implementation code whatsoever. Run the tests and confirm each fails for the intended reason, then report. ` +
        `Deleting, moving, renaming, or emptying an existing file to manufacture a Red is forbidden. When the target behavior is already implemented, that is the correct state: keep red_confirmed=false and write the reason in notes. ` +
        `If the tests do not fail, do not implement; write the reason in notes.`,
    ),
    {
      label: `red:${unit.id}`,
      phase: `Unit ${unit.id}`,
      agentType: "general-purpose",
      schema: RED_SCHEMA,
      ...implementOpts,
    },
  );
  if (red && !red.red_confirmed) {
    // Red unconfirmed = either the behavior already exists or the test is vacuous.
    // Scrutinize exactly once.
    red = await agent(
      anchor(
        `TDD Red step retry. ${ctx}` +
          `Last time the tests did not fail. The reason was ${red.notes}.\n` +
          `Scrutinize whether the tests really verify the target behavior (assertions are not empty, the target code is invoked). ` +
          `If after scrutiny the tests still pass, judge the behavior as already implemented and keep red_confirmed=false with the reason in notes.`,
      ),
      {
        label: `red2:${unit.id}`,
        phase: `Unit ${unit.id}`,
        agentType: "general-purpose",
        schema: RED_SCHEMA,
        ...implementOpts,
      },
    );
  }
  if (!red) return stopUnit("red-failed", unit, "the red agent returned no result");
  if (!red.red_confirmed) {
    anomalies.push({ unit: unit.id, kind: "no-red", notes: red.notes });
    log(`${unit.id}: Red unconfirmed (${red.notes}). Skipping the implement step.`);
    completed.push(unit.id);
    // The implement step is skipped, but the tests the Red step wrote stay in the tree.
    await commitUnit(unit, tests, red.test_files || []);
    continue;
  }

  let green = await agent(
    anchor(
      `TDD Green step. ${ctx}` +
        `Write the minimal implementation that makes the failing tests in ${JSON.stringify(red.test_files)} pass. ` +
        `Make one test pass at a time; never bulk-implement against all tests at once. ` +
        `Changes that weaken / skip / delete test assertions are forbidden. If the test structure needs fixing, write it in notes and return green=false. ` +
        `After passing, refactor while keeping the tests green. Re-run the unit's tests and report.`,
    ),
    {
      label: `green:${unit.id}`,
      phase: `Unit ${unit.id}`,
      agentType: "general-purpose",
      schema: GREEN_SCHEMA,
      ...implementOpts,
    },
  );
  if (green && !green.green) {
    green = await agent(
      anchor(
        `TDD Green step retry. ${ctx}` +
          `Last time the tests did not pass. The reason was ${green.notes}.\nIdentify the cause, fix the implementation, and make the unit's tests pass. Weakening tests is forbidden.`,
      ),
      {
        label: `green2:${unit.id}`,
        phase: `Unit ${unit.id}`,
        agentType: "general-purpose",
        schema: GREEN_SCHEMA,
        ...implementOpts,
      },
    );
  }
  if (!green || !green.green) {
    return stopUnit(
      "unit-failed",
      unit,
      (green && green.notes) || "the green agent returned no result",
    );
  }
  recordDeferred(unit, green);
  completed.push(unit.id);
  log(`${unit.id}: Red -> Green done (${completed.length}/${units.length}).`);
  await commitUnit(unit, tests, red.test_files || []);
}

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tests_pass", "gates_pass", "output_tail"],
  properties: {
    tests_pass: { type: "boolean" },
    gates_pass: {
      type: "boolean",
      description: "true when lint / type-check pass",
    },
    output_tail: {
      type: "string",
      description: "on failure, the tail of the failing output",
    },
  },
};

// ---- Verify: an independent agent uninvolved in the implementation re-runs everything ----
phase("Verify");
const verify = (await agent(
  anchor(
    `Verification stage. Run the full test suite (${testCmd}) and the project's lint / type-check gates, and report the results as they are. Fix nothing.`,
  ),
  {
    label: "verify",
    phase: "Verify",
    agentType: "general-purpose",
    schema: VERIFY_SCHEMA,
    model: "sonnet",
  },
)) || {
  tests_pass: false,
  gates_pass: false,
  output_tail: "the verify agent returned no result",
};

log(
  `code: ${completed.length}/${units.length} unit(s) done, ${commits.length} commit(s), ${anomalies.length} anomaly(ies), verify tests=${verify.tests_pass} gates=${verify.gates_pass}.`,
);

return {
  completed,
  anomalies,
  commits,
  // With every unit's tests empty the suite verified nothing; the real automated
  // verification is the gates. Make it explicit so the caller never misreads
  // "all tests green" as an independent signal.
  verification: units.some((u) => (Array.isArray(u.tests) ? u.tests : []).length)
    ? "tests+gates"
    : "gates-only",
  tests_pass: verify.tests_pass,
  gates_pass: verify.gates_pass,
  verify_output: verify.output_tail,
};
