import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initRepo, commitAll } from "./_git-fixture.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.js");

// 実 git リポジトリを立てて CLI プロセスを起動し、argv で受けた repo root と index パスの
// 解決結果が git の状態と一致するかを見る (判定ロジック単体は check-index.test.js)。

function runCli(repoRootArg, indexPath, cwd) {
  const stdout = execFileSync("node", [scriptPath, repoRootArg, indexPath], {
    cwd,
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

test("サブディレクトリから起動しても repo root 起動と同一のレポートが返る", () => {
  const dir = initRepo("cli");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  mkdirSync(join(dir, "sub"), { recursive: true });
  writeFileSync(join(dir, "src", "button.tsx"), "export const Button = () => null;\n");
  writeFileSync(join(dir, "docs", "reference.md"), "# reference\n");
  const indexPath = join(dir, "docs", "REFERENCE_INDEX.md");
  writeFileSync(
    indexPath,
    [
      "| glob | description | path |",
      "| --- | --- | --- |",
      "| src/*.tsx | ボタン規約 | docs/reference.md |",
    ].join("\n"),
  );
  commitAll(dir);

  const fromRoot = runCli(".", indexPath, dir);
  const fromSubdir = runCli(".", indexPath, join(dir, "sub"));

  assert.deepEqual(fromSubdir, fromRoot);
});

test("git 管理外のファイルは glob 照合の対象にならない", () => {
  const dir = initRepo("cli");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "reference.md"), "# reference\n");
  const indexPath = join(dir, "docs", "REFERENCE_INDEX.md");
  // glob は widget.tsx にしか一致しない。widget.tsx をディスク上に置くが git add はせず
  // 未追跡のまま残すので、tracked ファイル一覧 (git ls-files) にはどの行の一致先も存在しない。
  writeFileSync(
    indexPath,
    [
      "| glob | description | path |",
      "| --- | --- | --- |",
      "| src/widget.tsx | 未追跡ファイル | docs/reference.md |",
    ].join("\n"),
  );
  commitAll(dir);

  writeFileSync(join(dir, "src", "widget.tsx"), "export const Widget = () => null;\n");

  const result = runCli(".", indexPath, dir);

  assert.equal(result.dangling.length, 0);
  assert.equal(result.noMatch.length, 1);
  assert.equal(result.noMatch[0].glob, "src/widget.tsx");
});
