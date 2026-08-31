/// <reference types="node" />
// Behavior tests for the freshness gate `rules/development/TESTING.md` § When a tier 1 run
// fires defines: every skill with a corpus carries at least one accuracy record under
// test/results/, and the newest record by name carries content hashes that match the
// current reviewer definition, SKILL.md body, and corpus.
//
// This mirrors skills/_lib/tests/harness_hash_test.py's Freshness class, where the record
// lookup and the comparison live in the test file itself and only hashes()/testDir() come
// from the module under test -- harness_hash.ts carries no freshness export of its own.
import assert from "node:assert/strict";
import { globSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { ROOT, hashes, testDir } from "../harness_hash.ts";

function withTempRoot<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "harness-freshness-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Mirrors harness-hash-resolve.test.ts's writeFixtureSkill: a skill carrying a reviewer
// definition, a SKILL.md, and a one-file corpus, but no test/results/ of its own.
function writeFixtureSkill(root: string, skill: string): void {
  const agent = skill.replace("use-context-", "");
  mkdirSync(join(root, "agents", "reviewers"), { recursive: true });
  writeFileSync(join(root, "agents", "reviewers", `${agent}.md`), "definition body");
  const skillDir = join(root, "skills", skill);
  mkdirSync(join(skillDir, "test", "cases"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "skill body");
  writeFileSync(join(skillDir, "test", "cases", "a.ts"), "case body");
  writeFileSync(join(skillDir, "test", "expected.json"), "[]");
}

function writeRecord(root: string, skill: string, name: string, record: unknown): void {
  const resultsDir = join(testDir(skill, root), "results");
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, name), JSON.stringify(record));
}

// The newest record by name, not by mtime: a checkout has no useful mtimes, and the gate the
// Python side ran read the last name in sort order. A second run on one date therefore takes
// a name that sorts after the run it supersedes.
function newestRecord(skill: string, root: string): string | null {
  const results = join(testDir(skill, root), "results");
  let names: string[];
  try {
    names = readdirSync(results).filter((name) => name.endsWith(".json"));
  } catch {
    return null;
  }
  names.sort();
  return names.length ? join(results, names[names.length - 1]) : null;
}

// One line per unmet condition, carrying the skill and the field that disagrees. A count
// would say how many drifted without saying which, and the operator has to re-run the
// harness for a named skill.
function freshnessFailures(skills: readonly string[], root: string): string[] {
  const failures: string[] = [];
  for (const skill of skills) {
    const recordPath = newestRecord(skill, root);
    if (recordPath === null) {
      failures.push(`${skill}: no accuracy run recorded under test/results/`);
      continue;
    }
    const record = JSON.parse(readFileSync(recordPath, "utf8")) as Record<string, unknown>;
    const current = hashes(skill, root);
    for (const [field, value] of Object.entries(current)) {
      if (record[field] !== value) {
        failures.push(`${skill}: ${basename(recordPath)} carries no matching ${field}`);
      }
    }
  }
  return failures;
}

// Derived rather than listed, mirroring harness_hash_test.py's HARNESS_SKILLS glob: a harness
// added later is covered without anyone naming it here.
function harnessSkills(): string[] {
  return globSync("skills/*/test/expected.json", { cwd: ROOT }).map((match) => match.split("/")[1]);
}

test("T-011 a skill carrying a corpus but no record at all is named in the failure", () => {
  withTempRoot((root) => {
    const skill = "use-context-reviewer-no-record";
    writeFixtureSkill(root, skill);

    const failures = freshnessFailures([skill], root);

    assert.ok(
      failures.some((line) => line.includes(skill)),
      `expected a failure naming ${skill}, got: ${JSON.stringify(failures)}`,
    );
  });
});

test("T-012 a newest record disagreeing with the current content names the skill and the field", () => {
  withTempRoot((root) => {
    const skill = "use-context-reviewer-stale-record";
    writeFixtureSkill(root, skill);
    const current = hashes(skill, root);
    writeRecord(root, skill, "2026-01-01-run.json", {
      ...current,
      corpus_sha256: "0".repeat(64),
    });

    const failures = freshnessFailures([skill], root);

    assert.ok(
      failures.some((line) => line.includes(skill) && line.includes("corpus_sha256")),
      `expected a failure naming ${skill} and corpus_sha256, got: ${JSON.stringify(failures)}`,
    );
  });
});

// The gate itself, not a check of its mechanism. This is what `rules/development/TESTING.md`
// § When a tier 1 run fires asks CI to hold: the newest record for every harness skill names
// the reviewer the repository currently ships.
test("every harness skill carries a record measuring the reviewer the repository ships", () => {
  const skills = harnessSkills();
  assert.ok(skills.length > 0, "the repository carries at least one harness skill to check");
  assert.deepEqual(
    freshnessFailures(skills, ROOT),
    [],
    "re-run the harness and record the hashes harness_hash.ts prints",
  );
});
