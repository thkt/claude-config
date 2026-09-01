/// <reference types="node" />
// Behavior tests for skills/_lib/harness_hash.ts's digest primitive: the TS mirror of
// harness_hash.py's _digest (sorts by name, updates name/`\0`/content/`\0`).
import assert from "node:assert/strict";
import test from "node:test";
import { digest } from "../harness_hash.ts";

test("T-001 reversing the order of the name and content pairs leaves the digest unchanged", () => {
  const pairs: [string, Buffer][] = [
    ["b.ts", Buffer.from("second")],
    ["a.ts", Buffer.from("first")],
  ];
  assert.equal(digest(pairs), digest([...pairs].reverse()));
});

test("T-002 moving one byte of content from one file to another changes the digest", () => {
  const one: [string, Buffer][] = [
    ["a.ts", Buffer.from("xy")],
    ["b.ts", Buffer.from("")],
  ];
  const other: [string, Buffer][] = [
    ["a.ts", Buffer.from("x")],
    ["b.ts", Buffer.from("y")],
  ];
  assert.notEqual(digest(one), digest(other));
});

test("T-003 renaming a file while keeping its content changes the digest", () => {
  assert.notEqual(digest([["a.ts", Buffer.from("same")]]), digest([["b.ts", Buffer.from("same")]]));
});
