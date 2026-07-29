import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const scriptPath = join(root, ".ja", "skills", "stock", "scripts", "check-index.js");

// result.size は ADR-0091「インデックスが 1 画面を超えたら注入過多の兆候として見張る」を
// 行数閾値に落としたもの。

test("表の行数が 30 行までは size 警告が立たず、31 行で立つ", async () => {
  const { checkIndex } = await import(scriptPath);
  const header = ["| glob | description | path |", "| --- | --- | --- |"];
  const tableOf = (dataRowCount) =>
    [
      ...header,
      ...Array.from(
        { length: dataRowCount },
        (_, i) => `| src/*.tsx | 規約 ${i} | docs/existing.md |`,
      ),
    ].join("\n");
  const deps = { exists: () => true, trackedFiles: ["src/button.tsx"] };

  const atThreshold = checkIndex({ table: tableOf(28), ...deps });
  assert.equal(atThreshold.size.lines, 30);
  assert.equal(atThreshold.size.warning, false);

  const overThreshold = checkIndex({ table: tableOf(29), ...deps });
  assert.equal(overThreshold.size.lines, 31);
  assert.equal(overThreshold.size.warning, true);
});

test("表の前後の散文行は size の行数に数えられない", async () => {
  // ADR-0091 が見張るのは index 表のサイズ。code.js の reader も表本文だけを抽出するため、
  // ファイル全行でなく `|` で始まる表行だけを数える。
  const { checkIndex } = await import(scriptPath);
  const prose = ["# REFERENCE_INDEX", "", "説明の散文が表の前後に並ぶ。", ""];
  const tableLines = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.tsx | 規約 | docs/existing.md |",
  ];
  const table = [...prose, ...tableLines, "", "末尾の散文。"].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/button.tsx"],
  });

  assert.equal(result.size.lines, tableLines.length);
});

test("監査対象の index ファイル自身は unreferenced に載らない", async () => {
  // index は自分の path 列に自分を載せられないため、除外しないと恒久的に unreferenced に残る。
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.tsx | コンポーネント規約 | docs/referenced.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/button.tsx", "docs/referenced.md", "docs/REFERENCE_INDEX.md"],
    indexPath: "docs/REFERENCE_INDEX.md",
  });

  assert.deepEqual(result.unreferenced, []);
});

test("実装 agent に読ませる規約でない docs は候補から外れる", async () => {
  // 決定記録は過去の判断の経緯で、実装時に読ませると 1 画面の閾値を即座に食い潰す。
  const { checkIndex } = await import(scriptPath);
  const table = ["| glob | description | path |", "| --- | --- | --- |"].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: [
      "docs/decisions/0091-adopt-flat-index.md",
      "docs/decisions/README.md",
      "docs/wiki/_candidates.md",
      "docs/conventions/component-tsx.md",
    ],
  });

  assert.deepEqual(result.unreferenced, ["docs/conventions/component-tsx.md"]);
});

test("index のどの行からも参照されない docs 配下の md が unreferenced として列挙される", async () => {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.tsx | コンポーネント規約 | docs/referenced.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/button.tsx", "docs/referenced.md", "docs/orphan.md"],
  });

  assert.deepEqual(result.unreferenced, ["docs/orphan.md"]);
});
