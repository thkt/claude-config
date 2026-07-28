import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initRepo, commitAll } from "./_git-fixture.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const scriptPath = join(root, ".ja", "skills", "stock", "scripts", "check-index.js");

// 他のテストが個別に緑にした判定を、実 git リポジトリへの 1 回の子プロセス実行で通しに
// 繋げて見る。区分ごとの単体検証はそれぞれのテストが持つ。

// execFileSync は非ゼロ終了で例外を投げるため、exit code 自体を見る検証には使えない。
// spawnSync は終了コードを status として返すので、0 と非ゼロを同じ形で受け取れる。
function runCli(repoRootArg, indexPath, cwd) {
  const result = spawnSync("node", [scriptPath, repoRootArg, indexPath], {
    cwd,
    encoding: "utf8",
  });
  return { status: result.status, json: JSON.parse(result.stdout) };
}

test("dangling/no-match/unsupported/unreferenced/size を同時に仕込んだ fixture への 1 回の実行で全区分が件数どおり返る", () => {
  const dir = initRepo("e2e");
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });

  // dangling 用: glob は tracked file と一致させ noMatch に混ざらないようにし、
  // path は存在しないファイルを指して dangling だけを単独で発生させる。
  writeFileSync(join(dir, "src", "a.tsx"), "export const A = () => null;\n");
  // no-match / unsupported の参照先として実在させる。
  writeFileSync(join(dir, "docs", "existing.md"), "# existing\n");
  // どの行からも参照されない docs 配下の md (unreferenced として拾われる想定)。
  writeFileSync(join(dir, "docs", "orphan.md"), "# orphan\n");

  const header = ["| glob | description | path |", "| --- | --- | --- |"];
  const dangling = ["| src/a.tsx | dangling 検証 | docs/missing-target.md |"];
  const noMatch = ["| src/nomatch.foo | no-match 検証 | docs/existing.md |"];
  const unsupported = ["| src/** | unsupported 検証 (裸の double star) | docs/existing.md |"];
  // index ファイル自身は CLI が indexPath として除外するため、自己参照行は要らない。
  // size 警告 (閾値 30 行, ADR-0091) を超えさせるための埋め草行。drift 判定に影響しない
  // よう glob は `-` に固定する。
  const padding = Array.from({ length: 30 }, (_, i) => `| - | 埋め草 ${i} | docs/existing.md |`);
  const table = [...header, ...dangling, ...noMatch, ...unsupported, ...padding].join("\n");
  const indexPath = join(dir, "docs", "REFERENCE_INDEX.md");
  writeFileSync(indexPath, table);
  commitAll(dir);

  const { status, json } = runCli(".", indexPath, dir);

  assert.equal(json.dangling.length, 1);
  assert.equal(json.dangling[0].path, "docs/missing-target.md");
  assert.equal(json.noMatch.length, 1);
  assert.equal(json.noMatch[0].glob, "src/nomatch.foo");
  assert.equal(json.unsupported.length, 1);
  assert.equal(json.unsupported[0].glob, "src/**");
  assert.deepEqual(json.unreferenced, ["docs/orphan.md"]);
  assert.equal(json.size.lines, table.split("\n").length);
  assert.equal(json.size.warning, true);
  assert.notEqual(status, 0);
  assert.equal(json.exitCode, status);
});

test("dangling の有無だけを変えた 2 つの fixture で exit code が 0 と非ゼロに分かれる", () => {
  function buildFixture({ withDangling }) {
    const dir = initRepo("e2e");
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "src", "a.tsx"), "export const A = () => null;\n");
    if (!withDangling) {
      writeFileSync(join(dir, "docs", "target.md"), "# target\n");
    }
    const indexPath = join(dir, "docs", "REFERENCE_INDEX.md");
    writeFileSync(
      indexPath,
      [
        "| glob | description | path |",
        "| --- | --- | --- |",
        "| src/a.tsx | dangling 有無の切り替え | docs/target.md |",
      ].join("\n"),
    );
    commitAll(dir);
    return { dir, indexPath };
  }

  const withDangling = buildFixture({ withDangling: true });
  const withoutDangling = buildFixture({ withDangling: false });

  const danglingResult = runCli(".", withDangling.indexPath, withDangling.dir);
  const cleanResult = runCli(".", withoutDangling.indexPath, withoutDangling.dir);

  assert.notEqual(danglingResult.status, 0);
  assert.equal(cleanResult.status, 0);
});
