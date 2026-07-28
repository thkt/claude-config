import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.mjs");

// U-005 のサイズ見張りと未索引 docs 列挙を検証する。ADR-0091「インデックスが 1 画面を
// 超えたら注入過多の兆候として見張る」を行数閾値としてレポート化した result.size と、
// index のどの行からも参照されない docs 配下の md を列挙する result.unreferenced を
// checkIndex({ table, exists, trackedFiles }) の戻り値に期待する。

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
