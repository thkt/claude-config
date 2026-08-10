// 本番サンドボックスが持たないグローバルを、テスト実行からも同じ形で欠かせることを固定
// する。ここが緩むと、本番で落ちる script がテストでは通る状態に戻る。供給されるものと
// 塞がれるものの一覧は rules/conventions/WORKFLOWS.md の Script evaluation form にある。
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRODUCTION_GLOBALS, runWorkflow } from "../run-workflow.js";

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

test("T-008 返り値に置いた Map と Set と Date と RegExp は、本番の JSON 化と同じく空オブジェクトになる", async () => {
  await withScript(
    "return { map: new Map([['k', 'v']]), set: new Set([1]), date: new Date(0), re: /x/g, plain: { a: 1 }, arr: [1, 2] };",
    async (path) => {
      const { result } = await runWorkflow(path, {});
      assert.deepEqual(result.map, {}, "Map は本番と同じく空オブジェクトで届く");
      assert.deepEqual(result.set, {}, "Set は本番と同じく空オブジェクトで届く");
      assert.deepEqual(result.date, {}, "Date は本番と同じく空オブジェクトで届く");
      assert.deepEqual(result.re, {}, "RegExp は本番と同じく空オブジェクトで届く");
      assert.deepEqual(result.plain, { a: 1 }, "plain object は中身を保ったまま届く");
      assert.deepEqual(result.arr, [1, 2], "array は中身を保ったまま届く");
    },
  );
});

// 一覧に名前を足しても注入は増えないので、供給を書き足すまでここが赤くなる。console だけ
// は ambient な vm の値として object を返すため空回りし、その実質は T-011 が守る。
test("T-009 本番が供給するグローバルは harness からも参照できる", async () => {
  for (const name of PRODUCTION_GLOBALS) {
    await withScript(`return typeof ${name};`, async (path) => {
      const { result } = await runWorkflow(path, {});
      assert.notEqual(result, "undefined", `${name} が供給される`);
    });
  }
});

// budget.total を見て分岐する script が、テストでだけ別の枝へ入ることを防ぐ。
test("T-010 budget は target 未設定の状態を返す", async () => {
  await withScript(
    "return { total: budget.total, spent: budget.spent(), remaining: budget.remaining() };",
    async (path) => {
      const { result } = await runWorkflow(path, {});
      assert.equal(result.total, null, "target 未設定なので total は null");
      assert.equal(result.spent, 0, "消費はまだ無い");
      assert.equal(result.remaining, Infinity, "total が null のとき remaining は Infinity");
    },
  );
});

// ambient な vm の console のままだと、出力がどこにも現れないままテストが通る。
test("T-011 console の出力は logs に届き、warn と error は接頭辞を持つ", async () => {
  await withScript(
    "console.log('plain', { a: 1 }); console.warn('careful'); console.error('broken'); return 1;",
    async (path) => {
      const { logs } = await runWorkflow(path, {});
      assert.deepEqual(logs, ['plain {"a":1}', "[warn] careful", "[error] broken"]);
    },
  );
});

test("T-012 setTimeout は待ったあと再開し、clearTimeout はその再開を取り消す", async () => {
  await withScript(
    "const fired = await new Promise((r) => { setTimeout(() => r('fired'), 0); });" +
      "const canceled = await new Promise((r) => { const id = setTimeout(() => r('fired'), 0); clearTimeout(id); setTimeout(() => r('canceled'), 0); });" +
      "return { fired, canceled };",
    async (path) => {
      const { result } = await runWorkflow(path, {});
      assert.equal(result.fired, "fired", "setTimeout のコールバックが走る");
      assert.equal(result.canceled, "canceled", "clearTimeout したコールバックは走らない");
    },
  );
});
