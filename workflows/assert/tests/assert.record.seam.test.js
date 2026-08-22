// Only agent responses are faked; record.py really runs, so what is asserted is the row on disk
// rather than the payload the run assembled. No other path shows whether Synthesize's issues and
// recordRun's issue_counts stay in step.
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

// HISTORY_DIR derives from $HOME, so HOME points at a temporary directory: the real history is
// never rewritten and records never mix between tests.
const runRecord = (payload) => {
  const home = mkdtempSync(join(tmpdir(), "assert-record-seam-"));
  try {
    const res = spawnSync("python3", [recordPy], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });
    assert.equal(res.status, 0, `record.py exits 0 (stderr: ${res.stderr})`);
    // record.py writes one row per run, so the file holds exactly what this run appended.
    const out = JSON.parse(res.stdout);
    const lines = readFileSync(out.path, "utf8").trim().split("\n");
    return JSON.parse(lines[lines.length - 1]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

// "record" is left unstubbed so its payload is read off calls.agent rather than fabricated,
// then carried to the real record.py below.
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
