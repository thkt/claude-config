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
// Contract: skills/_lib/harness_hash.py's _digest, exercised by
// skills/_lib/tests/harness-hash-digest.test.ts.
import { createHash } from "node:crypto";
import { isMainModule } from "../../workflows/_lib/entry-point.ts";

const NUL = Buffer.from([0]);

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

export function main(argv: string[]): number {
  void argv;
  throw new Error("not implemented");
}

if (isMainModule(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
