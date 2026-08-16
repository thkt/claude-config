// rules/conventions/PROSE.md and output-styles/terse.md carry the same two sections. They are
// a pair rather than a duplicate: the examples are bound to the output language, so both are
// needed (PROSE.md gives in contrast / therefore, terse.md gives 一方で / そのため). The
// output-styles mirror exception in MIRROR.md holds that reason.
//
// With nothing holding the pair together, a row lands in PROSE.md alone and the conversational
// reply loses that rule.
//
// This is not a hook test, so it belongs to none of the hooks/<subdir>/tests/ directories and
// stays in hooks/tests/. The node --test glob in .github/workflows/test.yml is
// hooks/**/tests/*.test.js, and that ** matches zero levels too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const prose = readFileSync(join(root, "rules", "conventions", "PROSE.md"), "utf8");
const terse = readFileSync(join(root, "output-styles", "terse.md"), "utf8");

// Counts the body rows alone, dropping the heading row and the separator (| --- |).
const rowsUnder = (text, heading) => {
  const lines = text.split("\n");
  const start = lines.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `heading "${heading}" not found`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const section = end === -1 ? rest : rest.slice(0, end);
  const tableLines = section.filter((line) => line.trimStart().startsWith("|"));
  const bodyLines = tableLines.filter((line) => !/^\s*\|[\s|:-]+\|\s*$/.test(line));
  return bodyLines.length - 1;
};

const pairs = [
  { prose: "Mark What Is Central", terse: "中心を明示する" },
  { prose: "Predictable Prose", terse: "予測可能な散文" },
];

for (const pair of pairs) {
  test(`${pair.prose} and ${pair.terse} hold the same number of rows`, () => {
    const left = rowsUnder(prose, pair.prose);
    const right = rowsUnder(terse, pair.terse);
    assert.ok(left > 0, `${pair.prose} holds no rows`);
    assert.equal(
      right,
      left,
      `${pair.prose} in PROSE.md holds ${left} rows, ${pair.terse} in terse.md holds ${right}. A row added to one side is added to the other in the same commit`,
    );
  });
}
