/// <reference types="node" />
// Behavior tests for skills/_lib/harness_hash.ts's CLI entry point: main() and the
// isMainModule(import.meta.url) guard that calls it. Mirrors harness_hash.py's own contract
// (len(argv) != 2 exits 2, FileNotFoundError exits 1) translated to the TS argv convention
// gate.ts uses: main receives process.argv.slice(2), so "argv.length !== 1" is the same
// condition Python's "len(argv) != 2" states in terms that include the script name.
import assert from "node:assert/strict";
import { globSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { definitionPath, hashes } from "../harness_hash.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const TS_SCRIPT = join(HERE, "..", "harness_hash.ts");
// skills/_lib/tests -> skills/_lib -> skills -> repo root, the same climb
// harness-hash-resolve.test.ts's REPO_ROOT makes from the same starting point.
const REPO_ROOT = join(HERE, "..", "..", "..");

interface CliRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: readonly string[]): CliRun {
  const result = spawnSync(process.execPath, [TS_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// A harness skill in the real repo: one whose test/expected.json exists, the same glob
// harness-hash-resolve.test.ts's harnessSkillsUnderRepoRoot() uses so a renamed or removed
// fixture skill cannot make this test name one that no longer resolves.
function firstHarnessSkill(): string {
  const matches = globSync("skills/*/test/expected.json", { cwd: REPO_ROOT });
  assert.ok(matches.length > 0, "at least one harness skill exists in the repo under test");
  return matches[0].split("/")[1];
}

test("T-008 one skill name prints a JSON carrying only corpus_sha256, definition_sha256, and skill_sha256, and exits 0", () => {
  const skill = firstHarnessSkill();
  const run = runCli([skill]);
  assert.equal(run.status, 0, `exit code (stderr: ${run.stderr})`);
  const parsed = JSON.parse(run.stdout) as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(parsed).sort(),
    ["corpus_sha256", "definition_sha256", "skill_sha256"],
  );
  // Cross-checked against the resolver this CLI wraps, not just the key set: a CLI that
  // printed the right shape with the wrong values would otherwise still pass.
  assert.deepEqual(parsed, hashes(skill, REPO_ROOT));
});

test("T-009 running with no argument exits 2", () => {
  const run = runCli([]);
  assert.equal(run.status, 2, `exit code (stderr: ${run.stderr})`);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /usage/i);
});

test("T-010 an unknown skill name exits 1 and leaves stdout empty", () => {
  const skill = "use-context-reviewer-nonexistent-cli-fixture";
  const run = runCli([skill]);
  assert.equal(run.status, 1, `exit code (stderr: ${run.stderr})`);
  assert.equal(run.stdout, "");
  // Names the missing skill's own definition path, not just any error: the stub this test
  // is written against throws an unconditional "not implemented" that would otherwise
  // satisfy "exit 1, empty stdout" without the CLI ever having looked at the skill name.
  const expectedPath = definitionPath(skill, REPO_ROOT);
  assert.match(run.stderr, new RegExp(expectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
