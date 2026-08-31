// tsconfig.json が何を型検査の対象に含めるかを、実際に tsc を実行して検証する。
// tsc --listFilesOnly は「コンパイルに含まれるファイル名を表示して終了する」公式オプション
// (`tsc --help --all` で確認済み)。設定ファイルの include/exclude を自前で再実装しない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..", "..");
const TSC_BIN = path.join(ROOT, "node_modules", ".bin", "tsc");
const TSCONFIG = path.join(ROOT, "tsconfig.json");

// workflows 配下に .ts が型検査対象に含まれることを、workflows/tests/fixtures/
// に常設したフィクスチャで確認する (テスト実行のたびに生成/削除すると
// サンドボックス環境で workflows/ 配下への書き込みが EPERM になるため常設ファイルにした)。

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function listTypeCheckedFiles() {
  const output = execFileSync(TSC_BIN, ["-p", TSCONFIG, "--listFilesOnly"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(toPosix)
    .filter((file) => !file.includes("/node_modules/"));
}

test("型検査の対象集合が skills/*/test/cases 配下の .ts を 1 件も含まない", () => {
  const files = listTypeCheckedFiles();
  const skillsTestCaseFiles = files.filter((file) => /\/skills\/[^/]+\/test\/cases\//.test(file));
  assert.deepEqual(skillsTestCaseFiles, []);
});

test("型検査の対象集合が workflows 配下の .ts を含む", () => {
  const files = listTypeCheckedFiles();
  const workflowsFiles = files.filter((file) => file.includes("/workflows/"));
  assert.ok(workflowsFiles.length > 0);
});
