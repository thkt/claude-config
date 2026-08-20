import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const decisions = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "decisions");

// validate-dr.py accepts `superseded by DR-NNNN` as a pointer to one decision, and update-index.py
// prints the number as the link text. Two files sharing a number make that pointer resolve to
// either of them, and the generated index shows the number twice with different titles.
test("no two decision records share a number", async () => {
  const seen = new Map();
  const collisions = [];
  for (const entry of await readdir(decisions)) {
    const number = entry.match(/^(\d{4})-.+\.md$/)?.[1];
    if (!number) continue;
    if (seen.has(number)) collisions.push(`${number}: ${seen.get(number)} / ${entry}`);
    seen.set(number, entry);
  }
  assert.ok(seen.size >= 50, `the decision records are readable (${seen.size})`);
  assert.deepEqual(collisions, [], "every number belongs to one file");
});

// A title that carries an ADR-NNNN / DR-NNNN prefix contradicting its filename sends a reader
// chasing the wrong record. Only the first heading counts: later `# ` lines are shell comments
// inside code blocks, and one of those holds the literal 0001 in an example.
test("no title heading claims a number its filename does not carry", async () => {
  const mismatched = [];
  for (const entry of await readdir(decisions)) {
    const number = entry.match(/^(\d{4})-.+\.md$/)?.[1];
    if (!number) continue;
    const body = await readFile(join(decisions, entry), "utf8");
    const title = body.split("\n").find((line) => line.startsWith("# "));
    const claimed = title?.match(/\b(?:A?DR)-(\d{4})\b/)?.[1];
    if (claimed && claimed !== number) mismatched.push(`${entry} says ${claimed}`);
  }
  assert.deepEqual(mismatched, [], "every title agrees with its filename");
});
