import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initRepo } from "./_git-fixture.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.js");

// パーサは `|` 始まりの行を集めて先頭 2 行を無条件に読み飛ばす。ヘッダーが 2 行でなければ
// データ行を 1 つ食うか、区切り行を glob "---" の幽霊行として拾う。
test("index が無いとき、ヘッダー 2 行と採用行だけを持つ表が作られる", async () => {
  const { appendRows } = await import(scriptPath);

  const written = appendRows("", [
    { glob: "src/*.tsx", description: "コンポーネント規約", path: "docs/component.md" },
  ]);

  assert.deepEqual(written.trimEnd().split("\n"), [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| `src/*.tsx` | コンポーネント規約 | docs/component.md |",
  ]);
});

test("glob は inline code で囲んで書かれ、囲まれた行も囲まれていない行も同じ glob として読める", async () => {
  // 裸で置くと markdown formatter が `*` を強調記号と解釈してエスケープし、`agents/**/*.md`
  // が `agents/\*_/_.md` に化けて全行が対応外になる。既存の裸の行も読めるよう後方互換にする。
  const { appendRows, checkIndex } = await import(scriptPath);

  const written = appendRows("", [
    { glob: "agents/**/*.md", description: "規約", path: "docs/a.md" },
  ]);
  assert.match(written, /\| `agents\/\*\*\/\*\.md` \|/);

  const bare = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| agents/**/*.md | 規約 | docs/a.md |",
  ].join("\n");
  const deps = { exists: () => true, trackedFiles: ["agents/critics/critic-design.md"] };
  assert.equal(checkIndex({ table: written, ...deps }).noMatch.length, 0, "囲まれた行が一致する");
  assert.equal(checkIndex({ table: bare, ...deps }).noMatch.length, 0, "裸の行も一致する");
});

test("既存 index への追記でヘッダーが重複せず、既存行が残る", async () => {
  const { appendRows } = await import(scriptPath);
  const existing = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.ts | 既存の規約 | docs/existing.md |",
  ].join("\n");

  const written = appendRows(existing, [
    { glob: "src/*.tsx", description: "追加の規約", path: "docs/added.md" },
  ]);

  assert.deepEqual(written.trimEnd().split("\n"), [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.ts | 既存の規約 | docs/existing.md |",
    "| `src/*.tsx` | 追加の規約 | docs/added.md |",
  ]);
});

test("--apply で書いた index を検査すると採用行が drift 無しで読み戻せる", () => {
  const dir = initRepo("apply");
  const indexPath = join(dir, "docs", "REFERENCE_INDEX.md");
  const rows = [{ glob: "src/*.tsx", description: "規約", path: "docs/component.md" }];

  execFileSync("node", [scriptPath, "--apply", indexPath, JSON.stringify(rows)], { cwd: dir });

  // 書いた表をそのまま検査に通し、行が 1 本のデータ行として読めることを確かめる。
  const written = readFileSync(indexPath, "utf8");
  const report = JSON.parse(
    execFileSync(
      "node",
      [
        "-e",
        `import("${scriptPath}").then((m) => {
      const r = m.checkIndex({
        table: ${JSON.stringify(written)},
        exists: () => true,
        trackedFiles: ["src/button.tsx"],
      });
      process.stdout.write(JSON.stringify(r));
    })`,
      ],
      { cwd: dir, encoding: "utf8" },
    ),
  );

  assert.equal(report.dangling.length, 0);
  assert.equal(report.noMatch.length, 0);
  assert.equal(report.unsupported.length, 0);
  assert.equal(report.size.lines, 3);
});
