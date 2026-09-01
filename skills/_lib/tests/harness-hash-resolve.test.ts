/// <reference types="node" />
// Behavior tests for skills/_lib/harness_hash.ts's resolvers: agentName, definitionPath,
// skillPath, testDir, corpusFiles, and hashes -- the TS mirror of harness_hash.py's same-named
// (snake_case there, camelCase here) functions. hashes() must resolve a skill name to its
// reviewer definition, its SKILL.md, and its corpus, and the corpus must exclude anything
// recorded under test/results (CORPUS_PARTS names "cases" and "expected.json" only).
import assert from "node:assert/strict";
import { globSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  agentName,
  corpusFiles,
  definitionPath,
  hashes,
  skillPath,
  testDir,
} from "../harness_hash.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
// skills/_lib/tests -> skills/_lib -> skills -> repo root, the same climb harness_hash.ts's own
// ROOT makes from one directory deeper.
const REPO_ROOT = join(HERE, "..", "..", "..");

function withTempRoot<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "harness-hash-resolve-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// A harness skill in the real repo: one whose test/expected.json exists, mirroring
// harness_hash_test.py's `HARNESS_SKILLS` glob so a skill added later cannot go unchecked.
function harnessSkillsUnderRepoRoot(): string[] {
  return globSync("skills/*/test/expected.json", { cwd: REPO_ROOT }).map(
    (match) => match.split("/")[1],
  );
}

// Mirrors agentName's own use-context- stripping so the fixture writer does not depend on the
// function this suite is testing.
function agentNameForFixture(skill: string): string {
  return skill.replace("use-context-", "");
}

function writeFixtureSkill(root: string, skill: string): void {
  const agent = agentNameForFixture(skill);
  mkdirSync(join(root, "agents", "reviewers"), { recursive: true });
  writeFileSync(join(root, "agents", "reviewers", `${agent}.md`), "definition body");
  const skillDir = join(root, "skills", skill);
  mkdirSync(join(skillDir, "test", "cases"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "skill body");
  writeFileSync(join(skillDir, "test", "cases", "a.ts"), "case body");
  writeFileSync(join(skillDir, "test", "expected.json"), "[]");
}

test("T-004 use-context-reviewer-security yields the reviewer name reviewer-security", () => {
  assert.equal(agentName("use-context-reviewer-security"), "reviewer-security");
});

test("T-005 every skill carrying test/expected.json resolves to both a reviewer definition and a SKILL.md", () => {
  const skills = harnessSkillsUnderRepoRoot();
  assert.ok(skills.length > 0, "at least one harness skill exists in the repo under test");
  for (const skill of skills) {
    const definition = definitionPath(skill);
    const body = skillPath(skill);
    assert.ok(definition.endsWith(".md"), `${skill}: definition path`);
    assert.ok(body.endsWith("SKILL.md"), `${skill}: SKILL.md path`);
  }
});

test("T-006 adding one file under test/results leaves the corpus hash unchanged", () => {
  withTempRoot((root) => {
    const skill = "use-context-reviewer-sample";
    writeFixtureSkill(root, skill);

    const before = hashes(skill, root);
    const resultsDir = join(testDir(skill, root), "results");
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(join(resultsDir, "2026-01-01-run.json"), "{}");
    const after = hashes(skill, root);

    assert.equal(after.corpus_sha256, before.corpus_sha256);
    assert.deepEqual(corpusFiles(skill, root).sort(), corpusFiles(skill, root).sort());
  });
});

test("T-007 a skill with no reviewer definition raises an error naming that definition's path", () => {
  const skill = "use-context-reviewer-nonexistent";
  const expected = definitionPath(skill);
  assert.throws(() => hashes(skill), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
