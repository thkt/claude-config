// U-005: codex-herdr 経路で codex が書いた JSON 応答を、それを読むだけの Claude agent (courier) が
// 既存の RED_SCHEMA / GREEN_SCHEMA として返す。courier への指示 (初回・retry のいずれも) には応答を
// 書き込むファイルのパスが含まれる。".json" を含む文字列かどうかで検証し、正確なパス形式は実装に委ねる。
// courier が返した red_confirmed / green の型が boolean でないときは、workflow はそのまま処理を進めず
// stopped: "courier-type-mismatch" を返す (issue #367: codex が `{"red_confirmed": "false"}` と書くと
// 文字列は truthy なので既存の `if (!red.red_confirmed)` を素通りする懸念に対応する)。指示したパスに
// ファイルが無いとき (courier が red_confirmed: false とその経緯を notes に書いて返すとき) は、既存の
// 1 回だけの retry がそのファイルの再書き込みを指示する内容を持つ。
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const codeJs = join(here, "..", "..", "code.js");

const TESTER_PANE_ID = "pane-tester-1";
const CODER_PANE_ID = "pane-coder-1";

const tddPlan = {
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

// pane のライフサイクル呼び出し (herdr-check / pane-start / pane-close / verify) は既存 unit 群の
// テストと同じ形で固定応答を返す。実装ステップの応答だけを extra で差し替える。未定義の label は
// 例外を投げ、想定外の呼び出しが undefined を返して見過ごされることを防ぐ。
const paneLifecycleStub =
  (extra = {}) =>
  (prompt, opts) => {
    const label = opts.label ?? "";
    if (label === "herdr-check") return { herdr_available: true, notes: "" };
    if (label === "pane-start:tester") return { pane_id: TESTER_PANE_ID, started: true, notes: "" };
    if (label === "pane-start:coder") return { pane_id: CODER_PANE_ID, started: true, notes: "" };
    if (label === "pane-close:tester") return { closed: true, notes: "" };
    if (label === "pane-close:coder") return { closed: true, notes: "" };
    if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
    if (typeof extra[label] === "function") return extra[label]();
    throw new Error(`unexpected label: ${label}`);
  };

test("T-014 the courier agent reads the JSON codex wrote and returns a result satisfying RED_SCHEMA", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: tddPlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: {
      agent: paneLifecycleStub({
        "red:U-1": () => ({
          red_confirmed: true,
          test_files: ["t.test.js"],
          notes: "",
          evidence: [],
        }),
        "green:U-1": () => ({ green: true, notes: "", deferred: [] }),
      }),
    },
  });

  const red = calls.agent.find((c) => c.opts.label === "red:U-1");
  assert.ok(red, "the red step for U-1 runs");
  assert.ok(
    /\.json/i.test(red.prompt),
    "the courier's instruction names the response file codex must write its JSON to",
  );
  assert.deepEqual(
    result.completed,
    ["U-1"],
    "a well-typed RED_SCHEMA result from the courier lets the unit complete normally",
  );
});

test("T-015 a red_confirmed that is not a boolean returns stopped", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan: tddPlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: {
      agent: paneLifecycleStub({
        // codex がファイルに `{"red_confirmed": "false"}` と書くと、JS の truthy 判定では文字列が
        // そのまま真になる。型検証がなければ green:U-1 まで素通りしてしまう。
        "red:U-1": () => ({
          red_confirmed: "false",
          test_files: [],
          notes: "",
          evidence: [],
        }),
        "green:U-1": () => ({ green: true, notes: "", deferred: [] }),
      }),
    },
  });

  assert.equal(
    result.stopped,
    "courier-type-mismatch",
    "a non-boolean red_confirmed stops the run instead of being coerced by truthiness",
  );
  assert.equal(typeof result.why, "string", "the stopped return states why in a string");
  assert.ok(result.why.length > 0, "why is not empty");
  assert.ok(
    !(result.completed || []).includes("U-1"),
    "the unit never reaches completed when its type is wrong",
  );
});

test("T-016 a green that is not a boolean returns stopped", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan: tddPlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: {
      agent: paneLifecycleStub({
        "red:U-1": () => ({
          red_confirmed: true,
          test_files: ["t.test.js"],
          notes: "",
          evidence: [],
        }),
        // codex がファイルに `{"green": "true"}` と書いた場合の同じ懸念を green 側でも確認する。
        "green:U-1": () => ({ green: "true", notes: "", deferred: [] }),
      }),
    },
  });

  assert.equal(
    result.stopped,
    "courier-type-mismatch",
    "a non-boolean green stops the run instead of being coerced by truthiness",
  );
  assert.equal(typeof result.why, "string", "the stopped return states why in a string");
  assert.ok(result.why.length > 0, "why is not empty");
  assert.ok(
    !(result.completed || []).includes("U-1"),
    "the unit never reaches completed when its type is wrong",
  );
});

test("T-017 a missing file at the instructed path asks for a rewrite exactly once", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: tddPlan, repo: "/abs/target-repo", implementer: "codex-herdr" },
    stubs: {
      agent: paneLifecycleStub({
        "red:U-1": () => ({
          red_confirmed: false,
          test_files: [],
          notes: "no response file found at the instructed path",
          evidence: [],
        }),
        "red2:U-1": () => ({
          red_confirmed: false,
          test_files: [],
          notes: "still no response file found",
          evidence: [],
        }),
      }),
    },
  });

  const attempts = calls.agent.filter(
    (c) => c.opts.label === "red:U-1" || c.opts.label === "red2:U-1",
  );
  assert.equal(
    attempts.length,
    2,
    "the courier is asked to read the file exactly twice: once, then a single retry",
  );
  const retry = calls.agent.find((c) => c.opts.label === "red2:U-1");
  assert.ok(retry, "the retry after a missing file runs");
  assert.ok(
    /\.json/i.test(retry.prompt),
    "the retry instructs writing the response file again, naming the same path",
  );
  assert.deepEqual(
    result.skipped,
    ["U-1"],
    "Red stays unconfirmed after the single retry, so the unit is skipped rather than looping again",
  );
});
