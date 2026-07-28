import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.mjs");

// U-003 の argv/git 連携を検証する。U-002 (check-index.test.js) は exists/trackedFiles を
// 注入した固定 fixture で判定ロジックだけを見る一方、ここでは実 git リポジトリを立てて CLI
// プロセスを起動し、repo root と index パスを argv で受けた結果が git 状態と一致するかを見る。

function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), "check-index-cli-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  return dir;
}

function commitAll(dir) {
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: dir });
}

function runCli(repoRootArg, indexPath, cwd) {
  const stdout = execFileSync("node", [scriptPath, repoRootArg, indexPath], {
    cwd,
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

test("サブディレクトリから起動しても repo root 起動と同一のレポートが返る", () => {
  const dir = initRepo();
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
  const dir = initRepo();
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
