// U-005: code.js の red-failed 終端 return が why で理由を伝える。
// T-005 red agent が null を返す時、stopped が red-failed の返り値に why が含まれる。
// contract: workflows/code.js の unit-failed 終端 return (why "the implement agent returned
// no result") に従い、red-failed の終端 return へ同型の why を追加する。why の文字列値は
// EN/JA で localized される (EN "the ... returned no result" / JA "... が結果を返さなかった")
// ため、本 test は文字列内容でなく why の存在・型と stopped トークン ("red-failed") だけを
// 検査し、EN 版と .ja 版で同一内容にする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const codeJs = join(here, "..", "..", "code.js");

// tests を持つ unit は Red -> Green 経路を通る。red agent が null を返すと red2 は呼ばれず
// (red && !red.red_confirmed が短絡)、if (!red) が red-failed の終端 return を発火させる。
const plan = {
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "sample goal",
      files: ["sample.js"],
      contract: "sample contract",
      tests: [{ id: "T-001", name: "sample spec statement" }],
    },
  ],
};

// red: label で null を返し、red agent が結果を返さない状況を再現する。
const redNullStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label === "reference-index") return { found: false, table: "" };
  if (label.startsWith("red:")) return null;
  throw new Error(`unexpected label: ${label}`);
};

test("red agent が null を返す時、stopped が red-failed の返り値に why が含まれる", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan, repo: "" },
    stubs: { agent: redNullStub },
  });
  assert.equal(result.stopped, "red-failed", "red が null なら red-failed で停止する");
  assert.ok(result.why, "red-failed の返り値に why が含まれる");
  assert.equal(typeof result.why, "string", "why は理由を伝える文字列");
});

// reader agent (label: reference-index, DR-0091) の例外や、読めた表の部分解析失敗で
// run 全体を止めない。WORKFLOWS.md § Degradation recording の要求どおり、損失は粒度付きで
// 残す。契約: anomalies の要素形 {unit, kind, notes} は変えず、run 級 (特定 unit に属さない)
// anomaly は unit に固定値 "run" を入れる。tests が空の 1 unit (直接実装 1 段) を使い、
// reader / 表解析の degradation だけを最短経路で観測する。
const directImplPlan = {
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "docs goal",
      files: ["sample.js"],
      contract: "docs contract",
      tests: [],
      seam: false,
    },
  ],
};

// reference-index だけ例外を投げ、他 label は直接実装 1 段が走り切るのに必要な最小の応答を返す。
// 未知 label は throw する (code.reference.test.js と同じ形)。
const readerThrowsStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label === "reference-index") throw new Error("reader agent boom");
  if (label.startsWith("impl:")) return { green: true, notes: "", deferred: [] };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

test("reader agent の例外時に注入なしで走り切り理由が anomaly に記録される", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: directImplPlan, repo: "" },
    stubs: { agent: readerThrowsStub },
  });

  assert.deepEqual(
    result.completed,
    ["U-1"],
    "reader agent が例外を投げても run は止まらず unit の実装まで走り切る",
  );

  const implCall = calls.agent.find((c) => (c.opts.label ?? "") === "impl:U-1");
  assert.ok(implCall, "impl step は reader agent の例外後も呼ばれる");
  assert.doesNotMatch(
    implCall.prompt,
    /reference-index/,
    "reader agent が例外なら reference-index の注入ブロックが impl prompt に無い (注入なし)",
  );

  const readerAnomaly = result.anomalies.find((a) => a.kind === "reader-failed");
  assert.ok(readerAnomaly, "reader agent の例外が anomaly (kind: reader-failed) として記録される");
  assert.equal(readerAnomaly.unit, "run", 'run 級の anomaly は unit に固定値 "run" を入れる');
  assert.match(
    readerAnomaly.notes,
    /reader agent boom/,
    "anomaly の notes に例外の理由 (エラーメッセージ) が残る",
  );
});

// reference-index 自体は読めるが、表の 1 行が壊れている (セル数が 3 でない) 状況。
// 総データ行 3 行のうち 1 行が壊れているため、解析済みは 2 行。
const partialTable =
  "| glob | description | path |\n" +
  "| --- | --- | --- |\n" +
  "| a.js | desc a | docs/a.md |\n" +
  "| bad.js | 壊れた行 (セル数不足) |\n" +
  "| c.js | desc c | docs/c.md |\n";

const partialTableStub = (prompt, opts) => {
  const label = opts.label ?? "";
  if (label === "reference-index") return { found: true, table: partialTable };
  if (label.startsWith("impl:")) return { green: true, notes: "", deferred: [] };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

test("表の解析が部分的に失敗したとき解析済み行数と総行数が log に出る", async () => {
  const { logs } = await runWorkflow(codeJs, {
    args: { plan: directImplPlan, repo: "" },
    stubs: { agent: partialTableStub },
  });

  assert.ok(
    logs.some((entry) => /2\s*\/\s*3/.test(entry)),
    "解析済み行数 (2) と総行数 (3) が log に出る",
  );
});
