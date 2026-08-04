// 本番サンドボックスが持たないグローバルを、テスト実行からも同じ形で欠かせることを固定
// する。ここが緩むと、本番で落ちる script がテストでは通る状態に戻る。供給されるものと
// 塞がれるものの一覧は rules/conventions/WORKFLOWS.md の Script evaluation form にある。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWorkflow } from "../run-workflow.js";

// runWorkflow はファイルパスからソースを読む契約 (readFileSync) なので、script 本文を
// 一時ファイルへ書き出してから渡す。テストごとに専用の一時ディレクトリを使い、他テストの
// script ファイルと衝突しないようにする。
const withScript = async (source, run) => {
  const dir = mkdtempSync(join(tmpdir(), "run-workflow-test-"));
  const path = join(dir, "script.js");
  writeFileSync(path, source);
  try {
    return await run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("T-004 crypto を参照する script は ReferenceError で落ちる", async () => {
  await withScript("return crypto.randomUUID();", async (path) => {
    await assert.rejects(
      () => runWorkflow(path, {}),
      (err) => {
        assert.ok(err instanceof ReferenceError, "ReferenceError で落ちる");
        assert.match(err.message, /crypto is not defined/);
        return true;
      },
    );
  });
});

test("T-005 fetch と process と Buffer を参照する script も同じく落ちる", async () => {
  const cases = [
    { name: "fetch", source: "return fetch('https://example.com');" },
    { name: "process", source: "return process.version;" },
    { name: "Buffer", source: "return Buffer.from('x');" },
  ];
  for (const { name, source } of cases) {
    await withScript(source, async (path) => {
      await assert.rejects(
        () => runWorkflow(path, {}),
        (err) => {
          assert.ok(err instanceof ReferenceError, `${name} は ReferenceError で落ちる`);
          assert.match(err.message, new RegExp(`${name} is not defined`));
          return true;
        },
      );
    });
  }
});

test("T-006 Date.now を呼ぶ script は resume を理由に挙げる Error で落ちる", async () => {
  await withScript("return Date.now();", async (path) => {
    await assert.rejects(
      () => runWorkflow(path, {}),
      (err) => {
        // 部分一致だと harness が独自の言い回しに差し替わっても通ってしまう。実測した
        // 本番の文言そのものと突き合わせる。
        assert.equal(
          err.message,
          "Date.now() / new Date() are unavailable in workflow scripts (breaks resume). Stamp results after the workflow returns, or pass timestamps via args.",
          "本番サンドボックスと同じ文言で落ちる",
        );
        return true;
      },
    );
  });
});

test("T-007 引数つき new Date と Math.floor は落ちずに値を返す", async () => {
  await withScript(
    "return { time: new Date(0).getTime(), floor: Math.floor(3.7) };",
    async (path) => {
      const { result } = await runWorkflow(path, {});
      assert.equal(result.time, 0, "new Date(0) は落ちずに 1970-01-01 の epoch を返す");
      assert.equal(result.floor, 3, "Math.floor は落ちずに小数を切り捨てた値を返す");
    },
  );
});
