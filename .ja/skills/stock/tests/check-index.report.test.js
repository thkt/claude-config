import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const scriptPath = join(root, ".ja", "skills", "stock", "scripts", "check-index.js");

// result.size は ADR-0091「インデックスが 1 画面を超えたら注入過多の兆候として見張る」を
// 行数閾値に落としたもの。

test("行数が閾値を超えると size 警告がレポートに載る", async () => {
  const { checkIndex } = await import(scriptPath);
  const header = ["| glob | description | path |", "| --- | --- | --- |"];
  const dataRows = Array.from(
    { length: 200 },
    (_, i) => `| src/*.tsx | 規約 ${i} | docs/existing.md |`,
  );
  const table = [...header, ...dataRows].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/button.tsx"],
  });

  assert.equal(result.size.lines, table.split("\n").length);
  assert.equal(result.size.warning, true);
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
  assert.equal(result.size.warning, false);
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
