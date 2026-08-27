export const meta = {
  name: "assert",
  description:
    "Deterministic, independent outcome-based assertion workflow. Codex verifies independently in an isolated worktree, running alongside the audit workflow (reviewer -> challenge -> verify -> integrate). The script applies the ternary gate rule (Ready / Ready (caveat) / NotReady), so lenient self-reported gates and skipped dynamic evidence cannot happen.",
  whenToUse:
    "When you want an independent verdict on merge readiness from static + dynamic evidence. Use the polish workflow for a light code review, the audit workflow for static-only auditing. Identify the target repository (required); omitting it stops early as no-repo. Narrow the target with scope (a file or directory); when omitted, the target is the uncommitted changes, else the diff against base (default main).",
  phases: [
    { title: "Bootstrap" },
    { title: "Evidence" },
    { title: "Challenge" },
    { title: "Triage" },
    { title: "Synthesize" },
    { title: "Cleanup" },
  ],
};

// Four design points.
// 1. The static reviewer fan-out reuses the nested workflow("audit") instead of duplicating
//    the routing table (so a routing-table change propagates to assert directly). Audit
//    findings already passed critic-audit / critic-evidence inside audit, so assert's Challenge
//    applies only to Codex findings, avoiding a double challenge by the same agents.
// 2. The gate is computed by schema + script rule. Instead of decoding the gate from the
//    enhancer's prose, the script computes it by rule from (build, tests, issues), so the
//    re-spawn / fail-close machinery itself becomes unneeded.
// 3. worktree.py / bootstrap.py are deterministic scripts, so agents run them as-is.
//    The session id resolves via the agent environment's $CLAUDE_SESSION_ID, so setup and
//    cleanup derive the same branch / path from the same id and never drift.
// 4. adversarial (codex 600s) starts with Evidence and runs behind Challenge / Triage
//    (putting it in a barrier would let the longest stage block everything).
//
// When OUTCOME.md is absent, do NOT generate a stub via /outcome. assert is verification and
// has no write side-effects on the target repo. Record the absence in the report and move on.

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
    why: `Pass the target repository as args.repo (absolute path): Workflow({name: "assert", args: {repo: "/abs/path"}}).`,
  };
}

const anchor = (p) =>
  `Run every git / file / build command from the ${repo} repository (start each shell command with \`cd ${repo} && \`).\n\n${p}`;

// Plugin-aware asset resolution. When this script ships as a plugin, bundled assets
// live under ~/.claude/plugins instead of ~/.claude; the shell fragment tries the
// dev-tree path first, so the dev tree keeps working unchanged. The -e test admits a
// directory, which the SCRIPTS constant below needs.
const bundled = (rel) =>
  `"$(P="$HOME/.claude/${rel}"; [ -e "$P" ] || P="$(find "$HOME/.claude/plugins" -path "*/${rel}" -not -path "*/.ja/*" 2>/dev/null | sort -V | tail -1)"; printf %s "$P")"`;
// Scripts bundled with this workflow. The loader only reads .js directly under workflows/,
// so a subdir is a safe asset home (instructions and references live inside the workflow).
const SCRIPTS = bundled("workflows/assert");
// /outcome owns the emptiness criteria for OUTCOME.md, so Bootstrap reads its verdict
// instead of judging TBD markers by eye.
const OUTCOME_VALIDATOR = bundled("skills/outcome/scripts/validate-outcome.py");

// Inline the two rules of merge-findings.py in JS. P1 -> high, P2 -> medium, P3 -> dropped.
// critical / high / medium / low pass through. Unrecognized severities cannot be ranked,
// so they are dropped. The dedup key is file:line only (category schemas differ per
// source). On collision, keep the higher severity and union the sources.
const SEVERITY_MAP = {
  P1: "high",
  P2: "medium",
  P3: null,
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};
const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };
const mergeIssues = (findings) => {
  const groups = new Map();
  let dropped = 0;
  for (const f of findings) {
    const key = String(f.severity || "")
      .trim()
      .replace(/^\[|\]$/g, "");
    const sev = SEVERITY_MAP[key] === undefined ? null : SEVERITY_MAP[key];
    if (!sev) {
      dropped++;
      continue;
    }
    const sources = Array.isArray(f.source) ? f.source : f.source ? [f.source] : [];
    const k = `${f.file || ""}:${f.line || 0}`;
    const prev = groups.get(k);
    if (!prev) {
      groups.set(k, { ...f, severity: sev, source: [...sources] });
      continue;
    }
    for (const s of sources) if (!prev.source.includes(s)) prev.source.push(s);
    if (SEVERITY_RANK[sev] > SEVERITY_RANK[prev.severity]) {
      groups.set(k, { ...f, severity: sev, source: prev.source });
    }
  }
  const issues = [...groups.values()].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      String(a.file || "").localeCompare(String(b.file || "")) ||
      (a.line || 0) - (b.line || 0),
  );
  return { issues, dropped };
};

const BOOTSTRAP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "codex_available",
    "mode",
    "scope_files",
    "outcome",
    "worktree_ok",
    "install",
    "build",
  ],
  properties: {
    codex_available: { type: "boolean" },
    mode: { type: "string", enum: ["target", "diff", "none"] },
    diff_kind: { type: "string", enum: ["uncommitted", "branch", ""] },
    scope_files: { type: "array", items: { type: "string" } },
    outcome: {
      type: "string",
      description: "Digest of OUTCOME.md Behavior / Non-goals / Constraints. absent if missing",
    },
    worktree_ok: { type: "boolean" },
    worktree_path: { type: "string" },
    install: { type: "string", enum: ["ok", "fail", "skip"] },
    build: { type: "string", enum: ["pass", "fail", "skipped"] },
    reason: { type: "string" },
  },
};

const CODEX_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ran", "findings"],
  properties: {
    ran: { type: "boolean" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "line", "severity", "summary"],
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          severity: { type: "string", enum: ["P1", "P2", "P3"] },
          summary: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const TEST_RUN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["outcome"],
  properties: {
    outcome: { type: "string", enum: ["pass", "fail", "no-runner", "skipped"] },
    passed: { type: "number" },
    failed: { type: "number" },
    notes: {
      type: "string",
      description: "on fail, the gist of the stderr tail",
    },
  },
};

const ADVERSARIAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ran", "tests"],
  properties: {
    ran: { type: "boolean" },
    tests: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["test_name", "target", "assertion", "result"],
        properties: {
          test_name: { type: "string" },
          target: { type: "string", description: "file:line" },
          assertion: { type: "string" },
          result: { type: "string", enum: ["PASS", "FAIL"] },
          failure_detail: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "reason"],
  properties: {
    verdict: { type: "string", enum: ["promote", "exclude"] },
    reason: { type: "string" },
  },
};

const SYNTH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["issues", "root_causes", "report"],
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "line", "severity", "summary", "source"],
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
          },
          summary: { type: "string" },
          source: { type: "array", items: { type: "string" } },
        },
      },
    },
    root_causes: { type: "array", items: { type: "string" } },
    report: { type: "string" },
  },
};

// ---- Bootstrap: codex detection / mode decision / OUTCOME read / worktree setup ----
phase("Bootstrap");
const scopeInstr = scope
  ? `The scope is "${scope}". Use target mode: for a single file, that file; for a directory, the output of \`git ls-files ${scope}\` as scope_files.`
  : `No scope was given. If there are uncommitted changes (\`git status --porcelain\`), use diff mode (diff_kind: uncommitted) with \`git diff --name-only HEAD\`; otherwise use diff mode (diff_kind: branch) against commits ahead of the base branch ${base} with \`git diff --name-only ${base}...HEAD\` as scope_files. If both are empty, return mode: none.`;
const bootstrapPrompt = anchor(
  `You handle the Bootstrap stage of assert. Perform these in order.\n` +
    `1. Check for the codex CLI with \`command -v codex\`. If missing, set codex_available: false, skip the rest, and return mode: none.\n` +
    `2. Run ${OUTCOME_VALIDATOR} .claude/OUTCOME.md. If the JSON state is absent or empty, set outcome: "absent". Otherwise read the file and digest Behavior / Non-goals / Constraints into outcome. Do not generate a stub.\n` +
    `3. ${scopeInstr}\n` +
    `4. Unless mode is none, prepare an isolated worktree with ${SCRIPTS}/worktree.py "$CLAUDE_SESSION_ID" (if the JSON status is error, set worktree_ok: false and copy stderr into reason), then run ${SCRIPTS}/bootstrap.py "<worktree path>" and copy install / build / reason from its JSON. When diff_kind is uncommitted, mirror the uncommitted changes into the worktree (apply \`git diff HEAD\` on the worktree side, and cp untracked files among scope_files).\n` +
    `Do not review or fix code. This stage's job is environment setup and recording facts only.`,
);
const boot = (await agent(bootstrapPrompt, {
  agentType: "general-purpose",
  phase: "Bootstrap",
  label: "bootstrap",
  model: "sonnet",
  schema: BOOTSTRAP_SCHEMA,
})) || {
  codex_available: false,
  mode: "none",
  scope_files: [],
  outcome: "absent",
  worktree_ok: false,
  install: "fail",
  build: "skipped",
  reason: "bootstrap agent returned no output",
};

if (!boot.codex_available) {
  return {
    stopped: "codex-missing",
    why: "codex CLI is missing. Install it (e.g. brew install codex) and rerun.",
  };
}
if (boot.mode === "none") {
  return { stopped: "no-changes", why: boot.reason || "Nothing to assert." };
}

// Distinguish env fail (worktree impossible / install fail) from build smoke fail (the
// target itself does not build). Among dynamic-evidence gaps, only env fail may demote to
// caveat. Demoting a build smoke fail would produce a false Ready that lets a broken build
// reach merge.
const envFail = !boot.worktree_ok || boot.install === "fail";
const buildCol = envFail ? "skipped" : boot.build;
const dynamicOk = !envFail && buildCol !== "fail";
// The two Evidence stages below work in the isolated worktree, so anchor would name a second
// place. dynamicOk gates them on worktree_ok, so the path is always set where this is used.
const inWorktree = (p) =>
  `Run every git / file / build command from the worktree at ${boot.worktree_path} (start each shell command with \`cd ${boot.worktree_path} && \`).\n\n${p}`;
log(
  `Bootstrap: mode=${boot.mode} files=${boot.scope_files.length} build=${buildCol}` +
    (dynamicOk ? "" : ` (dynamic verification skipped: ${boot.reason || "env fail"})`),
);

let gate = "NotReady";
// Neither severity nor disposition gates, so a NotReady reader cannot infer the cause from the
// findings alone. These are the conditions that actually held.
const gateReason = [];
let issues = [];
// A finding dropped by `if (!sev) continue;` leaves no trace in the returned issues array.
// WORKFLOWS.md § Degradation recording puts that count on the return value.
let dropped = 0;
let testsCol = "skipped";
let adversarialSummary = {
  total: 0,
  passed: 0,
  failed: 0,
  promoted: 0,
  excluded: 0,
};
let synth = null;
let codexReview = null;
let audit = null;
// Not `const` inside the try: the record is written from the finally block, which a throw
// before Synthesize would otherwise reach with these out of scope.
let challengeStalled = false;
let auditDegraded = false;
let auditReason = "";

// ---- Run recording: one jsonl row per settled run, modeled on build.js's recordRun ----
// record.py copies the payload verbatim, so a key added here needs no change there.
const RECORD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["path"],
  properties: {
    path: { type: "string", description: "path from record.py's stdout JSON, verbatim" },
  },
};
const recordRun = async () => {
  const issueCounts = {};
  for (const i of issues) {
    const sev = i.severity || "unknown";
    issueCounts[sev] = (issueCounts[sev] || 0) + 1;
  }
  const payload = {
    gate,
    gate_reason: gateReason,
    build: buildCol,
    tests: testsCol,
    mode: boot.mode,
    issue_counts: issueCounts,
    dropped_findings: dropped,
    challenge_stalled: challengeStalled,
    audit_degraded: auditDegraded,
  };
  // recordRun runs in the finally block, so a throw here would replace whatever the try block
  // was throwing and hide the run's real failure behind a recorder failure.
  let written = null;
  try {
    written = await agent(
      anchor(
        `Record one assert run; do not judge, summarize, or edit any value. The steps are, (1) write this exact JSON to a temp file; ` +
          `(2) run \`python3 ${SCRIPTS}/record.py < <tempfile>\`; ` +
          `(3) return the script's stdout path verbatim. ` +
          `The script prints {"path":...}.\n` +
          `The input JSON is as follows.\n${JSON.stringify(payload)}`,
      ),
      {
        label: "record",
        agentType: "general-purpose",
        schema: RECORD_SCHEMA,
        model: "haiku",
      },
    );
  } catch {
    written = null;
  }
  const path = String((written && written.path) || "").trim();
  // Recording never gates assert, so a failed relay falls open instead of stopping the run.
  if (!path) {
    log(
      `The run row was not written (the recorder returned no path), so this run is missing from assert-runs.jsonl.`,
    );
  }
};

try {
  // ---- Evidence: audit ∥ Codex review ∥ test run ∥ adversarial generation ----
  // test / adversarial (up to 600s) are left running un-awaited, and Triage, which depends
  // only on those two, is started immediately as triageP so it overlaps behind the codex +
  // audit barrier. The challenger / verifier only need audit + Codex review.
  // guardrails sqli-concat scans template literals in call arguments, so prompts that
  // contain codex's execution subcommand name are built as bare assignments first and
  // then passed to anchor / agent.
  phase("Evidence");
  const fileList = boot.scope_files.join("\n");
  const testRunRaw =
    `You handle the test run stage of assert. Detect the project's test command and run it exactly once via \`timeout 600 codex exec -c sandbox_workspace_write.network_access=true -C ${boot.worktree_path} "Run the project test command. Report: (1) test exit code and last 50 lines of stderr if non-zero, (2) test summary (total/passed/failed)." </dev/null\`. ` +
    `The build already ran in bootstrap; do not rerun it. If no test runner is found, outcome: no-runner; on timeout or any other inability to run, outcome: skipped with the reason in notes. Do not fix anything.`;
  const adversarialRaw =
    `You handle the adversarial testing stage of assert. Run \`timeout 600 codex exec -c sandbox_workspace_write.network_access=true -C ${boot.worktree_path} --full-auto "<prompt>" </dev/null\`. Use the following English text verbatim as <prompt>, with the target list filled into Target files.\n` +
    `---\n` +
    `You are an adversarial tester. Your goal is to find bugs by writing tests that the original developer likely missed.\n\nTarget files:\n${fileList}\n\n` +
    `Instructions:\n1. Read each target file and understand its behavior\n2. Generate edge-case tests targeting:\n   - Boundary values (empty, zero, max, off-by-one)\n   - Error paths (invalid input, null/nil equivalents, failure modes)\n   - Input validation gaps (special characters, injection, overflow)\n   - State transitions (concurrent access, race conditions if applicable)\n   - Implicit assumptions (hardcoded limits, timezone, locale)\n3. Write tests using the project's existing test framework and naming convention\n4. Place tests following the project's test directory and file-naming convention\n5. Run the tests\n6. Report results in this exact format:\n\nADVERSARIAL_RESULTS_START\ntest_name: <name>\ntarget: <file:line being tested>\nassertion: <what the test asserts>\nresult: PASS | FAIL\nfailure_detail: <error message if FAIL>\n---\n(repeat for each test)\nADVERSARIAL_RESULTS_END\n` +
    `---\n` +
    `Structure the ADVERSARIAL_RESULTS block of the output into tests. On timeout or inability to run, set ran: false with the reason in notes. Do not touch anything outside the worktree.`;
  const testRunPrompt = inWorktree(testRunRaw);
  const adversarialPrompt = inWorktree(adversarialRaw);
  const testRunP = dynamicOk
    ? agent(testRunPrompt, {
        agentType: "general-purpose",
        phase: "Evidence",
        label: "test-exec",
        model: "sonnet",
        schema: TEST_RUN_SCHEMA,
      }).catch(() => null)
    : Promise.resolve(null);
  const adversarialP = dynamicOk
    ? agent(adversarialPrompt, {
        agentType: "general-purpose",
        phase: "Evidence",
        label: "adversarial",
        model: "opus",
        schema: ADVERSARIAL_SCHEMA,
      }).catch(() => null)
    : Promise.resolve(null);

  // ---- Triage (overlapped): intent matching for failed adversarial tests ----
  // Triage depends only on adversarial / test, so run it here without waiting for the codex
  // + audit barrier, hiding it behind both poles. audit is the longest pole (~24 min measured)
  // and gates Synthesize, so placing triage serially after the barrier would put triage's own
  // duration on the critical path in full (adversarial is capped at 600s and always finishes
  // before the barrier). Because it runs concurrently, do not call a bare phase("Triage"); each
  // agent's opts.phase forms the group (avoids racing the global phase state against the audit
  // thunk; same rationale as the Challenge group).
  // A FAIL can be either "a bug found" or "the test wrote a wrong expectation". If an intent
  // source (OUTCOME.md -> plan -> DR -> commits -> comments -> docstring -> README ->
  // test names) contradicts the test's expectation, exclude; otherwise (no source / source
  // supports the expectation), promote.
  const triageP = (async () => {
    const testRun = await testRunP;
    const adversarial = await adversarialP;
    const tCol = dynamicOk ? (testRun && testRun.outcome) || "skipped" : "skipped";
    const advTests = (adversarial && adversarial.ran && adversarial.tests) || [];
    const advFails = advTests.filter((t) => t.result === "FAIL");
    const promoted = [];
    const excluded = [];
    if (advFails.length) {
      const verdicts = await parallel(
        advFails.map(
          (t) => () =>
            agent(
              anchor(
                `You handle the intent triage of assert. Decide whether one failed adversarial test is "a real bug found" or "a wrong expectation on the test side".\n` +
                  `The test is as follows. ${JSON.stringify(t)}\n` +
                  `Read the target code (${t.target}) with 30 lines of context, and look for intent sources top-down. The order is .claude/OUTCOME.md, the plan under .claude/workspace/planning/ or the issue's Plan section, DRs such as docs/decisions/, git log of the target file, comments within 10 lines of the target code, the target function's docstring, README, names of existing tests of the same function.\n` +
                  `If an intent source contradicts the test's expectation, exclude (quote the source in reason); otherwise promote.`,
              ),
              {
                agentType: "general-purpose",
                phase: "Triage",
                label: `triage:${t.test_name}`,
                model: "sonnet",
                schema: TRIAGE_SCHEMA,
              },
            ),
        ),
      );
      advFails.forEach((t, i) => {
        const v = verdicts[i];
        // if triage stalls, promote fail-close (prefer a false positive over a miss)
        if (v && v.verdict === "exclude") excluded.push({ ...t, reason: v.reason });
        else
          promoted.push({
            file: (t.target || "").split(":")[0],
            line: Number((t.target || "").split(":")[1]) || 0,
            severity: "high",
            summary: `[adversarial] ${t.assertion}: ${t.failure_detail || t.test_name}`,
            source: "adversarial",
          });
      });
    }
    // An adversarial stage stall (agent returned no output, or ran: false without a completed
    // test set) is carried so result.adversarial can distinguish a stalled / not-executed stage
    // from a genuine no-tests run — both otherwise report total 0. An agent crash (no output)
    // uses "no output / stall" mirroring shake.js's smellScan; a self-reported non-run
    // (ran: false) carries the diagnosed reason adversarial.notes as "not run: <notes>", so
    // those two states stay distinguishable as well. Strings stay English in both the EN and
    // .ja versions (structured token, not localized prose). Only mark it when dynamicOk is
    // true: when dynamic verification is skipped for env reasons, adversarialP is a resolved
    // null by design, and that env skip is surfaced separately (Dynamic evidence: skipped),
    // not as an agent stall.
    const advStalled = dynamicOk && !(adversarial && adversarial.ran);
    return {
      testRun,
      testsCol: tCol,
      promoted,
      advSummary: {
        total: advTests.length,
        passed: advTests.filter((t) => t.result === "PASS").length,
        failed: advFails.length,
        promoted: promoted.length,
        excluded: excluded.length,
        // Emitted only on a stall, so a genuine no-tests run carries no stall marker and the two
        // are distinguishable in result.adversarial.
        ...(advStalled
          ? {
              stall: adversarial
                ? `not run: ${adversarial.notes || "no reason reported"}`
                : "no output / stall",
            }
          : {}),
      },
    };
  })().catch(() => null);

  // audit scope: branch diff uses base...HEAD, uncommitted uses audit's default (HEAD
  // diff), target mode passes the path through. audit decides the scope kind via
  // rev-parse and resolves a path through git ls-files, so target mode enumerates the
  // tracked files under it. base goes along too: without it, an assert started on a
  // non-main base disagrees with audit's own default of main.
  const auditScope =
    boot.mode === "diff" ? (boot.diff_kind === "branch" ? `${base}...HEAD` : "") : scope;
  const codexScopeInstr =
    boot.mode === "target"
      ? `Target mode: run \`codex review "Review these files: ${boot.scope_files.join(", ")}"\` naming the target files in the PROMPT, without a scope flag.`
      : boot.diff_kind === "branch"
        ? `Run \`codex review --base ${base}\`.`
        : `Run \`codex review --uncommitted\`.`;
  // Run the audit sub-workflow independently of the Codex Challenge. Bundle the codex
  // review -> challenge/verify chain into one thunk so the opus critic pair overlaps the
  // audit run instead of waiting for its 5 phases to finish. audit findings already passed
  // the same critic pair inside the audit workflow, so they are not re-challenged. If both
  // codex critics stall, the unverified findings are dropped rather than handed to the
  // enhancer (fail-close, challengeStalled).
  let codexRes;
  [codexRes, audit] = await parallel([
    async () => {
      codexReview = await agent(
        anchor(
          `You handle the Codex static review stage of assert. ${codexScopeInstr}\n` +
            `Structure the output into findings. Copy Codex's P1/P2/P3 as severity (judge from impact when absent), and discard findings without an identifiable file:line as well as findings outside the scope. If codex fails, set ran: false with the reason in notes.`,
        ),
        {
          agentType: "general-purpose",
          phase: "Evidence",
          label: "codex-review",
          model: "sonnet",
          schema: CODEX_REVIEW_SCHEMA,
        },
      );
      const findings = ((codexReview && codexReview.findings) || []).map((f) => ({
        ...f,
        source: "codex",
      }));
      if (!findings.length) return { codexFindings: findings, challenged: null, verified: null };
      // ---- Challenge: challenger ∥ verifier over the Codex findings ----
      // Each agent's opts.phase assigns the Challenge group. A bare phase() would race the
      // global phase state against the audit thunk running concurrently, so it is not called
      // (same rationale as the audit.js workaround).
      const codexJson = JSON.stringify(findings);
      const [ch, vf] = await parallel([
        () =>
          agent(
            anchor(
              `As critic-audit, challenge the external Codex review findings and prune false positives. Treat each finding as a claim to be proven, not a fact. Reference each finding by file:line. The findings are as follows.\n${codexJson}`,
            ),
            {
              agentType: "critic-audit",
              phase: "Challenge",
              label: "challenge",
              model: "opus",
            },
          ),
        () =>
          agent(
            anchor(
              `As critic-evidence, verify the external Codex review findings. Base verdicts on positive evidence from tracing concrete execution paths, not intuition. Reference each finding by file:line, and attach execution-path evidence and a severity. The findings are as follows.\n${codexJson}`,
            ),
            {
              agentType: "critic-evidence",
              phase: "Challenge",
              label: "verify",
              model: "opus",
            },
          ),
      ]);
      return { codexFindings: findings, challenged: ch, verified: vf };
    },
    () => workflow("audit", { repo, scope: auditScope, base, skipPreflight: true }),
  ]);
  // A rejected thunk becomes null in the parallel() result slot, so open codexRes null-safe.
  const codexFindings = (codexRes && codexRes.codexFindings) || [];
  const challenged = codexRes ? codexRes.challenged : null;
  const verified = codexRes ? codexRes.verified : null;
  const auditFindings = ((audit && audit.findings) || []).map((f) => ({
    ...f,
    source: "audit",
  }));
  log(
    `Evidence: codex ${codexFindings.length} findings / audit ${auditFindings.length} findings` +
      (codexReview && codexReview.ran === false ? " (codex review failed, audit only)" : ""),
  );

  // ---- Triage collection: fold in the result of the overlapped triageP ----
  const triageRes = await triageP;
  const testRun = triageRes ? triageRes.testRun : null;
  testsCol = triageRes ? triageRes.testsCol : "skipped";
  const promoted = (triageRes && triageRes.promoted) || [];
  // The triage block folds its own throw into null via .catch(() => null). Without this
  // marker a thrown block would report "0 tests", indistinguishable from a clean no-tests run
  adversarialSummary = (triageRes && triageRes.advSummary) || {
    ...adversarialSummary,
    ...(dynamicOk ? { stall: "triage stage threw / no output" } : {}),
  };
  const advPart =
    adversarialSummary.stall ||
    `${adversarialSummary.total} tests (FAIL ${adversarialSummary.failed}, promoted ${adversarialSummary.promoted}, excluded ${adversarialSummary.excluded})`;
  log(
    dynamicOk
      ? `Dynamic evidence: tests=${testsCol}, adversarial ${advPart}`
      : "Dynamic evidence: skipped (bootstrap failure)",
  );

  // ---- Synthesize: enhancer-evidence integration -> script decides the gate ----
  phase("Synthesize");
  challengeStalled = codexFindings.length > 0 && !challenged && !verified;
  // The nested audit workflow's own challenge_ran distinguishes "challenge produced
  // verdicts" from "fail-open (challenge did not run, so audit.js let all findings through
  // as confirmed)". The zero-findings early return carries challenge_ran=false too and
  // counts as degraded, closing the hole where a run whose reviewers found nothing and
  // whose challenge never ran still reaches Ready with zero issues.
  // A stopped audit carries no challenge_ran, and a rejected thunk leaves null in parallel()'s
  // slot, so an equality check alone reads both as a healthy zero-findings audit.
  auditReason = !audit
    ? "nested audit returned nothing"
    : audit.stopped
      ? `nested audit stopped (${audit.stopped})`
      : audit.challenge_ran === false
        ? "audit challenge failed open"
        : "";
  auditDegraded = auditReason !== "";
  const auditFindingsIntro = auditDegraded
    ? `The nested audit workflow degraded (${auditReason}), so treat the following findings as unverified; include them in issues as-is but flag this in the report.`
    : "The integrated findings from the audit workflow (critic-verified; include them in issues as-is) are as follows.";
  synth = await agent(
    anchor(
      `As enhancer-evidence, integrate the static findings, outcome evidence, and adversarial results into root causes and a final issues set.\n` +
        `The Outcome criteria (OUTCOME.md) are as follows.\n${boot.outcome}\n\n` +
        `${auditFindingsIntro}\n${JSON.stringify(auditFindings)}\n\n` +
        `The challenge pass over the Codex findings (this pass decides membership; findings pruned as false positives stay pruned even if the verification pass found evidence) is as follows.\n${challenged || "(challenge stalled / no findings)"}\n\n` +
        `The verification pass over the Codex findings (only attaches execution-path evidence and severity to survivors) is as follows.\n${verified || "(verify stalled / no findings)"}\n\n` +
        `${challengeStalled ? "Both challenger and verifier stalled, so the Codex findings are unverified. Do not include them in issues; surface this in the report.\n\n" : ""}` +
        `The promoted adversarial findings (include in issues as-is) are as follows.\n${JSON.stringify(promoted)}\n\n` +
        `The dynamic evidence is build=${buildCol}, tests=${testsCol}${testRun && testRun.notes ? ` (${testRun.notes})` : ""}.\n\n` +
        `Include Constraint violations and Non-goal incursions in issues on equal footing regardless of origin. The report contains the evidence table (Build / Tests / Issues / Adversarial), root causes, and a fix suggestion per issue. Do not decide the gate (the script computes it by rule).`,
    ),
    {
      agentType: "enhancer-evidence",
      phase: "Synthesize",
      label: "synthesize",
      model: "opus",
      schema: SYNTH_SCHEMA,
    },
  );
  // if the enhancer stalls, assemble issues fail-close from the pre-integration material
  ({ issues, dropped } = mergeIssues(synth ? synth.issues : [...auditFindings, ...promoted]));

  // Gate rule. Build smoke fail / test fail / one or more
  // issues means NotReady. Severity remains a fix-priority hint and never affects the
  // gate. caveat presumes zero issues and applies when dynamic evidence is missing for env
  // reasons, or when the nested audit failed open and left its findings unverified.
  if (buildCol === "fail" || testsCol === "fail" || issues.length > 0 || challengeStalled) {
    gate = "NotReady";
    if (buildCol === "fail") gateReason.push("build fail");
    if (testsCol === "fail") gateReason.push("tests fail");
    if (issues.length > 0) gateReason.push(`${issues.length} issue(s)`);
    if (challengeStalled) gateReason.push("challenge stalled");
  } else if (!envFail && !auditDegraded && (testsCol === "pass" || testsCol === "no-runner")) {
    gate = "Ready";
    gateReason.push(`build ${buildCol}`, `tests ${testsCol}`, "0 issues");
  } else {
    gate = "Ready (caveat)";
    if (envFail) gateReason.push("env fail (dynamic verification skipped)");
    if (auditDegraded) gateReason.push(auditReason);
    if (testsCol !== "pass" && testsCol !== "no-runner" && !envFail)
      gateReason.push(`tests ${testsCol}`);
  }
} finally {
  // ---- Cleanup: tear down the worktree (always runs regardless of outcome) ----
  phase("Cleanup");
  await agent(
    anchor(
      `You handle the Cleanup stage of assert. Tear down the assert worktree with ${SCRIPTS}/worktree.py --cleanup "$CLAUDE_SESSION_ID". If it fails, reporting it as a warning is enough (best-effort). Do not touch other files.`,
    ),
    {
      agentType: "general-purpose",
      phase: "Cleanup",
      label: "cleanup",
      model: "sonnet",
    },
  );
  // Placed in finally (not after the try block) so a throw inside try still leaves a row: the
  // finally block runs before the throw propagates out of the workflow.
  await recordRun();
}

log(`Gate: ${gate} (build=${buildCol}, tests=${testsCol}, issues=${issues.length})`);

return {
  gate,
  gate_reason: gateReason,
  mode: boot.mode,
  build: buildCol,
  tests: testsCol,
  issues,
  dropped,
  root_causes: (synth && synth.root_causes) || [],
  adversarial: adversarialSummary,
  outcome_ref: boot.outcome === "absent" ? "absent" : "present",
  report: (synth && synth.report) || "",
};
