/// <reference types="node" />
// The connections the unit boundaries hide. Each unit above is green on its own while the
// ported module reaches nobody: the CLI's output has to be the thing the freshness record is
// compared against, CI has to actually run the .test.ts files, and the retired Python has to
// be gone from both trees and from the prose that told an operator to run it.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { ROOT, testDir } from "../harness_hash.ts";

const SCRIPT = join(ROOT, "skills", "_lib", "harness_hash.ts");
const RETIRED = "harness_hash.py";

function tracked(...pathspec: string[]): string[] {
  const stdout = execFileSync("git", ["-C", ROOT, "ls-files", "--", ...pathspec], {
    encoding: "utf8",
  });
  return stdout.split("\n").filter(Boolean);
}

// The whole CLI, spawned rather than imported: what the operator pastes into a record is the
// process's stdout, and an in-process call would skip the argv handling and the JSON printing
// that stand between hashes() and that text.
test("T-013 the three hashes the CLI prints equal the three fields of that skill's newest record", () => {
  const skills = tracked("skills/*/test/expected.json").map((path) => path.split("/")[1]);
  assert.ok(skills.length > 0, "the repository carries at least one harness skill to check");

  for (const skill of skills) {
    const printed = JSON.parse(
      execFileSync("node", [SCRIPT, skill], { cwd: ROOT, encoding: "utf8" }),
    ) as Record<string, string>;

    const records = tracked(join(testDir(skill, "."), "results", "*.json")).sort();
    assert.ok(records.length > 0, `${skill}: no accuracy record to compare the CLI against`);
    const newest = JSON.parse(
      readFileSync(join(ROOT, records[records.length - 1]), "utf8"),
    ) as Record<string, unknown>;

    for (const field of ["definition_sha256", "skill_sha256", "corpus_sha256"]) {
      assert.equal(newest[field], printed[field], `${skill}: ${field} in ${records.at(-1)}`);
    }
  }
});

// The Python step is a find over the tree, so retiring a *_test.py drops it from CI on its
// own. Adding a .test.ts does not: the Node step names its globs one by one, and a ported
// test that no glob reaches leaves CI green having run nothing.
test("T-014 the Node tests step in .github/workflows/test.yml carries skills/**/tests/*.test.ts", () => {
  const workflow = readFileSync(join(ROOT, ".github", "workflows", "test.yml"), "utf8");
  const step = workflow.slice(workflow.indexOf("- name: Node tests"));
  assert.ok(step.startsWith("- name: Node tests"), "the Node tests step is missing from test.yml");
  assert.match(step.slice(0, step.indexOf("- name:", 1)), /"skills\/\*\*\/tests\/\*\.test\.ts"/);
});

test("T-015 none of the three harness_hash .py paths remains among the tracked files", () => {
  assert.deepEqual(
    tracked(
      "skills/_lib/harness_hash.py",
      ".ja/skills/_lib/harness_hash.py",
      "skills/_lib/tests/harness_hash_test.py",
    ),
    [],
  );
});

// A file can be gone while something still points at it: prose telling an operator to run it,
// or a config naming it as a path. Both mislead or break; a source comment citing the retired
// file as what the port was written against does neither, which is why the scan is scoped to
// prose and config rather than to every tracked file. docs/decisions keeps its mentions too,
// as docs/wiki/retire-rename-procedure.md's step 4 places a record's mention historically.
const POINTS_AT_A_PATH = /\.(md|ya?ml|json|sh|toml)$/;

test("T-016 no tracked prose or config outside docs/decisions carries the string harness_hash.py, on either tree", () => {
  const offenders = tracked(".")
    .filter((path) => POINTS_AT_A_PATH.test(path) && !path.startsWith("docs/decisions/"))
    .filter((path) => {
      let source: string;
      try {
        source = readFileSync(join(ROOT, path), "utf8");
      } catch {
        return false;
      }
      return source.includes(RETIRED);
    });
  assert.deepEqual(offenders, []);
});
