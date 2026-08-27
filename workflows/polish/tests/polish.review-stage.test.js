// The fallback the Review stage falls back to on a dead agent ({ available: false, ... }) is
// bit-for-bit the same shape codex itself returns when the CLI is missing, so today a caller
// cannot tell "the agent died" from "codex was not on PATH" from "cleanup mode skipped Review
// outright" -- all three read as codex_available: false with no other signal. review_note
// (mirroring audit.js's pre-flight `note`) is meant to close that gap: a stage-outcome string
// that takes a distinct value per case, layered onto the return value review_note ships from
// (the mode: "review" return and the final return) and onto the Review log line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const polishJs = join(here, "..", "..", "polish.js");

// mode: "review" stops right after the Review (+ Challenge, unreached here since findings is
// empty) stage, so its return value carries the Review outcome with no Fix/Cleanup noise.
const runReview = (codexStub) =>
  runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo", mode: "review" },
    stubs: {
      agent: (prompt, opts) =>
        opts && opts.label === "codex" ? codexStub(prompt, opts) : undefined,
    },
  });

const diedStub = () => undefined;
const missingStub = () => ({
  available: false,
  has_changes: true,
  diff_kind: "uncommitted",
  findings: [],
});
const reviewedStub = () => ({
  available: true,
  has_changes: true,
  diff_kind: "uncommitted",
  findings: [],
});

// mode: "cleanup" skips the Review block entirely, so the codex value stays at the module's
// cleanup-only initial literal all the way to the final return.
const runCleanup = () =>
  runWorkflow(polishJs, {
    args: { repo: "/abs/target-repo", mode: "cleanup" },
    stubs: {
      agent: (prompt, opts) =>
        opts && opts.label === "validate"
          ? { edits: [], tests_pass: true, stashed: false }
          : undefined,
    },
  });

test("a Review stage whose agent returns null reports a review stage outcome different from the codex-missing one", async () => {
  const died = await runReview(diedStub);
  const missing = await runReview(missingStub);
  assert.equal(
    typeof died.result.review_note,
    "string",
    "a dead Review agent still carries a review stage outcome",
  );
  assert.equal(
    typeof missing.result.review_note,
    "string",
    "a missing codex CLI still carries a review stage outcome",
  );
  assert.notEqual(
    died.result.review_note,
    missing.result.review_note,
    "a dead agent must not read the same as a missing codex CLI",
  );
});

test("a run in cleanup mode reports a review stage outcome different from both the agent-died and the codex-missing one", async () => {
  const died = await runReview(diedStub);
  const missing = await runReview(missingStub);
  const cleanupOnly = await runCleanup();
  assert.equal(
    typeof cleanupOnly.result.review_note,
    "string",
    "a cleanup-only run still carries a review stage outcome",
  );
  assert.notEqual(
    cleanupOnly.result.review_note,
    died.result.review_note,
    "cleanup-only must not read the same as a dead agent",
  );
  assert.notEqual(
    cleanupOnly.result.review_note,
    missing.result.review_note,
    "cleanup-only must not read the same as a missing codex CLI",
  );
});

test("the log line for a dead agent does not claim the codex CLI is missing", async () => {
  const { logs } = await runReview(diedStub);
  const reviewLog = logs.join("\n");
  assert.doesNotMatch(
    reviewLog,
    /codex CLI missing/,
    "a dead agent must not be logged as though the codex CLI were the problem",
  );
});

test("codex_available stays a boolean on every one of the four outcomes", async () => {
  const outcomes = {
    "agent-died": await runReview(diedStub),
    "codex-missing": await runReview(missingStub),
    "cleanup-only": await runCleanup(),
    reviewed: await runReview(reviewedStub),
  };
  const notes = new Set();
  for (const [label, run] of Object.entries(outcomes)) {
    assert.equal(
      typeof run.result.codex_available,
      "boolean",
      `${label} keeps codex_available a boolean`,
    );
    notes.add(run.result.review_note);
  }
  assert.equal(
    notes.size,
    4,
    "the four outcomes (agent-died / codex-missing / cleanup-only / reviewed) each carry a distinct review stage outcome",
  );
});
