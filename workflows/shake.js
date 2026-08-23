export const meta = {
  name: "shake",
  description:
    "Deterministic flaky-test detection workflow. Shakes the target tests 10 times per each of 4 dimensions (repeat / order / parallelism / seed) with a static smell scan running alongside, and classifies each target as confirmed-flaky / latent-flaky / stable. The script enforces the run counts and the classification rule, so thinned-out runs and lenient stable verdicts cannot happen. confirmed-flaky targets get a root-cause fix verified by re-shake.",
  whenToUse:
    "When tests fail intermittently, CI goes red at random, or you want to surface latent flakiness in green tests. Use fix for a single confirmed bug, the audit workflow for static-only review. args is a test path / suite filter string, or {scope, base, repo}. Omitted: test files touched in the working tree and the base branch diff.",
  phases: [{ title: "Route" }, { title: "Shake" }, { title: "Fix" }],
};

// Three design points.
// 1. "≥10 runs per dimension" is enforced twice: by schema (runs minItems) and by script
//    recount. Left to the LLM, the count could be thinned via self-report; in the
//    workflow, a dimension without 10 individual run records counts as unshaken and is
//    structurally shut out of a stable verdict (fail-close).
// 2. Classification (confirmed-flaky / latent-flaky / stable) is computed by script rule
//    from run records and smell hits, not reported by an agent.
// 3. The 4 dimensions + smell scan run in parallel per target, and targets flow
//    independently through a pipeline (the slowest target does not block the rest).
//
// An inconclusive verdict. When a shake agent stalls
// or records fewer than 10 runs, the dimension becomes unshaken, and inconclusive is the
// catch basin that keeps such targets from claiming stable.
// The run-number placeholder in commands is {RUN} (angle brackets are avoided because
// guardrails raw-html misreads them as HTML tags).

const parseArgs = () => {
  if (typeof args === "object" && args) return args;
  if (typeof args !== "string") return {};
  const s = args.trim();
  if (s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // malformed JSON falls through to the scope shorthand below
    }
  }
  return { scope: args };
};
const opts = parseArgs();
const scope = typeof opts.scope === "string" ? opts.scope : "";
const base = typeof opts.base === "string" && opts.base.trim() ? opts.base.trim() : "main";
const repo = typeof opts.repo === "string" ? opts.repo : "";
if (!repo) {
  return {
    stopped: "no-repo",
    why: `Pass the target repository as args.repo (absolute path): Workflow({name: "shake", args: {repo: "/abs/path"}}).`,
  };
}

const anchor = (p) =>
  `Run every git / file / test command from the ${repo} repository (start each shell command with \`cd ${repo} && \`).\n\n${p}`;

const RUNS = 10;
const MAX_FIX_ATTEMPTS = 3;
const DIMENSIONS = [
  { key: "repeat", exposes: "unseeded randomness / timing" },
  { key: "order", exposes: "cross-test shared state" },
  { key: "parallelism", exposes: "races on shared resources" },
  { key: "seed", exposes: "direct PRNG dependence" },
];

// Scope Invariant and anti-gaming. Shared
// norms embedded in both the fix and the invariant-check prompts.
const INVARIANT_RULES =
  `A flaky fix changes how a test runs, never what it asserts.\n` +
  `What is allowed is clock injection / fake timers, pinning the seed, per-test state isolation, mocking the I/O boundary, unique temp dir / port per test.\n` +
  `What is forbidden is loosening an assertion or widening a tolerance, skipping / .only-ing / removing the test, replacing a real assertion with an always-pass stub, adding a blanket retry, tampering with the shake command or count. ` +
  `The forbidden routes convert a flake into a silent gap, which is worse than the flake itself.`;

// Trigger to root-cause fix mapping.
const FIX_DIRECTIONS =
  `wall-clock -> inject a clock; fake timers (jest.useFakeTimers, tokio::time::pause)\n` +
  `random -> pin the seed; assert on derived invariants, not raw draws\n` +
  `fixed-sleep -> await the actual condition; fake the clock\n` +
  `shared-state -> fresh fixture per test; reset in teardown; remove globals\n` +
  `order -> make each test self-contained; keep randomized order on\n` +
  `fixed-path-io -> unique temp dir / port per test; mock the external boundary`;

const ROUTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ecosystem", "targets"],
  properties: {
    ecosystem: { type: "string" },
    targets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "file", "commands"],
        properties: {
          id: { type: "string" },
          file: { type: "string" },
          commands: {
            type: "object",
            additionalProperties: false,
            required: ["repeat", "order", "parallelism", "seed"],
            properties: {
              repeat: { type: "string" },
              order: { type: "string" },
              parallelism: { type: "string" },
              seed: { type: "string" },
            },
          },
        },
      },
    },
    reason: { type: "string" },
  },
};

const SHAKE_RUN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ran", "runs"],
  properties: {
    ran: { type: "boolean" },
    runs: {
      type: "array",
      minItems: RUNS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pass"],
        properties: {
          pass: { type: "boolean" },
          note: { type: "string", description: "gist of the error on fail" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const SMELL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["smells"],
  properties: {
    smells: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["smell", "location", "evidence", "fix_direction"],
        properties: {
          smell: {
            type: "string",
            enum: ["wall-clock", "unseeded-random", "fixed-sleep", "shared-state", "fixed-path-io"],
          },
          location: { type: "string", description: "file:line" },
          evidence: { type: "string" },
          fix_direction: { type: "string" },
        },
      },
    },
  },
};

const FIX_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["applied", "trigger", "summary"],
  properties: {
    applied: { type: "boolean" },
    trigger: { type: "string" },
    changed_files: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
};

const INVARIANT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["held", "reason"],
  properties: {
    held: { type: "boolean" },
    reason: { type: "string" },
  },
};

// Compute the dimension verdict from run records. Fewer than 10 records is unshaken
// (same rank as a stall). All pass = stable; all fail = broken (constant failure, not
// flaky; reported as out of scope); mixed = flaky.
const dimVerdict = (result) => {
  if (!result || !result.ran || !Array.isArray(result.runs) || result.runs.length < RUNS) {
    return "unshaken";
  }
  const passes = result.runs.filter((r) => r.pass).length;
  if (passes === result.runs.length) return "stable";
  if (passes === 0) return "broken";
  return "flaky";
};

// ---- Route: ecosystem detection and target / per-dimension command decisions ----
phase("Route");
const scopeInstr = scope
  ? `The target is "${scope}" (test path / file / suite filter). Enumerate targets per matching test file or filter unit.`
  : `No target was given. Take the union of \`git diff --name-only\` and \`git diff ${base}...HEAD --name-only\`, keep test files only, and use them as targets. If both are empty, return targets: [] and explain in reason.`;
const route = (await agent(
  anchor(
    `You handle the Route stage of shake.\n` +
      `1. ${scopeInstr}\n` +
      `2. Identify the test ecosystem (cargo test / nextest / jest / vitest etc.) from the project manifest.\n` +
      `3. Build the 4 dimension commands per target. Each command runs only that target once; the shake runner loops it ${RUNS} times. Including the string {RUN} substitutes the run number (1..${RUNS}) at execution time.\n` +
      `   repeat is a plain repeated normal run / order randomizes test order with a different seed each run (use {RUN} as the seed) / parallelism alternates serial and max-worker (a one-liner branching on {RUN} parity) / seed is a different explicit seed each run if the suite accepts one, else an empty string.\n` +
      `   For jest, for example, order is --shuffle with a seed, parallelism toggles --runInBand vs max workers. If a dimension cannot be constructed for the ecosystem, use an empty string.\n` +
      `Do not run or fix tests. This stage's job is deciding the commands only.`,
  ),
  {
    agentType: "general-purpose",
    phase: "Route",
    label: "route",
    model: "sonnet",
    schema: ROUTE_SCHEMA,
  },
)) || { ecosystem: "", targets: [], reason: "route agent returned no output" };

if (!route.targets.length) {
  return { stopped: "no-targets", why: route.reason || "No target tests." };
}
log(`Route: ecosystem=${route.ecosystem} targets=${route.targets.length}`);

// ---- Shake + Fix: each target flows independently ----
const results = await pipeline(
  route.targets,
  // stage 1: 4-dimension shake ∥ static smell scan
  async (t) => {
    const dims = DIMENSIONS.map((d) => ({
      ...d,
      command: (t.commands || {})[d.key] || "",
    }));
    const [smell, ...shakes] = await parallel([
      () =>
        agent(
          anchor(
            `You handle the static smell scan of shake. Scan the target test ${t.file} and its setup / fixtures / helpers with ugrep, and report signs of latent flakiness even where the test currently passes.\n` +
              `The smells and grep patterns are as follows. wall-clock (Date.now, new Date(, Instant::now, SystemTime::, time.Now) / unseeded-random (Math.random, thread_rng, rand::random, faker) / fixed-sleep (setTimeout, thread::sleep, tokio::time::sleep, sleep() / shared-state (static mut, mutable module-level globals, singletons, missing per-test reset) / fixed-path-io (fixed /tmp paths, fixed ports, real network, env reads).\n` +
              `Per hit, write file:line, the evidence, and the root-cause fix direction. The fix-direction mapping is as follows.\n${FIX_DIRECTIONS}\n` +
              `Do not do a general review of the test logic itself.`,
          ),
          {
            agentType: "general-purpose",
            phase: "Shake",
            label: `smell:${t.id}`,
            model: "sonnet",
            schema: SMELL_SCHEMA,
          },
        ),
      ...dims.map((d) => () => {
        if (!d.command)
          return Promise.resolve({
            ran: false,
            runs: [],
            notes: "unsupported",
          });
        return agent(
          anchor(
            `You handle the ${d.key} dimension of shake (it exposes ${d.exposes}). Run the command \`${d.command}\` ${RUNS} times. If it contains {RUN}, substitute the run number 1..${RUNS}.\n` +
              `Record each run's pass/fail as one element in runs (${RUNS} elements required; omitting runs or substituting an aggregate is not allowed). For failed runs, copy the gist of the error into note.\n` +
              `Do not change the test code or the command. Do not reduce the count. Even if you become convinced it is flaky midway, run all ${RUNS} times.`,
          ),
          {
            agentType: "general-purpose",
            phase: "Shake",
            label: `shake:${t.id}:${d.key}`,
            model: "sonnet",
            schema: SHAKE_RUN_SCHEMA,
          },
        );
      }),
    ]);
    const dimResults = dims.map((d, i) => {
      const r = shakes[i];
      const verdict = d.command ? dimVerdict(r) : "unsupported";
      return {
        dimension: d.key,
        verdict,
        fails:
          verdict === "flaky" || verdict === "broken" ? r.runs.filter((x) => !x.pass).length : 0,
        note: (r && r.notes) || "",
      };
    });
    // A smell-scan stall (agent returned no output) is carried so the per-target result
    // can distinguish an empty smells list from a stalled scan from a genuine no-smell
    // scan. The string mirrors adrift.js's "no output / stall" and stays English in both
    // the EN and .ja versions (structured token, not localized prose).
    return {
      dimResults,
      smells: (smell && smell.smells) || [],
      smellScan: smell ? "" : "no output / stall",
    };
  },
  // stage 2: script classification -> fix loop for confirmed-flaky only
  async (shaken, t) => {
    if (!shaken) return null;
    const { dimResults, smells } = shaken;
    const triggers = dimResults.filter((d) => d.verdict === "flaky");
    const broken = dimResults.filter((d) => d.verdict === "broken");
    const unshaken = dimResults.filter((d) => d.verdict === "unshaken");
    let verdict;
    if (triggers.length) verdict = "confirmed-flaky";
    else if (broken.length) verdict = "broken";
    else if (unshaken.length) verdict = "inconclusive";
    else if (smells.length) verdict = "latent-flaky";
    else verdict = "stable";
    log(
      `${t.id}: ${verdict}` +
        (triggers.length ? ` (trigger: ${triggers.map((d) => d.dimension).join(", ")})` : ""),
    );

    const fix = {
      applied: false,
      attempts: 0,
      reshake: "",
      invariant: "",
      blocker: "",
    };
    if (verdict === "confirmed-flaky") {
      let history = "";
      for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
        fix.attempts = attempt;
        const fixed = await agent(
          anchor(
            `You handle the fix stage of shake. Fix the root cause of the confirmed-flaky test ${t.file} (attempt ${attempt}/${MAX_FIX_ATTEMPTS}).\n` +
              `The trigger dimensions are ${triggers.map((d) => `${d.dimension} (${d.fails}/${RUNS} fail)`).join(", ")}.\n` +
              `The static smells (root-cause candidates) are as follows.\n${JSON.stringify(smells)}\n` +
              `The fix-direction mapping is as follows.\n${FIX_DIRECTIONS}\n\n${INVARIANT_RULES}\n` +
              (history
                ? `\nThe prior attempts and failure reasons are as follows (if a prior attempt violated the invariant, roll it back first, then fix properly).\n${history}`
                : ""),
          ),
          {
            agentType: "general-purpose",
            phase: "Fix",
            label: `fix:${t.id}#${attempt}`,
            model: "opus",
            schema: FIX_SCHEMA,
          },
        );
        if (!fixed || !fixed.applied) {
          history += `attempt ${attempt} applied no fix (${(fixed && fixed.summary) || "agent stall"})\n`;
          continue;
        }
        // independent invariant check ∥ re-shake of the trigger dimensions
        const [inv, ...reshakes] = await parallel([
          () =>
            agent(
              anchor(
                `You handle the invariant check of shake. Read \`git diff -- ${t.file}\` and the diffs of the files the fix touched (${JSON.stringify(fixed.changed_files || [])}), and judge whether the following norms held. Judge from the facts of the diff, not the fixer's claims.\n${INVARIANT_RULES}\nOn violation, set held: false and quote the offending diff in reason.`,
              ),
              {
                agentType: "critic-audit",
                phase: "Fix",
                label: `invariant:${t.id}#${attempt}`,
                model: "opus",
                schema: INVARIANT_SCHEMA,
              },
            ),
          ...triggers.map(
            (trg) => () =>
              agent(
                anchor(
                  `You handle the re-shake of shake. Run the fixed test with the command \`${t.commands[trg.dimension]}\` ${RUNS} times (${trg.dimension} dimension). Substitute {RUN} with the run number 1..${RUNS}. Record each run's pass/fail as one element in runs (${RUNS} elements required). Do not change the test code or the command.`,
                ),
                {
                  agentType: "general-purpose",
                  phase: "Fix",
                  label: `reshake:${t.id}:${trg.dimension}#${attempt}`,
                  model: "sonnet",
                  schema: SHAKE_RUN_SCHEMA,
                },
              ),
          ),
        ]);
        // an invariant violation does not count as a fix (a stall is treated as a violation, fail-close)
        if (!inv || !inv.held) {
          fix.invariant = (inv && inv.reason) || "invariant check stall (fail-close)";
          history += `attempt ${attempt} violated the invariant. ${fix.invariant}\n`;
          continue;
        }
        const reshakeVerdicts = triggers.map((trg, i) => ({
          dimension: trg.dimension,
          verdict: dimVerdict(reshakes[i]),
        }));
        const residual = reshakeVerdicts.filter((r) => r.verdict !== "stable");
        if (!residual.length) {
          fix.applied = true;
          fix.invariant = "held";
          fix.reshake = `all trigger dimensions ${RUNS}/${RUNS} stable`;
          break;
        }
        fix.reshake = residual.map((r) => `${r.dimension}=${r.verdict}`).join(", ");
        history += `attempt ${attempt} left residual flake on re-shake (${fix.reshake})\n`;
      }
      if (!fix.applied) {
        // a flake that survives 3 fix attempts is reported as a blocker, not weakened away
        fix.blocker = `The flake survived ${fix.attempts} fix attempts. Reported as a blocker without weakening the test.`;
      }
    }
    return {
      id: t.id,
      file: t.file,
      verdict,
      triggers: triggers.map((d) => ({
        dimension: d.dimension,
        fails: `${d.fails}/${RUNS}`,
      })),
      broken: broken.map((d) => d.dimension),
      unshaken: unshaken.map((d) => d.dimension),
      smells,
      // Emitted only on a smell-scan stall, so a genuine stable target carries no stall
      // marker and the two are distinguishable in the per-target result.
      ...(shaken.smellScan ? { smellScan: shaken.smellScan } : {}),
      fix,
    };
  },
);

const verdictsOut = results.filter(Boolean);
// Targets the pipeline dropped to null (a stage returned no output) are recovered by
// index-zipping route.targets with results, mirroring audit.js's per-unit drop
// accounting, so a silently vanished target surfaces as an id instead of disappearing.
const dropped = route.targets.filter((_, i) => !results[i]).map((t) => t.id);
const blockers = verdictsOut.filter((r) => r.fix && r.fix.blocker);
const counts = verdictsOut.reduce((acc, r) => {
  acc[r.verdict] = (acc[r.verdict] || 0) + 1;
  return acc;
}, {});
log(
  `Shake done: ${verdictsOut.length} targets (${Object.entries(counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")})` +
    (dropped.length ? ` dropped=${dropped.length}` : "") +
    (blockers.length ? ` blockers=${blockers.length}` : ""),
);

return {
  ecosystem: route.ecosystem,
  runs_per_dimension: RUNS,
  targets: verdictsOut,
  dropped,
  blockers: blockers.map((r) => ({
    id: r.id,
    file: r.file,
    why: r.fix.blocker,
  })),
};
