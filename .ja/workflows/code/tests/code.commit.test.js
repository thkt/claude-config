// ADR-0088 の unit ごとのコミット。コミットメッセージと staging 範囲は agent の裁量に
// 委ねると壊れても静かなので、trailer の中身と staging 禁止事項を prompt 上で固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflow } from "../../_lib/run-workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..", "..");
const codeJs = join(here, "..", "..", "code.js");

const plan = {
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "sample goal",
      files: ["sample.js"],
      contract: "sample contract",
      tests: [{ id: "T-001", name: "sample spec statement" }],
      seam: false,
    },
  ],
};

// tests が空の unit は直接実装 1 段。
const noTestPlan = {
  test_command: "echo test",
  units: [
    {
      id: "U-1",
      goal: "docs goal",
      files: ["README.md"],
      contract: "docs contract",
      tests: [],
      seam: false,
    },
  ],
};

// commit agent の戻り値だけ差し替えられる happy stub。
const stubWith = (commitResult) => (prompt, opts) => {
  const label = opts.label ?? "";
  if (label.startsWith("commit:")) return commitResult;
  if (label.startsWith("red:"))
    return { red_confirmed: true, test_files: ["t.test.js"], notes: "" };
  if (label.startsWith("green:")) return { green: true, notes: "" };
  if (label.startsWith("impl:")) return { green: true, notes: "" };
  if (label === "verify") return { tests_pass: true, gates_pass: true, output_tail: "" };
  throw new Error(`unexpected label: ${label}`);
};

const committed = { committed: true, subject: "feat: sample subject", left_unstaged: [] };

const commitCalls = (calls) =>
  calls.agent.filter((c) => (c.opts.label ?? "").startsWith("commit:"));

test("commit 未指定なら commit agent を呼ばず既存挙動 (working tree 未コミット) のまま完走する", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "" },
    stubs: { agent: stubWith(committed) },
  });
  assert.equal(commitCalls(calls).length, 0, "commit 未指定で commit agent が呼ばれない");
  assert.deepEqual(result.commits, [], "戻り値 commits は空配列");
  assert.deepEqual(result.completed, ["U-1"], "unit は通常どおり完了する");
});

test("commit: true で unit ごとに commit agent が 1 回走り、戻り値 commits に unit id と subject が載る", async () => {
  const twoUnits = {
    test_command: "echo test",
    units: [
      plan.units[0],
      { ...plan.units[0], id: "U-2", tests: [{ id: "T-002", name: "second statement" }] },
    ],
  };
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: twoUnits, repo: "", commit: true },
    stubs: { agent: stubWith(committed) },
  });
  assert.deepEqual(
    commitCalls(calls).map((c) => c.opts.label),
    ["commit:U-1", "commit:U-2"],
    "unit ごとに 1 回、実装順に commit agent が走る",
  );
  assert.deepEqual(
    result.commits,
    [
      { unit: "U-1", subject: "feat: sample subject" },
      { unit: "U-2", subject: "feat: sample subject" },
    ],
    "戻り値 commits に unit id と subject が載る",
  );
  assert.equal(result.anomalies.length, 0, "成功コミットは anomaly を作らない");
});

test("commit prompt が plan 由来の trailer ブロックを逐語コピー指示付きで運ぶ", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "", commit: true, issue: "123" },
    stubs: { agent: stubWith(committed) },
  });
  const prompt = commitCalls(calls)[0].prompt;
  assert.match(prompt, /^Unit: U-1$/m, "Unit trailer が載る");
  assert.match(
    prompt,
    /^Contract: sample contract$/m,
    "Contract trailer が plan の contract を運ぶ",
  );
  assert.match(prompt, /^Tests: T-001$/m, "Tests trailer が T-NNN を運ぶ");
  assert.match(prompt, /^Seam: false$/m, "Seam trailer が載る");
  assert.match(prompt, /^Issue: #123$/m, "issue 引数が Issue trailer になる");
  assert.match(prompt, /逐語でコピー/, "trailer ブロックの逐語コピー指示が載る");
  assert.equal(commitCalls(calls)[0].opts.model, "haiku", "commit agent は haiku 固定");
});

// issue 番号は "#123" 形でも渡りうる。trailer 側で "##123" にならないことを固定する。
test("issue が #付きで渡っても Issue trailer は # を重ねない", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "", commit: true, issue: "#123" },
    stubs: { agent: stubWith(committed) },
  });
  assert.match(commitCalls(calls)[0].prompt, /^Issue: #123$/m, "Issue trailer は #123");
});

test("issue 未指定なら Issue trailer を作らない", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "", commit: true },
    stubs: { agent: stubWith(committed) },
  });
  assert.doesNotMatch(commitCalls(calls)[0].prompt, /^Issue:/m, "Issue trailer が載らない");
});

// pre-existing な untracked を stage すると仕様書・調査メモ・ローカル設定が PR に漏れる。
// Ship 側と同じガードを commit agent 側にも複製することを固定する。
test("commit prompt に git add -A 禁止と untracked_baseline の never-stage 指示が載る", async () => {
  const { calls } = await runWorkflow(codeJs, {
    args: {
      plan,
      repo: "/abs/target-repo",
      commit: true,
      untracked_baseline: ["notes/local-memo.md"],
    },
    stubs: { agent: stubWith(committed) },
  });
  const prompt = commitCalls(calls)[0].prompt;
  assert.match(prompt, /git add -A/, "git add -A 禁止が載る");
  assert.match(prompt, /notes\/local-memo\.md/, "baseline の untracked path が never-stage に載る");
  assert.match(prompt, /git rev-parse --show-toplevel/, "repo 指定時は repo 確認ガードが載る");
});

// コミット失敗 (pre-commit gate ブロック等) で build 全体を止めない。作業はツリーに
// 残り、呼び出し側の最終コミットが拾う。落ちたこと自体は anomaly として PR に出す。
test("commit agent が committed: false を返すと stop せず anomaly (uncommitted) に記録する", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan, repo: "", commit: true },
    stubs: {
      agent: stubWith({ committed: false, subject: "", left_unstaged: ["gate blocked"] }),
    },
  });
  assert.equal(result.stopped, undefined, "コミット失敗で fail-close しない");
  assert.deepEqual(result.commits, [], "失敗したコミットは commits に載らない");
  assert.deepEqual(
    result.anomalies,
    [{ unit: "U-1", kind: "uncommitted", notes: "gate blocked" }],
    "kind: uncommitted の anomaly が理由付きで載る",
  );
});

test("commit agent が null を返しても stop せず anomaly (uncommitted) に記録する", async () => {
  const { result } = await runWorkflow(codeJs, {
    args: { plan, repo: "", commit: true },
    stubs: { agent: stubWith(null) },
  });
  assert.equal(result.stopped, undefined, "commit agent 不在でも fail-close しない");
  assert.equal(result.anomalies[0].kind, "uncommitted", "kind: uncommitted の anomaly が載る");
});

test("tests 空の直接実装 unit もコミットされ、Tests trailer は作られない", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan: noTestPlan, repo: "", commit: true },
    stubs: { agent: stubWith(committed) },
  });
  assert.equal(commitCalls(calls).length, 1, "直接実装 unit も commit agent が 1 回走る");
  assert.doesNotMatch(
    commitCalls(calls)[0].prompt,
    /^Tests:/m,
    "T-NNN が無い unit は Tests trailer 無し",
  );
  assert.deepEqual(
    result.commits.map((c) => c.unit),
    ["U-1"],
    "直接実装 unit が commits に載る",
  );
});

// Red 未確認 (既に実装済み) の unit は実装 step を飛ばすが、Red step が書いたテストは
// ツリーに残る。ここもコミット対象にして、次の unit のコミットへ混ざらないようにする。
test("Red 未確認で実装を飛ばした unit も Red が書いたテストファイルごとコミットされる", async () => {
  const { result, calls } = await runWorkflow(codeJs, {
    args: { plan, repo: "", commit: true },
    stubs: {
      agent: (prompt, opts) => {
        const label = opts.label ?? "";
        if (label.startsWith("red2:"))
          return { red_confirmed: false, test_files: ["t.test.js"], notes: "already implemented" };
        if (label.startsWith("red:"))
          return { red_confirmed: false, test_files: ["t.test.js"], notes: "passed unexpectedly" };
        return stubWith(committed)(prompt, opts);
      },
    },
  });
  const commit = commitCalls(calls)[0];
  assert.ok(commit, "Red 未確認 unit でも commit agent が走る");
  assert.match(commit.prompt, /t\.test\.js/, "Red が書いたテストファイルが staging 対象に載る");
  assert.deepEqual(
    result.anomalies.map((a) => a.kind),
    ["no-red"],
    "no-red anomaly だけが残り uncommitted は増えない",
  );
});

// unit-failed で停止しても、それまでの unit のコミットは呼び出し側から見えなければ
// 復旧の手がかりにならない。
test("unit-failed の終端 return にも commits が載る", async () => {
  const twoUnits = {
    test_command: "echo test",
    units: [
      plan.units[0],
      { ...plan.units[0], id: "U-2", tests: [{ id: "T-002", name: "second statement" }] },
    ],
  };
  const { result } = await runWorkflow(codeJs, {
    args: { plan: twoUnits, repo: "", commit: true },
    stubs: {
      agent: (prompt, opts) => {
        const label = opts.label ?? "";
        if (label.startsWith("green:") && label.endsWith("U-2"))
          return { green: false, notes: "x" };
        if (label.startsWith("green2:")) return { green: false, notes: "x" };
        return stubWith(committed)(prompt, opts);
      },
    },
  });
  assert.equal(result.stopped, "unit-failed", "U-2 の失敗で unit-failed になる");
  assert.deepEqual(
    result.commits.map((c) => c.unit),
    ["U-1"],
    "停止時も U-1 のコミットが戻り値に残る",
  );
});

test("静的 gate が JA / EN の code.js と本 test で pass する", () => {
  const targets = [
    join(root, ".ja", "workflows", "code.js"),
    join(root, "workflows", "code.js"),
    join(root, ".ja", "workflows", "code", "tests", "code.commit.test.js"),
    join(root, "workflows", "code", "tests", "code.commit.test.js"),
  ];
  for (const file of targets) {
    execFileSync("node", ["--check", file], { cwd: root });
  }
  execFileSync("npx", ["oxlint", ...targets], { cwd: root });
});
