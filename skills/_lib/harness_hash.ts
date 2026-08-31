#!/usr/bin/env node
/// <reference types="node" />
// Usage: harness_hash.ts <skill-name>
//
// TypeScript port of harness_hash.py, landing incrementally: this unit carries only the
// digest primitive that content-addresses a list of (name, content) pairs. digest() is the
// TS mirror of harness_hash.py's _digest -- exported plainly and tested in-process, the same
// shape gate.ts uses for its own pure functions (tail, classifyObservation, ...).
//
// Sorted by name, not by arrival order: the same corpus would digest differently between
// machines that read a directory in different orders. Each pair updates name, then a `\0`,
// then content, then a `\0`, so a byte moved across the name/content boundary (part of the
// name becomes content, or the reverse) still changes the digest instead of being absorbed
// by a concatenation an attacker -- or a coincidental rename -- could reproduce.
//
// Contract: skills/_lib/harness_hash.py's _digest, agent_name, definition_path, skill_path,
// test_dir, corpus_files, and hashes. Exercised by skills/_lib/tests/harness-hash-digest.test.ts
// and skills/_lib/tests/harness-hash-resolve.test.ts. Python's snake_case names carry over as
// TS camelCase, the same rename _digest -> digest already made.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../../workflows/_lib/entry-point.ts";

const NUL = Buffer.from([0]);

// skills/_lib/harness_hash.ts -> skills/_lib -> skills -> repo root, mirroring
// harness_hash.py's `Path(__file__).resolve().parents[2]`.
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Not the files expected.json names: a case sitting outside the answer key still reaches the
// reviewer, so a run that saw it measured a different corpus.
export const CORPUS_PARTS = ["cases", "expected.json"] as const;

export function digest(pairs: Iterable<readonly [string, Buffer]>): string {
  const hash = createHash("sha256");
  const sorted = [...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [name, content] of sorted) {
    hash.update(Buffer.from(name, "utf8"));
    hash.update(NUL);
    hash.update(content);
    hash.update(NUL);
  }
  return hash.digest("hex");
}

export interface HarnessHashes {
  definition_sha256: string;
  skill_sha256: string;
  corpus_sha256: string;
}

// replaceAll, not replace: Python's str.replace replaces every occurrence, and a single-shot
// TS .replace would leave a second "use-context-" in the name untouched.
export function agentName(skill: string): string {
  return skill.replaceAll("use-context-", "");
}

export function definitionPath(skill: string, root: string = ROOT): string {
  return join(root, "agents", "reviewers", `${agentName(skill)}.md`);
}

export function skillPath(skill: string, root: string = ROOT): string {
  return join(root, "skills", skill, "SKILL.md");
}

export function testDir(skill: string, root: string = ROOT): string {
  return join(root, "skills", skill, "test");
}

// Recurses one directory's full file tree. Order does not matter to a caller: digest()
// re-sorts every pair it receives by name, so this walk owes no ordering guarantee of
// its own.
function filesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesUnder(full));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

export function corpusFiles(skill: string, root: string = ROOT): string[] {
  const base = testDir(skill, root);
  const found: string[] = [];
  for (const part of CORPUS_PARTS) {
    const target = join(base, part);
    if (!existsSync(target)) {
      continue;
    }
    const stat = statSync(target);
    if (stat.isDirectory()) {
      found.push(...filesUnder(target));
    } else if (stat.isFile()) {
      found.push(target);
    }
  }
  return found;
}

export function hashes(skill: string, root: string = ROOT): HarnessHashes {
  const definition = definitionPath(skill, root);
  const body = skillPath(skill, root);
  for (const [path, what] of [
    [definition, "reviewer definition"],
    [body, "SKILL.md"],
  ] as const) {
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`no ${what} for ${skill}: ${path}`);
    }
  }
  const files = corpusFiles(skill, root);
  const base = testDir(skill, root);
  if (files.length === 0) {
    throw new Error(`no corpus for ${skill}: ${base}`);
  }
  return {
    definition_sha256: digest([[basename(definition), readFileSync(definition)]]),
    skill_sha256: digest([[basename(body), readFileSync(body)]]),
    corpus_sha256: digest(
      files.map((path): [string, Buffer] => [relative(base, path), readFileSync(path)]),
    ),
  };
}

export function main(argv: string[]): number {
  void argv;
  throw new Error("not implemented");
}

if (isMainModule(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
