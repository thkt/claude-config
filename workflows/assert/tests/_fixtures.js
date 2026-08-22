// The bootstrap return value that makes dynamicOk true (worktree_ok true / install ok / build
// pass). Shared by every test file in this directory that needs a bootstrap stage to succeed
// (see workflows/audit/tests/_fixtures.js for the same per-directory sharing pattern).
export const bootOk = {
  codex_available: true,
  mode: "target",
  diff_kind: "",
  scope_files: ["src/foo.js"],
  outcome: "absent",
  worktree_ok: true,
  worktree_path: "/tmp/assert-wt",
  install: "ok",
  build: "pass",
  reason: "",
};

// The calls this run made to the "record" label, in call order.
export const recordCallsOf = (calls) =>
  calls.agent.filter((c) => c.opts && c.opts.label === "record");

// build.js's own recordRun puts the stringified payload on the prompt's last line (see
// build/tests/build.behavior.test.js's T-008, "the payload is the prompt's last line, where
// recordRun puts the stringified JSON"); assert's recorder is asked to mirror that exactly.
export const recordPayloadOf = (call) => JSON.parse(call.prompt.trim().split("\n").pop());
