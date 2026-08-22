// This carries assert's own returned issues all the way to the real
// workflows/assert/record.py's written row, mirroring workflows/audit/tests/audit.seam.test.js's
// runSnapshot pattern (see that file's header comment): only agent responses are faked, and the
// recorder script itself really runs, so what gets asserted is the row on disk rather than the
// payload the run assembled. Whether Synthesize's issues and recordRun's issue_counts actually
// stay in step shows up on no other path but this one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { runWorkflow } from "../../_lib/run-workflow.js";
import { bootOk, recordCallsOf, recordPayloadOf } from "./_fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const assertJs = join(here, "..", "..", "assert.js");
const recordPy = join(here, "..", "record.py");

// record.py's HISTORY_DIR derives from $HOME/.claude/history (see record.py). Each run points
// HOME at an isolated temporary directory, so the real user's history is never rewritten and
// records never mix between tests.
const runRecord = (payload) => {
  const home = mkdtempSync(join(tmpdir(), "assert-record-seam-"));
  try {
    const res = spawnSync("python3", [recordPy], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });
    assert.equal(res.status, 0, `record.py exits 0 (stderr: ${res.stderr})`);
    // stdout is one JSON line of {path}. record.py is 1 run 1 line, so the file holds
    // exactly the one row this run appended.
    const out = JSON.parse(res.stdout);
    const lines = readFileSync(out.path, "utf8").trim().split("\n");
    return JSON.parse(lines[lines.length - 1]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

// Every stage but "record" answers with a fixed fake, so the run reaches its own gate/issues
// deterministically. "record" is left unstubbed (falls through to undefined) so its payload is
// read off calls.agent instead of being fabricated, then carried to the real record.py below.
const agentStub = (issues) => (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "bootstrap") return bootOk;
  if (label === "test-exec") return { outcome: "pass", passed: 1, failed: 0 };
  if (label === "adversarial") return { ran: true, tests: [] };
  if (label === "codex-review") return { ran: true, findings: [] };
  if (label === "synthesize") return { issues, root_causes: [], report: "ok" };
  if (label === "cleanup") return {};
  return undefined;
};

// The per-severity tally computed straight from the returned issues, independent of
// recordRun's own issueCounts loop, so this does not simply re-check recordRun against itself.
const tallyBySeverity = (issues) => {
  const counts = {};
  for (const i of issues) counts[i.severity] = (counts[i.severity] || 0) + 1;
  return counts;
};

test("T-016 the row the real record.py wrote carries the same per-severity counts as the returned issues", async () => {
  const issues = [
    { file: "a.js", line: 10, severity: "high", summary: "x", source: ["audit"] },
    { file: "b.js", line: 20, severity: "medium", summary: "y", source: ["audit"] },
    { file: "c.js", line: 30, severity: "high", summary: "z", source: ["audit"] },
  ];
  const { result, calls } = await runWorkflow(assertJs, {
    args: {},
    stubs: { agent: agentStub(issues) },
  });
  assert.ok(result.issues.length > 0, "the run returns issues to tally against");

  const records = recordCallsOf(calls);
  assert.equal(records.length, 1, "the run calls the recorder exactly once");
  const payload = recordPayloadOf(records[0]);

  const row = runRecord(payload);
  assert.deepEqual(
    row.issue_counts,
    tallyBySeverity(result.issues),
    "the per-severity counts in the row the real record.py wrote to disk match a tally taken " +
      "straight off assert's own returned issues",
  );
});
