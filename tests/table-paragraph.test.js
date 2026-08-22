// MARKDOWN.md § Do not puts a table's explanation before the table, so the reader holds the rule
// before the rows it governs. docs/** (48) still carries paragraphs below its tables and stays out
// of this scan until it is cleaned. workflows/ and commands/ hold no markdown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNED = ["agents", "rules", "skills"];

// MARKDOWN.md's row exempts a conclusion the table derives, and no regex separates one from an
// explanation. Each key carries the opening sentence, so rewriting the conclusion asks for the
// judgement again. Removing an entry is how a paragraph that stopped being one gets its guard back.
const DERIVED_CONCLUSIONS = new Map([
  [
    "skills/use-context-root-cause-analysis/references/hypothesis-examples.md :: The root cause is the fetch-everything on mount.",
    "the elimination table above it is what derives this; leading with it makes the table decorative",
  ],
  [
    "skills/use-context-root-cause-analysis/references/hypothesis-examples.md :: The root cause is the second click landing before the state update.",
    "same worked-example shape as the dashboard case",
  ],
  [
    ".ja/skills/use-context-root-cause-analysis/references/hypothesis-examples.md :: Root cause は mount 時の一括取得。",
    "上の消去表が導いた結論。前に出すと表が飾りになる",
  ],
  [
    ".ja/skills/use-context-root-cause-analysis/references/hypothesis-examples.md :: Root cause は state が反映される前に 2 回目を受けること。",
    "ダッシュボードの例と同じ、例題としての導出",
  ],
]);

// An ordered list is not a paragraph, and reading `1. foo` as one fails a file that carries steps.
const CONTINUES_A_BLOCK = /^(?:[|#>*-]|\d+[.)]\s)/;

const keyFor = (path, text) => `${path} :: ${text.split(/(?<=[。.])\s*/)[0]}`;

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
    if (inTable && !CONTINUES_A_BLOCK.test(line)) out.push({ line: i + 1, text: line });
    inTable = line.startsWith("|");
  }
  return out;
};

const scan = async () => {
  const offenders = [];
  const seen = new Set();
  for (const prefix of ["", ".ja"]) {
    for (const dir of SCANNED) {
      for (const path of await markdownUnder(join(root, prefix, dir))) {
        for (const { line, text } of paragraphsAfterTables(await readFile(path, "utf8"))) {
          const key = keyFor(relative(root, path), text);
          seen.add(key);
          if (!DERIVED_CONCLUSIONS.has(key)) {
            offenders.push(`${relative(root, path)}:${line} ${text.slice(0, 70)}`);
          }
        }
      }
    }
  }
  return { offenders, seen };
};

test("no explanation sits below the table it explains", async () => {
  const { offenders } = await scan();
  assert.deepEqual(offenders, [], `move the explanation above its table:\n${offenders.join("\n")}`);
});

// An empty scan reports the same zero offenders as a clean tree.
test("the scan reaches the files it names", async () => {
  const counts = await Promise.all(
    SCANNED.map(async (dir) => (await markdownUnder(join(root, dir))).length),
  );
  assert.ok(Math.min(...counts) > 0, `every scanned directory holds markdown: ${counts}`);
});

// An allowlist nobody prunes stops being a record of judgement and becomes noise.
test("every DERIVED_CONCLUSIONS entry still names a paragraph that exists", async () => {
  const { seen } = await scan();
  const stale = [...DERIVED_CONCLUSIONS.keys()].filter((k) => !seen.has(k)).sort();
  assert.deepEqual(
    stale,
    [],
    `DERIVED_CONCLUSIONS holds entries that no longer occur:\n${stale.join("\n")}`,
  );
});
