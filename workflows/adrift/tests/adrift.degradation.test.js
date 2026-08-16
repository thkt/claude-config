// When some of the reviewers returned by the routing table stall (agent returns null) during
// adrift's per-DR scan, the stalled reviewer names are recorded in the per-DR result. The
// primary channel is the workflow return value result.skipped (WORKFLOWS.md); the per-DR
// serialization passed to the Report stage is pinned as the auxiliary channel alongside it.
//
// A partial stall fills the note too, not only a total wipeout.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const adriftJs = join(here, "..", "..", "adrift.js");

// manifest "rust" resolves to 2 reviewers (reviewer-rust + reviewer-design) in the routing
// table. Making one (reviewer-rust) null = stall and the other (reviewer-design) alive
// (empty findings) produces a partial stall. extract is verifiable with non-empty candidates
// so the flow reaches the reviewer stage.
const agentStub = (prompt, opts) => {
  const label = opts && opts.label;
  if (label === "detect") {
    return {
      found: true,
      dr_dir: "docs/decisions",
      drs: [{ id: "0001", file: "docs/decisions/0001-x.md", title: "X" }],
      manifest: "rust",
      dr_refs: [],
    };
  }
  if (label === "extract:0001") {
    return {
      status: "Accepted",
      verifiable: true,
      outcome_text: "decision body",
      symbols: ["foo"],
      candidates: [{ symbol: "foo", file: "src/a.rs", line: 3 }],
      notes: "",
    };
  }
  if (label === "reviewer-rust:0001") return null; // stall
  if (label === "reviewer-design:0001") return { findings: [] }; // alive
  if (label === "report") return { written: true, report_path: "docs/audit/x.md" };
  return undefined;
};

test("records the stalled reviewer name in the per-DR result when some reviewer agent returns null", async () => {
  const { result, calls } = await runWorkflow(adriftJs, {
    args: {},
    stubs: { agent: agentStub },
  });

  // Primary channel: the return value's result.skipped carries the per-DR stall at loss
  // granularity (DR id + reviewer name + reason)
  assert.deepEqual(
    result.skipped,
    [{ id: "0001", skipped: [{ reviewer: "reviewer-rust", reason: "no output / stall" }] }],
    "result.skipped records the stalled reviewer with its DR id",
  );
  // A partial stall (some reviewer alive) does not count as unverifiable
  assert.deepEqual(result.unverifiable, [], "a partially stalled DR stays verifiable");

  // Auxiliary channel: the per-DR result serialized into the Report stage prompt carries the
  // same record
  const reportCall = calls.agent.find((c) => c.opts && c.opts.label === "report");
  assert.ok(reportCall, "the Report stage agent ran");
  const matched = reportCall.prompt.match(
    /per-DR results are as follows\.\n([\s\S]*?)\n\nThe external DR references/,
  );
  assert.ok(matched, "the report prompt carries the serialized per-DR results");
  const perDr = JSON.parse(matched[1]);
  const entry = perDr.find((d) => d.id === "0001");
  assert.ok(entry, "the per-DR results include the target DR 0001");
  assert.deepEqual(
    entry.skipped,
    [{ reviewer: "reviewer-rust", reason: "no output / stall" }],
    "the per-DR result records the stalled reviewer name reviewer-rust",
  );
});
