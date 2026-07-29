import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scriptPath = join(root, "skills", "stock", "scripts", "check-index.js");

// exists / trackedFiles を注入するのは、実 fs / git ls-files を呼ばずに判定ロジックだけを
// 固定 fixture で検証するため (argv/git 連携は check-index.cli.test.js が担う)。

test("リファレンスパスが実在しない行が dangling-path として報告され exit code が非ゼロになる", async () => {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.tsx | コンポーネント規約 | docs/does-not-exist.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: (path) => path !== "docs/does-not-exist.md",
    trackedFiles: ["src/button.tsx"],
  });

  assert.equal(result.dangling.length, 1);
  assert.equal(result.dangling[0].path, "docs/does-not-exist.md");
  assert.notEqual(result.exitCode, 0);
});

test("どの tracked ファイルにも一致しない glob 行が no-match の警告として報告される", async () => {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.foo | 一致しない拡張子 | docs/existing.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/button.tsx"],
  });

  assert.equal(result.noMatch.length, 1);
  assert.equal(result.noMatch[0].glob, "src/*.foo");
  assert.equal(result.dangling.length, 0);
  assert.equal(result.exitCode, 0);
});

test("`-` 行と未対応メタ文字の行は drift として報告されず未対応は unsupported として別掲される", async () => {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| - | 無条件候補。読むかは判断による | docs/candidate.md |",
    "| src/** | 裸の double star は未対応 | docs/unsupported.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/anything.tsx"],
  });

  assert.equal(result.dangling.length, 0);
  assert.equal(result.noMatch.length, 0);
  assert.equal(result.unsupported.length, 1);
  assert.equal(result.unsupported[0].glob, "src/**");
  assert.equal(result.exitCode, 0);
});

test("ずれの無い index では報告 0 件で exit 0 になる", async () => {
  const { checkIndex } = await import(scriptPath);
  const table = [
    "| glob | description | path |",
    "| --- | --- | --- |",
    "| src/*.tsx | コンポーネント規約 | docs/existing.md |",
  ].join("\n");

  const result = checkIndex({
    table,
    exists: () => true,
    trackedFiles: ["src/button.tsx"],
  });

  assert.equal(result.dangling.length, 0);
  assert.equal(result.noMatch.length, 0);
  assert.equal(result.exitCode, 0);
});
