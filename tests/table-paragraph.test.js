// MARKDOWN.md § Do not puts a table's explanation before the table, so the reader holds the rule
// before the rows it governs. skills/** (13 per language side) and docs/** (48) still carry
// paragraphs below their tables and stay out of this scan until they are cleaned. workflows/ and
// commands/ hold no markdown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNED = ["agents", "rules"];

const markdownUnder = async (dir) => {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await markdownUnder(path)));
    else if (e.name.endsWith(".md")) out.push(path);
  }
  return out;
};

// A fenced block carries its own tables and prose, and MARKDOWN.md exempts code from every rule.
const paragraphsAfterTables = (source) => {
  const lines = source.split("\n");
  const start = lines[0] === "---" ? lines.indexOf("---", 1) + 1 : 0;
  const out = [];
  let inTable = false;
  let inFence = false;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      inTable = false;
      continue;
    }
    if (inFence || !line) continue;
    if (inTable && !/^[|#\-*>]/.test(line)) out.push({ line: i + 1, text: line });
    inTable = line.startsWith("|");
  }
  return out;
};

test("no explanation sits below the table it explains", async () => {
  const offenders = [];
  for (const prefix of ["", ".ja"]) {
    for (const dir of SCANNED) {
      for (const path of await markdownUnder(join(root, prefix, dir))) {
        for (const { line, text } of paragraphsAfterTables(await readFile(path, "utf8"))) {
          offenders.push(`${relative(root, path)}:${line} ${text.slice(0, 70)}`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `move the explanation above its table:\n${offenders.join("\n")}`);
});

// An empty scan reports the same zero offenders as a clean tree.
test("the scan reaches the agent and rule files", async () => {
  const counts = await Promise.all(
    SCANNED.map(async (dir) => (await markdownUnder(join(root, dir))).length),
  );
  assert.ok(Math.min(...counts) > 0, `every scanned directory holds markdown: ${counts}`);
});
