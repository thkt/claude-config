// rules/conventions/PROSE.md と output-styles/terse.md は同じ 2 節を持つ。重複ではなく対で、
// 例示が出力言語に縛られるため両方が要る (PROSE.md は in contrast / therefore、terse.md は
// 一方で / そのため)。MIRROR.md の output-styles ミラー例外がその理由を持つ。
//
// 対を守る仕組みが無いと、PROSE.md にだけ行が増えて会話の応答がその規則を失う。db4035c1 が
// 「予測可能な散文」を PROSE.md にだけ作り、terse.md は後追いで揃えた経緯がある。
//
// hook のテストではないため hooks/<subdir>/tests/ のどれにも属さず、hooks/tests/ に残す。
// .github/workflows/test.yml の node --test は hooks/**/tests/*.test.js で拾い、この ** は
// ゼロ階層にも一致する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const prose = readFileSync(join(root, "rules", "conventions", "PROSE.md"), "utf8");
const terse = readFileSync(join(root, "output-styles", "terse.md"), "utf8");

// 見出し行そのものと区切り行 (| --- |) を除いた本文行だけを数える。
const rowsUnder = (text, heading) => {
  const lines = text.split("\n");
  const start = lines.indexOf(`## ${heading}`);
  assert.notEqual(start, -1, `見出し「${heading}」が見つからない`);
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
  test(`${pair.prose} と ${pair.terse} の行数が一致する`, () => {
    const left = rowsUnder(prose, pair.prose);
    const right = rowsUnder(terse, pair.terse);
    assert.ok(left > 0, `${pair.prose} の行が 0`);
    assert.equal(
      right,
      left,
      `PROSE.md の ${pair.prose} が ${left} 行、terse.md の ${pair.terse} が ${right} 行。片方だけに行を足したときは同じコミットで両方を更新する`,
    );
  });
}
