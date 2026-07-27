export const meta = {
  name: "audit",
  description:
    'Deterministic audit fan-out. File routing (glob table) runs in the script, so reviewer selection cannot drift; git I/O and each reviewer / critic run as agents. Pipeline is reviewer -> challenge -> verify -> integrate, not reviewer -> aggregate. Callable standalone or nested from build via workflow("audit").',
  whenToUse:
    "Fires the full adversarial reviewer set on a diff deterministically, instead of leaving review to the main loop's discretion. Invoked directly as /audit or Workflow({name:'audit'}); there is no launcher skill. BEFORE invoking, if scope or focus is unclear, ask the user two things: focus (all / security / performance / quality / a11y) and scope (the staged HEAD diff, a path, or another repo). Then pass them as args, e.g. Workflow({name:'audit', args:{focus:'security', scope:'src/'}}); omit args to audit the HEAD diff with focus=all. This workflow owns both the clarification handoff and the fan-out.",
  phases: [
    { title: "Pre-flight" },
    { title: "Route" },
    { title: "Review" },
    { title: "Challenge" },
    { title: "Verify" },
    { title: "Integrate" },
    { title: "Snapshot" },
  ],
};

// Routing lives in the script, not an agent: an agent re-deriving the glob
// table would reintroduce the exact drift this workflow exists to remove.
// Reviewers run on sonnet because opus + deep analysis stalls the stream
// watchdog.

// args may arrive as an object or, if a caller stringifies it, as a JSON-encoded
// string. Normalize once: a string that parses to an object is that object; any
// other string is the scope shorthand.
const parseArgs = () => {
  if (typeof args === "object" && args) return args;
  if (typeof args !== "string") return {};
  const s = args.trim();
  if (s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // malformed JSON: fall through and treat the raw string as scope
    }
  }
  return { scope: args };
};
const opts = parseArgs();

const scope = typeof opts.scope === "string" ? opts.scope : "";
const focus = typeof opts.focus === "string" ? opts.focus : "all";
const repo = typeof opts.repo === "string" ? opts.repo : "";
// noLimit skips the >30-file guard; skipPreflight lets a caller that already
// drove tests to green (build's Code phase) suppress the redundant test run.
const noLimit = opts.noLimit === true;
const skipPreflight = opts.skipPreflight === true;
const anchor = (p) =>
  repo
    ? `Run every git command from the repository at ${repo} (begin each shell command with \`cd ${repo} && \`).\n\n${p}`
    : p;
// Plugin-aware asset resolution. When this script ships as a plugin, bundled assets
// live under ~/.claude/plugins instead of ~/.claude; the shell fragment tries the
// dev-tree path first, so the dev tree keeps working unchanged.
const bundled = (rel) =>
  `"$(P="$HOME/.claude/${rel}"; [ -f "$P" ] || P="$(find "$HOME/.claude/plugins" -path "*/${rel}" 2>/dev/null | sort -V | tail -1)"; printf %s "$P")"`;

// audit/snapshot.py resolves the timestamp, branch, and the delta against the
// prior snapshot. The agent only writes the payload to a temp file and runs the
// script once; the disk side-effect is the goal, its result is not consumed.
const writeSnapshot = async ({ preFlight, rawFindings, findings, skipped }) => {
  phase("Snapshot");
  const payload = JSON.stringify({
    scope: scope || "HEAD",
    focus,
    pre_flight: preFlight,
    raw_findings: rawFindings,
    findings,
    skipped,
  });
  await agent(
    anchor(
      `You are the snapshot stage of an audit. Write the following JSON payload to a temp file and run ` +
        `\`python3 ${bundled("workflows/audit/snapshot.py")} < <tempfile>\` once. ` +
        `The script resolves the timestamp, branch, and the delta against the ` +
        `prior snapshot (resolved / new / carried, matched on file + message), writes the record under ` +
        `$HOME/.claude/history/, and prints the output path to stdout. ` +
        `Do not review code or change any finding. Do not write the file by any other means. The payload is as follows.\n${payload}`,
    ),
    {
      agentType: "general-purpose",
      phase: "Snapshot",
      label: "snapshot",
      model: "haiku",
    },
  );
};

// /audit routing table. react-pattern only attaches to JSX files (jsx / tsx), so a
// pure-js audit does not fire it on empty. Heuristic: React written without JSX
// loses react-pattern. A file takes the first matching row via classify(). Mechanical
// type checks (any / assertions / strict mode) belong to the gates linters, not a reviewer.
const ROUTING = {
  "*.sh": ["security", "silence", "duplication", "reuse", "efficiency", "operations", "resilience"],
  "*.js": [
    "security",
    "silence",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "testability",
    "operations",
    "resilience",
  ],
  "*.ts": [
    "security",
    "silence",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "testability",
    "operations",
    "resilience",
  ],
  "*.jsx": [
    "security",
    "silence",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "react-pattern",
    "testability",
    "operations",
    "resilience",
    "accessibility",
    "progressive",
  ],
  "*.tsx": [
    "security",
    "silence",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "react-pattern",
    "testability",
    "operations",
    "resilience",
    "accessibility",
    "progressive",
  ],
  "*.rs": [
    "security",
    "silence",
    "rust",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "testability",
    "operations",
    "resilience",
  ],
  "*.py": [
    "security",
    "silence",
    "duplication",
    "reuse",
    "efficiency",
    "design",
    "testability",
    "operations",
    "resilience",
  ],
  "*.md": ["prompt"],
  "*.css,*.html": ["accessibility", "progressive", "duplication"],
  test: ["coverage", "testability"],
  default: ["duplication", "reuse", "efficiency"],
};

// /audit focus filter, intersected with the routed reviewers.
const FOCUS = {
  security: ["security", "silence"],
  performance: ["react-pattern", "efficiency", "progressive"],
  quality: [
    "readability",
    "design",
    "react-pattern",
    "rust",
    "causation",
    "resilience",
    "duplication",
    "reuse",
    "testability",
    "operations",
    "prompt",
    "silence",
  ],
  a11y: ["accessibility", "progressive"],
  all: null,
};

const ext = (p) => {
  const base = p.slice(p.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
};
const classify = (p) => {
  if (/(^|\/|\.)test\./.test(p)) return ROUTING.test;
  const e = ext(p);
  if (e === ".sh") return ROUTING["*.sh"];
  if (e === ".js") return ROUTING["*.js"];
  if (e === ".ts") return ROUTING["*.ts"];
  if (e === ".jsx") return ROUTING["*.jsx"];
  if (e === ".tsx") return ROUTING["*.tsx"];
  if (e === ".rs") return ROUTING["*.rs"];
  if (e === ".py") return ROUTING["*.py"];
  if (e === ".md") return ROUTING["*.md"];
  if (e === ".yaml" || e === ".yml" || e === ".json") return ROUTING["*.yaml,*.json"];
  if (e === ".css" || e === ".html") return ROUTING["*.css,*.html"];
  return ROUTING.default;
};

const FINDINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "line", "severity", "summary"],
        properties: {
          file: { type: "string" },
          line: { type: "string" },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
          },
          summary: { type: "string" },
        },
      },
    },
  },
};

const ROUTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["files"],
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "churn"],
        properties: {
          path: { type: "string", description: "repo-relative path" },
          churn: {
            type: "integer",
            description: "count of fix commits touching this file",
          },
        },
      },
    },
  },
};

const PREFLIGHT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ran"],
  properties: {
    ran: {
      type: "boolean",
      description: "true if a test command was found and executed",
    },
    runner: { type: "string", description: "detected task runner, or empty" },
    command: { type: "string", description: "test command run, or empty" },
    tests_passed: { type: "integer" },
    tests_failed: { type: "integer" },
    exit_code: { type: "integer" },
    note: {
      type: "string",
      description: "one line: skip reason, timeout, or summary",
    },
  },
};

// ---- Pre-flight ∥ Route: two stages that share no data run concurrently ----
// Bare phase() races under parallel(), so each thunk names its own group via
// opts.phase.
const scopeInstr = scope
  ? `Scope is "${scope}". Run \`git diff --name-only ${scope}\` for the file list.`
  : `No scope given. List staged + modified files: union of \`git diff --name-only HEAD\` and \`git diff --name-only --staged\`.`;
const [preFlightRaw, route] = await parallel([
  // Tests-only; static analysis is the gates hook's job. A test failure is
  // recorded as context but does not block and does not become a finding.
  async () => {
    if (skipPreflight) return { ran: false, note: "skipped by caller" };
    const pf = (await agent(
      anchor(
        `You are the pre-flight stage of an audit. Detect the project's task runner (package.json -> npm/yarn/pnpm/bun, Cargo.toml -> cargo, pyproject.toml -> poetry/uv, Makefile -> make, Taskfile.yml -> task), find its test script (try test, test:unit, test:ci, spec in order; fall back to \`command -v\` for vitest/jest/pytest/cargo test), and run it once with a 60-second timeout. Record pass/fail counts and the exit code. A non-zero exit or a timeout is recorded, not blocked; do not fix anything and do not review code. If no runner or test script is found, return ran=false with the reason in note.`,
      ),
      {
        agentType: "general-purpose",
        phase: "Pre-flight",
        label: "pre-flight",
        model: "sonnet",
        schema: PREFLIGHT_SCHEMA,
      },
    )) || { ran: false, note: "pre-flight agent returned no output" };
    log(
      pf.ran
        ? `Pre-flight: ${pf.command} -> ${pf.tests_passed || 0} passed, ${pf.tests_failed || 0} failed (exit ${pf.exit_code}).`
        : `Pre-flight skipped: ${pf.note}`,
    );
    return pf;
  },
  () =>
    agent(
      anchor(
        `You are the routing stage of an audit. ${scopeInstr}\n` +
          `For each file, count how many past fix commits touched it: \`git log --grep=fix --oneline -- <file>\` and read the line count as churn (0 is fine, keep the file). Return every file with its churn. Do not review anything; this stage only lists files.`,
      ),
      { label: "route", phase: "Route", schema: ROUTE_SCHEMA, model: "haiku" },
    ),
]);
const preFlight = preFlightRaw || {
  ran: false,
  note: "pre-flight stage failed",
};

const files = ((route && route.files) || []).filter((f) => f.path);
if (!files.length) {
  return {
    findings: [],
    skipped: [],
    why: "No files to audit for the given scope.",
  };
}

const focusSet = FOCUS[focus] === undefined ? null : FOCUS[focus];
const assign = {};
for (const f of files) {
  for (const r of classify(f.path)) {
    if (focusSet && !focusSet.includes(r)) continue;
    (assign[r] = assign[r] || []).push(f.path);
  }
}
const assignments = Object.entries(assign).map(([reviewer, fs]) => ({
  reviewer,
  files: fs,
}));

// The interactive /audit prompts to narrow scope past 30 files; headless has
// no prompt, so warn and continue.
if (files.length > 30 && !scope && !noLimit) {
  log(
    `File-count policy: ${files.length} files exceed the soft limit of 30 and no scope was given. Continuing headless (no narrow-scope prompt); pass a scope or noLimit to silence this.`,
  );
}

// Cap each agent at 10 files. Units carry their reviewer label so skips and
// raw_findings stay attributable after the parallel results are flattened.
const BATCH = 10;
const units = [];
for (const a of assignments) {
  if (a.files.length <= BATCH) {
    units.push({ reviewer: a.reviewer, files: a.files, label: a.reviewer });
  } else {
    for (let i = 0; i < a.files.length; i += BATCH) {
      units.push({
        reviewer: a.reviewer,
        files: a.files.slice(i, i + BATCH),
        label: `${a.reviewer}#${i / BATCH + 1}`,
      });
    }
  }
}
const churnMap = files
  .slice()
  .sort((a, b) => b.churn - a.churn)
  .map((f) => `${f.path}: ${f.churn}`)
  .join("\n");
log(
  `Routed ${files.length} file(s) to ${assignments.length} reviewer(s) in ${units.length} unit(s) [focus=${focus}]: ${assignments
    .map((a) => a.reviewer)
    .join(", ")}`,
);

// ---- Review ----
phase("Review");
const RELIABILITY =
  "Do NOT call the advisor tool; work autonomously from your own analysis. Complete within 8 minutes; if uncertain about a finding, include it rather than skip (the challenger prunes false positives). When the scope spans several files, follow the high-churn paths and do not spend the whole budget on the first file.";
const raw = await parallel(
  units.map(
    (u) => () =>
      agent(
        anchor(
          `reviewer-${u.reviewer}. Review these files from the diff. The targets are ${u.files.join(", ")}. ` +
            `Base the review on \`git diff ${scope || "HEAD"}\` for those paths. Every finding needs file:line. Return findings with severity.\n` +
            `The churn (fix-commit counts, high = fragile) is as follows.\n${churnMap}\n\n${RELIABILITY}`,
        ),
        {
          agentType: `reviewer-${u.reviewer}`,
          phase: "Review",
          label: u.label,
          model: "sonnet",
          schema: FINDINGS_SCHEMA,
        },
      ),
  ),
);
const findings = raw.filter(Boolean).flatMap((r) => r.findings || []);
// Capture per-reviewer attribution for the snapshot before the flatten above
// drops which unit produced what.
const rawFindings = [];
units.forEach((u, i) => {
  const res = raw[i];
  if (res && res.findings) {
    for (const f of res.findings) {
      rawFindings.push({
        id: `R-${rawFindings.length + 1}`,
        reviewer: u.reviewer,
        file: f.file,
        line: f.line,
        severity: f.severity,
        message: f.summary,
      });
    }
  }
});
// Skip accounting is per-unit: keying on the reviewer would set "produced" from
// any surviving unit and hide the files a stalled unit never reviewed.
const skipped = units
  .filter((_, i) => !raw[i])
  .map((u) => ({
    reviewer: u.reviewer,
    label: u.label,
    files: u.files,
    reason: "no output / stall",
  }));

if (!findings.length) {
  await writeSnapshot({ preFlight, rawFindings, findings: [], skipped });
  return { findings: [], assignments, skipped };
}

// ---- Challenge ∥ Verify -> Integrate (reviewer -> aggregate is forbidden) ----
// Two independent passes over the same findings run concurrently; Integrate
// reconciles them with a fixed rule.
const findingsJson = JSON.stringify(findings);
const [challenged, verified] = await parallel([
  () =>
    agent(
      anchor(
        `critic-audit. Challenge these findings to prune false positives. Each finding is a position to be argued, not a fact. Reference each finding by its file:line. The findings are as follows.\n${findingsJson}`,
      ),
      {
        agentType: "critic-audit",
        phase: "Challenge",
        label: "challenge",
        model: "sonnet",
        // Judge stages take xhigh on the difficulty criterion (the docs' "the hardest coding
        // and agentic tasks"). They run for minutes, short of the long-horizon threshold, but
        // the quality of rejecting a finding drives false positives, so spend on accuracy.
        effort: "xhigh",
      },
    ),
  () =>
    agent(
      anchor(
        `critic-evidence. Verify these findings by tracing concrete execution paths (positive evidence, not intuition). For each finding, reference it by file:line and supply the execution-path evidence plus a severity. The findings are as follows.\n${findingsJson}`,
      ),
      {
        agentType: "critic-evidence",
        phase: "Verify",
        label: "verify",
        model: "sonnet",
        effort: "xhigh",
      },
    ),
]);

phase("Integrate");
const integrated = await agent(
  anchor(
    `enhancer-integration. Reconcile two independent passes over the same findings, matched by file:line, into cross-domain root causes and a severity-ordered list.\n` +
      `Membership rule: the challenge pass decides which findings survive. A finding the challenge pass pruned as a false positive stays pruned even if the verification pass found evidence for it. The verification pass only supplies execution-path evidence and severity for the survivors; it never revives a pruned finding.\n` +
      `The challenge pass (membership / false-positive pruning) is as follows.\n${challenged}\n\n` +
      `The verification pass (execution-path evidence + severity) is as follows.\n${verified}`,
  ),
  {
    agentType: "enhancer-integration",
    phase: "Integrate",
    label: "integrate",
    model: "opus",
    effort: "high",
    schema: FINDINGS_SCHEMA,
  },
);

const finalFindings = (integrated && integrated.findings) || findings;
await writeSnapshot({
  preFlight,
  rawFindings,
  findings: finalFindings,
  skipped,
});
return { findings: finalFindings, assignments, skipped };
